import { afterEach, expect, it, vi } from "vitest";
import { BbHttpError } from "../src/response.js";
import { createPluginReadWatcher } from "../src/plugin-read-watcher.js";

afterEach(() => vi.useRealTimers());

it.each([400, 401, 403, 404, 409, 422, 499])(
  "ends a watch on permanent HTTP %i and ignores subsequent refreshes",
  async (status) => {
    vi.useFakeTimers();
    const error = new BbHttpError({
      status,
      message: "invalid input",
      body: null,
      code: null,
    });
    const read = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const onStop = vi.fn();
    const watch = createPluginReadWatcher({
      signal: new AbortController().signal,
      read,
      onChange: vi.fn(),
      onError,
      onStop,
    });
    watch.refresh();
    await vi.advanceTimersByTimeAsync(0);
    watch.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(onStop).toHaveBeenCalledTimes(1);
  },
);

it.each([408, 429, 500, 503, null])(
  "retries transient failure %s and recovers",
  async (status) => {
    vi.useFakeTimers();
    const error =
      status === null
        ? new TypeError("network unavailable")
        : new BbHttpError({
            status,
            message: "try later",
            body: null,
            code: null,
          });
    const read = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(7);
    const onChange = vi.fn();
    const onStop = vi.fn();
    const watch = createPluginReadWatcher({
      signal: new AbortController().signal,
      read,
      onChange,
      onError: vi.fn(),
      onStop,
    });
    try {
      watch.refresh();
      await vi.advanceTimersByTimeAsync(999);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(7);
      expect(onStop).not.toHaveBeenCalled();
    } finally {
      watch.stop();
    }
  },
);
