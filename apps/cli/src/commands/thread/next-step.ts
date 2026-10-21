import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { nextStepInputSchema } from "@bb/domain";
import { action } from "../../action.js";
import { createCliBbSdk } from "../../client.js";
import { outputJson, requireThreadIdOrSelf } from "../helpers.js";

export function registerNextStepCommands(
  thread: Command,
  getUrl: () => string,
): void {
  const nextStep = thread
    .command("next-step")
    .description("Inspect and act on the thread's grounded next step");
  for (const operation of ["show", "accept", "dismiss", "undo"] as const) {
    nextStep
      .command(`${operation} [threadId]`)
      .option("--self", "Use this thread")
      .option("--json", "Output JSON")
      .description(`${operation} the next step`)
      .action(
        action(
          async (threadId: string | undefined, options: { self?: boolean }) => {
            const sdk = createCliBbSdk(getUrl());
            const id = requireThreadIdOrSelf(threadId, options);
            const methods = {
              show: sdk.threads.experimental_nextStep,
              accept: sdk.threads.experimental_acceptNextStep,
              dismiss: sdk.threads.experimental_dismissNextStep,
              undo: sdk.threads.experimental_undoNextStep,
            };
            outputJson({ json: true }, await methods[operation](id));
          },
        ),
      );
  }
  nextStep
    .command("propose [threadId]")
    .option("--self", "Use this thread")
    .option("--json", "Output JSON")
    .requiredOption("--turn <id>", "Turn containing the evidence")
    .requiredOption("--file <path>", "JSON proposal file")
    .description("Propose grounded work without starting it")
    .action(
      action(
        async (
          threadId: string | undefined,
          options: { self?: boolean; turn: string; file: string },
        ) => {
          const sdk = createCliBbSdk(getUrl());
          const input = nextStepInputSchema.parse(
            JSON.parse(await readFile(options.file, "utf8")),
          );
          outputJson(
            { json: true },
            await sdk.threads.experimental_proposeNextStep(
              requireThreadIdOrSelf(threadId, options),
              options.turn,
              input,
            ),
          );
        },
      ),
    );
}
