import { expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { AccountLink } from "./account-link.js";
import { createAccountClient, type Account } from "./account-client.js";
import { CredentialCopy } from "./credential-copy.js";
import { FakeAccount } from "./testing/fake-account.js";

it("keeps an unavailable account cleared when an earlier credential sync completes, then recovers", async () => {
  const fake = new FakeAccount();
  fake.signIn();
  fake.serverCredential = "server-credential";
  const host = createFakePluginHost({
    pluginId: "connect",
    sdk: {
      plugins: { callRpc: fake.callRpc, experimental_watchRpc: fake.watchRpc },
    },
  });
  const account = createAccountClient(() => host.bb.sdk);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = vi.fn(() => blocked);
  const copy = new CredentialCopy({
    account,
    log: host.bb.log,
    store: {
      read: async () => null,
      readMarker: async () => null,
      write,
      writeMarker: async () => {},
      clear: async () => {},
    },
  });
  const sync = vi.spyOn(copy, "sync");
  const updates: Array<Account | null> = [];
  const controller = new AbortController();
  const running = new AccountLink({
    account,
    copy,
    log: host.bb.log,
    onAccount: (value) => updates.push(value),
  }).run(controller.signal);
  try {
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    fake.available = false;
    await vi.waitFor(() => expect(updates).toEqual([null]));
    release();
    await sync.mock.results[0]!.value;
    expect(updates).toEqual([null]);
    fake.available = true;
    await vi.waitFor(() => expect(updates.at(-1)).toEqual(fake.status.account));
  } finally {
    release();
    controller.abort();
    await running;
    await host.harness.dispose();
  }
});
