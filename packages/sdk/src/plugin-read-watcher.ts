import { BbHttpError } from "./response.js";

export function createPluginReadWatcher<T>(options: {
  signal: AbortSignal;
  read(signal: AbortSignal): Promise<T>;
  onChange(value: T): void;
  onStop?: () => void;
  onError?: (error: Error) => void;
}) {
  let generation = 0;
  let running = false;
  let scheduled = false;
  let stopped = options.signal.aborted;
  let controller: AbortController | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  const run = async () => {
    scheduled = false;
    if (stopped || running) return;
    running = true;
    const current = generation;
    controller = new AbortController();
    try {
      const value = await options.read(
        AbortSignal.any([options.signal, controller.signal]),
      );
      if (!stopped && current === generation) {
        failures = 0;
        options.onChange(value);
      }
    } catch (error) {
      if (!stopped && current === generation) {
        const permanent =
          error instanceof BbHttpError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 404 &&
          error.status !== 408 &&
          error.status !== 429;
        if (permanent) {
          stopped = true;
          options.onStop?.();
        }
        options.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
        if (permanent) return;
        retry = setTimeout(
          () => {
            retry = null;
            generation++;
            schedule();
          },
          Math.min(30_000, 1_000 * 2 ** failures++),
        );
        retry.unref?.();
      }
    } finally {
      running = false;
      if (!stopped && current !== generation) schedule();
    }
  };
  const schedule = () => {
    if (stopped || scheduled || running) return;
    scheduled = true;
    queueMicrotask(() => {
      void run();
    });
  };
  return {
    refresh() {
      if (retry) clearTimeout(retry);
      retry = null;
      generation++;
      schedule();
    },
    stop() {
      stopped = true;
      if (retry) clearTimeout(retry);
      retry = null;
      controller?.abort();
    },
  };
}
