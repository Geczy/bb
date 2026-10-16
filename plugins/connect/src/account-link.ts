import type { PluginLogger } from "@get-bb/plugin-sdk";
import {
  AccountUnavailableError,
  type Account,
  type AccountClient,
} from "./account-client.js";
import type { CredentialCopy } from "./credential-copy.js";

interface AccountLinkOptions {
  account: AccountClient;
  copy: CredentialCopy;
  log: PluginLogger;
  onAccount(account: Account | null): void;
  retryMinMs?: number;
}

export class AccountLink {
  constructor(private readonly options: AccountLinkOptions) {}

  async run(signal: AbortSignal): Promise<void> {
    let pending = Promise.resolve();
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let lastStatus: import("./account-client.js").AccountStatus | null = null;
    const sync = () => {
      if (lastStatus === null || signal.aborted) return;
      const status = lastStatus;
      pending = pending
        .then(async () => {
          if (signal.aborted) return;
          if (await this.options.copy.sync(status)) return;
          failures = 0;
          if (!signal.aborted && status === lastStatus)
            this.options.onAccount(status.account);
        })
        .catch((error: unknown) => {
          if (!signal.aborted) {
            this.options.log.warn(
              `could not sync the bb account: ${String(error)}`,
            );
            if (retry) clearTimeout(retry);
            retry = setTimeout(
              () => {
                retry = null;
                sync();
              },
              Math.min(
                30_000,
                (this.options.retryMinMs ?? 1_000) * 2 ** failures++,
              ),
            );
          }
        });
    };
    const stop = this.options.account.watchStatus(
      (status) => {
        lastStatus = status;
        if (retry) clearTimeout(retry);
        retry = null;
        sync();
      },
      (error) => {
        if (error instanceof AccountUnavailableError) {
          lastStatus = null;
          if (retry) clearTimeout(retry);
          retry = null;
          this.options.onAccount(null);
        } else
          this.options.log.warn(
            `could not read the bb account status: ${error.message}`,
          );
      },
      signal,
    );
    try {
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
    } finally {
      stop();
      if (retry) clearTimeout(retry);
      await pending;
    }
  }
}
