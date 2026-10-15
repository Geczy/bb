import { expect, it, vi } from "vitest";
import {
  runCommand,
  setupCommandOutputTestEnvironment,
} from "../helpers/command-output-harness.js";
import { registerPluginCommands } from "../../commands/plugin.js";

setupCommandOutputTestEnvironment();

it("exits unsuccessfully when an RPC watch rejects permanent input", async () => {
  const WebSocket = globalThis.WebSocket;
  vi.stubGlobal(
    "WebSocket",
    class {
      readyState = 0;
      onclose: (() => void) | null = null;
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
      send() {}
    },
  );
  try {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "invalid_input",
            message: "rpc input validation failed",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(
      runCommand(
        ["plugin", "rpc", "call", "tasks", "listProjects", "--watch", "--json"],
        (program) => registerPluginCommands(program, () => "http://server"),
      ),
    ).rejects.toThrow("process.exit:1");
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    vi.stubGlobal("WebSocket", WebSocket);
  }
});
