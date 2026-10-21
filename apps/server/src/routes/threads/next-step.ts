import { buildExecutionOptions } from "../../services/threads/thread-commands.js";
import { z } from "zod";
import {
  publicApiRoutes,
  typedRoutes,
  type PublicApiSchema,
} from "@bb/server-contract";
import type { NextStep, NextStepResult } from "@bb/domain";
import type { Hono } from "hono";
import {
  APP_SURFACE_HEADER_NAME,
  parseRequestAppSurface,
} from "@bb/config/app-surface";
import type { AppDeps } from "../../types.js";
import { ApiError } from "../../errors.js";
import { requirePublicThread } from "../../services/lib/entity-lookup.js";
import type { PluginService } from "../../services/plugins/plugin-service.js";
import { createThreadFromRequest } from "../../services/threads/thread-create.js";
import {
  acceptNextStep,
  dismissNextStep,
  getNextStep,
  linkNextStepResult,
  proposeNextStep,
  showNextStep,
  undoNextStep,
} from "../../services/threads/next-step.js";

async function callAutomation(
  plugins: PluginService,
  method: string,
  input: unknown,
) {
  const lookup = plugins.getRpcHandler("automations", method);
  if (lookup.outcome !== "found")
    throw new ApiError(
      409,
      "next_step_automations_unavailable",
      "Enable Automations to schedule this next step",
    );
  const result = await plugins.invokeRpcHandler(
    "automations",
    method,
    lookup.value,
    input,
    { kind: "client" },
  );
  if (!result.ok)
    throw new ApiError(
      409,
      "next_step_automation_failed",
      result.error.message,
    );
  return result.result;
}

async function executeNextStep(
  deps: AppDeps,
  plugins: PluginService,
  suggestion: NextStep,
): Promise<NextStepResult> {
  const thread = requirePublicThread(deps.db, suggestion.threadId);
  if (thread.environmentId === null)
    throw new ApiError(
      409,
      "next_step_environment_unavailable",
      "This thread needs an environment before starting the next step",
    );
  const execution = await buildExecutionOptions(
    deps,
    {},
    { threadId: thread.id },
  );
  if (suggestion.action.kind === "task") {
    const child = await createThreadFromRequest(deps, {
      projectId: thread.projectId,
      providerId: thread.providerId,
      parentThreadId: thread.id,
      title: suggestion.title,
      ...execution,
      origin: "app",
      startedOnBehalfOf: null,
      environment: { type: "reuse", environmentId: thread.environmentId },
      input: [
        {
          type: "text",
          text: suggestion.action.task.parallel
            ? `${suggestion.action.task.prompt}\n\nThis work may run in parallel. If independent subtasks need separate threads, create them under parent thread ${thread.id}.`
            : suggestion.action.task.prompt,
          mentions: [],
        },
      ],
    });
    const result: NextStepResult = { kind: "task", threadIds: [child.id] };
    linkNextStepResult(deps.db, { threadId: thread.id, result });
    return result;
  }
  const automation = suggestion.action.automation;
  const response = await callAutomation(plugins, "automations_create", {
    projectId: thread.projectId,
    name: suggestion.title,
    origin: "app",
    createdByThreadId: thread.id,
    trigger: { triggerType: "once", runAt: automation.schedule.runAt },
    execution: {
      mode: "agent",
      prompt: automation.prompt,
      providerId: thread.providerId,
      model: execution.model,
      reasoningLevel: execution.reasoningLevel,
      permissionMode: execution.permissionMode,
      environment: { type: "reuse", environmentId: thread.environmentId },
      resultNotificationKind: "day2_result",
    },
  });
  const result: NextStepResult = {
    kind: "automation",
    automationId: z.object({ id: z.string() }).parse(response).id,
  };
  linkNextStepResult(deps.db, { threadId: thread.id, result });
  return result;
}

export function registerNextStepRoutes(
  app: Hono,
  deps: AppDeps,
  plugins: PluginService,
): void {
  const { get, post } = typedRoutes<PublicApiSchema>(app, {
    onValidationError: (message) =>
      new ApiError(400, "invalid_request", message),
  });
  const routes = publicApiRoutes.threads;
  get(routes.nextStep, (context) => {
    const thread = requirePublicThread(deps.db, context.req.param("id"));
    return context.json(getNextStep(deps.db, thread.id));
  });
  post(routes.proposeNextStep, async (context, payload) => {
    const thread = requirePublicThread(deps.db, context.req.param("id"));
    return context.json(
      await proposeNextStep(deps, { threadId: thread.id, ...payload }),
    );
  });
  post(routes.showNextStep, (context) => {
    const thread = requirePublicThread(deps.db, context.req.param("id"));
    const surface = parseRequestAppSurface(
      context.req.header(APP_SURFACE_HEADER_NAME),
    );
    if (surface !== "desktop" && surface !== "web")
      return context.json(getNextStep(deps.db, thread.id));
    const result = showNextStep(deps.db, { threadId: thread.id });
    if (result.newlyShown && result.suggestion)
      deps.telemetry.capture({
        name: "suggestion_shown",
        properties: {
          surface: "next_step",
          kind: result.suggestion.action.kind,
          trigger: "agent",
          suggestion_analytics_id: result.suggestion.analyticsId,
        },
      });
    return context.json(result.suggestion);
  });
  post(routes.acceptNextStep, async (context) => {
    const thread = requirePublicThread(deps.db, context.req.param("id"));
    const suggestion = getNextStep(deps.db, thread.id);
    if (suggestion?.status === "proposed") {
      if (thread.environmentId === null) {
        throw new ApiError(
          409,
          "next_step_environment_unavailable",
          "This thread needs an environment before starting the next step",
        );
      }
      if (
        suggestion.action.kind === "automation" &&
        plugins.getRpcHandler("automations", "automations_create").outcome !==
          "found"
      ) {
        throw new ApiError(
          409,
          "next_step_automations_unavailable",
          "Enable Automations to schedule this next step",
        );
      }
      await buildExecutionOptions(deps, {}, { threadId: thread.id });
    }
    const result = await acceptNextStep(deps.db, {
      threadId: thread.id,
      execute: (suggestion) => executeNextStep(deps, plugins, suggestion),
    });
    if (result.newlyAccepted)
      deps.telemetry.capture({
        name: "suggestion_accepted",
        properties: {
          surface: "next_step",
          kind: result.suggestion.action.kind,
          suggestion_analytics_id: result.suggestion.analyticsId,
        },
      });
    return context.json(result.suggestion);
  });
  post(routes.dismissNextStep, (context) => {
    const thread = requirePublicThread(deps.db, context.req.param("id"));
    const result = dismissNextStep(deps.db, thread.id);
    if (result.newlyDismissed)
      deps.telemetry.capture({
        name: "suggestion_dismissed",
        properties: {
          surface: "next_step",
          kind: result.suggestion.action.kind,
          suggestion_analytics_id: result.suggestion.analyticsId,
          dismiss: "this_thread",
        },
      });
    return context.json(result.suggestion);
  });
  post(routes.undoNextStep, async (context) => {
    const thread = requirePublicThread(deps.db, context.req.param("id"));
    return context.json(
      await undoNextStep(deps.db, {
        threadId: thread.id,
        undo: async (automationId) => {
          await callAutomation(plugins, "automations_delete", {
            projectId: thread.projectId,
            automationId,
          });
        },
      }),
    );
  });
}
