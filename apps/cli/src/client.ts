import { isLoopbackHostname } from "@bb/config/loopback";
import { BB_PROD_SERVER_PORT } from "@bb/config/runtime";
import { ManagedJobDefaultServerWriteError } from "./managed-job-write-error.js";
import { createNodeBbSdk, type BbSdk } from "@bb/sdk/node";
import type { Dispatcher } from "undici";

type CliRequestInit = RequestInit & { dispatcher?: Dispatcher };

export async function cliFetch(
  input: RequestInfo | URL,
  init?: CliRequestInit,
): Promise<Response> {
  if (
    process.env.HOST_CARE_JOB_ID &&
    process.env.BB_ALLOW_DEFAULT_SERVER_WRITES !== "1"
  ) {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const url = new URL(input instanceof Request ? input.url : input);
      if (
        url.port === String(BB_PROD_SERVER_PORT) &&
        isLoopbackHostname(url.hostname)
      ) {
        throw new ManagedJobDefaultServerWriteError(method, url.origin);
      }
    }
  }
  return fetch(input, init);
}

export function createCliBbSdk(baseUrl: string): BbSdk {
  return createNodeBbSdk({ baseUrl, fetch: cliFetch });
}
