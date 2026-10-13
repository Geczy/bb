import { z } from "zod";
import { getLatestStoredThreadEventOfTypes } from "@bb/db";
import { providerErrorInfoSchema } from "@bb/domain";
import type { CreateTerminalRequest } from "@bb/server-contract";
import { ApiError } from "../../errors.js";
import type { AppDeps } from "../../types.js";
import {
  requirePublicThread,
  requireReadyEnvironment,
} from "../lib/entity-lookup.js";
import { callHostRetryableOnlineRpc } from "../hosts/online-rpc.js";
import { requireBridgeLaunchForProviderId } from "../system/provider-bridge-launch.js";
import { COMMAND_TIMEOUT_MS } from "../../constants.js";

const authFailureSchema = z.object({
  errorInfo: providerErrorInfoSchema,
  willRetry: z.boolean().optional(),
});

export async function prepareProviderLogin(
  deps: AppDeps,
  payload: CreateTerminalRequest,
) {
  if (payload.target.kind !== "thread") {
    throw new ApiError(
      400,
      "provider_login_requires_thread",
      "Sign-in requires the failed thread.",
    );
  }
  const thread = requirePublicThread(deps.db, payload.target.threadId);
  const failure = getLatestStoredThreadEventOfTypes(deps.db, {
    threadId: thread.id,
    types: ["provider/error", "client/turn/requested", "turn/started"],
    afterSequence: -1,
  });
  const completion = getLatestStoredThreadEventOfTypes(deps.db, {
    threadId: thread.id,
    types: ["turn/completed", "turn/started", "client/turn/requested"],
    afterSequence: -1,
  });
  const settled =
    completion?.type === "turn/completed"
      ? z
          .object({ status: z.literal("failed") })
          .safeParse(JSON.parse(completion.data)).success
      : false;
  const error =
    failure?.type === "provider/error"
      ? authFailureSchema.safeParse(JSON.parse(failure.data))
      : null;
  if (
    !settled ||
    failure?.turnId == null ||
    (payload.start?.mode === "provider-login" &&
      payload.start.turnId !== undefined &&
      payload.start.turnId !== failure.turnId) ||
    completion?.turnId !== failure?.turnId ||
    !error?.success ||
    error.data.errorInfo.category !== "unauthorized" ||
    error.data.willRetry === true
  ) {
    throw new ApiError(
      409,
      "provider_auth_failure_required",
      "This thread has no current authentication failure. Retry is still available.",
    );
  }
  if (thread.environmentId === null) {
    throw new ApiError(
      409,
      "provider_login_environment_missing",
      "The failed thread's execution environment is unavailable.",
    );
  }
  const environment = requireReadyEnvironment(deps.db, thread.environmentId);
  const bridgeLaunch = requireBridgeLaunchForProviderId(
    deps,
    thread.providerId,
  );
  const result = await callHostRetryableOnlineRpc(deps, {
    hostId: environment.hostId,
    timeoutMs: COMMAND_TIMEOUT_MS,
    command: {
      type: "provider.health",
      providerId: thread.providerId,
      bridgeLaunch,
      ...(environment.path === null ? {} : { cwd: environment.path }),
    },
  });
  const command = result.supported ? result.health.loginCommand : null;
  if (
    command === null ||
    !/^[A-Za-z0-9_./-]+(?: +[A-Za-z0-9_./=-]+)*$/.test(command)
  ) {
    throw new ApiError(
      409,
      "provider_login_command_unavailable",
      "This provider does not supply a sign-in command that can run safely in the failed thread's environment.",
    );
  }
  const argv = command.split(/ +/);
  return {
    argv,
    threadEnvironment: {
      failedTurnId: failure.turnId,
      providerId: thread.providerId,
      rejectEnv: [
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_CODE_USE_BEDROCK",
        "CLAUDE_CODE_USE_VERTEX",
        "CLAUDE_CODE_USE_FOUNDRY",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
      ],
      executableEnvVar:
        argv[0] === "claude" ? "BB_CLAUDE_CODE_EXECUTABLE" : null,
    },
  };
}
