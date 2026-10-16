import type { PluginLogger } from "@get-bb/plugin-sdk";
import {
  AccountUnavailableError,
  type Account,
  type AccountClient,
  type AccountStatus,
} from "./account-client.js";
import type { CredentialCopy } from "./credential-copy.js";

interface AccountLinkOptions {
  account: AccountClient;
  copy: CredentialCopy;
  log: PluginLogger;
  onAccount(account: Account | null): void;
  retryMinMs?: number;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    timer.unref?.();
    signal.addEventListener("abort", finish, { once: true });
  });
}

export class AccountLink {
  constructor(private readonly options: AccountLinkOptions) {}

  async run(signal: AbortSignal): Promise<void> {
    let pending = Promise.resolve();
    let stop = () => {};
    let failures = 0;
    let syncedRevision: number | null = null;
    let generation = 0;
    const report = (error: Error) => {
      syncedRevision = null;
      if (error instanceof AccountUnavailableError) {
        this.options.onAccount(null);
      } else {
        this.options.log.warn(
          `could not read the bb account status: ${error.message}`,
        );
      }
    };
    const enqueue = (status: AccountStatus) => {
      if (signal.aborted) return;
      const current = ++generation;
      pending = pending.then(async () => {
        if (signal.aborted || current !== generation) return;
        try {
          if (status.revision !== syncedRevision) {
            syncedRevision = status.revision;
            const changed = await this.options.copy.sync(status);
            if (signal.aborted) return;
            if (changed) {
              watch();
              return;
            }
          }
          if (current !== generation) return;
          failures = 0;
          this.options.onAccount(status.account);
        } catch (error) {
          if (signal.aborted) return;
          report(error instanceof Error ? error : new Error(String(error)));
          await sleep(
            Math.min(
              30_000,
              (this.options.retryMinMs ?? 1_000) * 2 ** failures++,
            ),
            signal,
          );
          watch();
        }
      });
    };
    const watch = () => {
      stop();
      generation++;
      if (signal.aborted) return;
      stop = this.options.account.watchStatus(
        enqueue,
        (error) => {
          if (signal.aborted) return;
          generation++;
          report(error);
        },
        signal,
      );
    };
    watch();
    try {
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
    } finally {
      stop();
      await pending;
    }
  }
}
