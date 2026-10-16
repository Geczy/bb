import type { JsonValue } from "@get-bb/plugin-sdk";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import type { RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import plugin from "./server";
import { tasksRpcContract } from "./shared/contract";
import { delegationRpcContract } from "./delegate/contract";

type ReadMetadata = ReturnType<
  NonNullable<RenderSlotOptions["experimental_rpcTags"]>
>;

export async function createTasksServer(
  sdk?: NonNullable<Parameters<typeof createFakePluginHost>[0]>["sdk"],
) {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks", sdk });
  await plugin(bb);
  const metadata = new Map<string, ReadMetadata>();
  const failures = new Map<string, Error>();
  const holds = new Map<string, Promise<void>>();
  let queue = Promise.resolve();
  const call = async (
    method: string,
    input: unknown,
    context?: { experimental_warmKeyedMethods: readonly string[] },
  ) => {
    await holds.get(method);
    const read = queue.then(async () => {
      const failure = failures.get(method);
      if (failure) throw failure;
      const result = await harness.callRpc(method, input, context);
      metadata.set(JSON.stringify([method, input]), {
        tags: harness.rpcTags.get(method) ?? [],
        keyTags: harness.experimental_rpcKeyTags.get(method) ?? {},
        providedKeyed: harness.experimental_rpcProvidedKeyed.get(method) ?? {},
      });
      return result;
    });
    queue = read.then(
      () => {},
      () => {},
    );
    return read;
  };
  const options = {
    pluginId: "tasks",
    rpc: Object.fromEntries(
      [
        ...Object.keys(tasksRpcContract),
        ...Object.keys(delegationRpcContract),
      ].map((method) => [
        method,
        (
          input: unknown,
          context?: { experimental_warmKeyedMethods: readonly string[] },
        ) => call(method, input, context),
      ]),
    ),
    experimental_rpcTags: (method: string, input: JsonValue) =>
      metadata.get(JSON.stringify([method, input])) ?? { tags: [] },
  };
  return {
    bb,
    harness,
    options,
    fail(method: string, message: string) {
      failures.set(method, new Error(message));
    },
    recover(method: string) {
      failures.delete(method);
    },
    hold(method: string) {
      let release = () => {};
      holds.set(
        method,
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      return () => {
        holds.delete(method);
        release();
      };
    },
    connect(slot: {
      experimental_invalidateRpc(tags?: readonly string[]): Promise<void>;
    }) {
      return harness.experimental_onRpcInvalidation((tags) => {
        void slot.experimental_invalidateRpc(tags ?? undefined);
      });
    },
  };
}
