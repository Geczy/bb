import { z } from "zod";
import { setupJobTimezoneSchema, type SetupJobArm } from "@bb/server-contract";
import { ApiError } from "../../errors.js";
import type { PluginService } from "../plugins/plugin-service.js";

export const SETUP_JOB_HOLDOUT_KEY = "app_setup_recurring_job";

const LOCAL_REVIEW_INSTRUCTIONS = `This is an opted-in weeknight job. Keep all changes local. Never push, open or update a remote pull request, merge, publish, deploy, or send a message outside bb. A separate explicit click from the person is required before any change leaves this machine. Do not treat this schedule or earlier broad publishing permission as that click.
Use the repository's documented test commands. Preserve unrelated changes. Do not change production servers, accounts, or data. If a required action needs approval, leave the thread needing input instead of bypassing approval. Leave a concise result in bb for review. When work is ready, show an interactive question with choices to keep it local, create a pull request (only when there is a reviewed local branch), or Stop this job. Wait for the person's explicit choice. Only a new click on Create pull request authorizes pushing that reviewed branch and opening its PR. A click on Stop this job means run bb automation pause <automationId> --project <projectId>, using the automation ID in this run's due message and this project's ID. Never assume either choice. A thread that needs this choice uses bb's existing Attention and notification path.`;

export const setupJobDefinitions: Record<
  SetupJobArm,
  { title: string; name: string; prompt: string }
> = {
  a: {
    title: "Each weeknight, keep going on unfinished work",
    name: "Keep going on unfinished work",
    prompt: `Find the most recent thread in this project that the person worked in today and left with a concrete unfinished task. Read its conversation before deciding. Exclude archived, deleted, active, completed, or automation-only threads. Do not invent unfinished work or revive a task the person cancelled. If no such thread exists, do nothing.
Continue the existing task in that same thread using bb's thread send path, preserving its agent and workspace. Tell that agent to finish the already-requested local work, run the relevant tests, and leave the result in the same thread. Include this automation ID, project ID, time zone, and all of the local-review restrictions and result actions below in that message. Wait for that thread to settle or need the person before completing this run. Never start another recurring job.
${LOCAL_REVIEW_INSTRUCTIONS}`,
  },
  b: {
    title: "Each weeknight, fix what's failing on main",
    name: "Fix what's failing on main",
    prompt: `Work in this isolated local branch. Check the repository's main branch (or documented default branch) and run its test suite. If gh auth status confirms a signed-in GitHub session, also inspect CI for that branch. If gh is absent or signed out, continue with the local tests without asking the person to sign in.
Only fix failures that you can reproduce or verify from CI evidence. Keep the repairs together on this local branch, run the relevant tests again, and leave the diff and test results ready for review. If nothing is failing, do not create changes. Never push or create a remote PR during this scheduled run.
${LOCAL_REVIEW_INSTRUCTIONS}`,
  },
};

type SetupJobPlugins = Pick<
  PluginService,
  "list" | "getRpcHandler" | "invokeRpcHandler"
>;

interface SetupJobExecution {
  projectId: string;
  hostId: string;
  providerId: string;
  model: string;
  reasoningLevel: string;
}

const createdAutomationSchema = z.object({ id: z.string().min(1) });

export async function createSetupJobAutomation(
  plugins: SetupJobPlugins,
  args: {
    accepted: boolean;
    suggestionAnalyticsId: string;
    arm: SetupJobArm;
    timezone: string;
    execution: SetupJobExecution;
  },
): Promise<string | null> {
  if (!args.accepted) return null;
  const timezone = setupJobTimezoneSchema.parse(args.timezone);
  const plugin = plugins
    .list()
    .find((entry) => entry.source === "builtin:automations");
  if (plugin === undefined) {
    throw new ApiError(
      409,
      "setup_job_unavailable",
      "Turn on Automations before starting this job.",
    );
  }
  const handler = plugins.getRpcHandler(plugin.id, "automations_create");
  if (handler.outcome !== "found") {
    throw new ApiError(
      409,
      "setup_job_unavailable",
      "Automations is not ready. Try again or continue without the job.",
    );
  }
  const definition = setupJobDefinitions[args.arm];
  const result = await plugins.invokeRpcHandler(
    plugin.id,
    "automations_create",
    handler.value,
    {
      projectId: args.execution.projectId,
      idempotencyKey: `setup-job:${args.suggestionAnalyticsId}`,
      name: definition.name,
      enabled: true,
      origin: "app",
      trigger: { triggerType: "schedule", cron: "0 22 * * 1-5", timezone },
      execution: {
        mode: "agent",
        prompt: `${definition.prompt}\nThe schedule uses time zone ${timezone}. Today means the calendar day in that time zone. This project is ${args.execution.projectId}.`,
        providerId: args.execution.providerId,
        model: args.execution.model,
        reasoningLevel: args.execution.reasoningLevel,
        permissionMode: "accept-edits",
        environment:
          args.arm === "a"
            ? { type: "project-default" }
            : {
                type: "host",
                hostId: args.execution.hostId,
                workspace: {
                  type: "managed-worktree",
                  baseBranch: { kind: "default" },
                },
              },
      },
    },
    { kind: "client" },
  );
  if (!result.ok) {
    throw new ApiError(409, "setup_job_create_failed", result.error.message);
  }
  return createdAutomationSchema.parse(result.result).id;
}
