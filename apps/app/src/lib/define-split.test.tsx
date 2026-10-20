// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { downloadSplit } from "./split-prefetch";
import { defineSplit } from "./define-split";

const { reloadAfterChunkDownloadFailure } = vi.hoisted(() => ({
  reloadAfterChunkDownloadFailure:
    vi.fn<() => Promise<"reloading" | "server-unreachable" | "not-reloaded">>(),
}));

vi.mock("./stale-chunk-recovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stale-chunk-recovery")>()),
  reloadAfterChunkDownloadFailure,
}));

afterEach(() => {
  cleanup();
  reloadAfterChunkDownloadFailure.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("downloads bytes without importing and shares an in-flight download with first use", async () => {
  const manifest = document.createElement("script");
  manifest.id = "bb-prefetch-download-only";
  manifest.textContent = JSON.stringify(["/assets/download-only.js"]);
  document.head.append(manifest);
  let finish!: () => void;
  const body = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: () => body }));
  vi.stubGlobal("fetch", fetch);
  const load = vi.fn(async () => () => <p>Downloaded editor</p>);
  const Split = defineSplit({
    id: "download-only",
    load,
    loading: () => <p>Waiting for bytes</p>,
    tier: "intent",
  });
  try {
    const downloading = downloadSplit("download-only");
    await act(async () => {});
    expect(fetch).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
    render(<Split />);
    await act(async () => {});
    expect(screen.getByText("Waiting for bytes")).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await downloading;
    });
    expect(await screen.findByText("Downloaded editor")).toBeTruthy();
    await downloadSplit("download-only");
    expect(fetch).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  } finally {
    manifest.remove();
  }
});

it("does not start a speculative download after an import has started", async () => {
  const manifest = document.createElement("script");
  manifest.id = "bb-prefetch-import-first";
  manifest.textContent = JSON.stringify(["/assets/import-first.js"]);
  document.head.append(manifest);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  let finish!: () => void;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const Split = defineSplit({
    id: "import-first",
    load: async () => {
      await held;
      return () => null;
    },
    loading: () => null,
    tier: "intent",
  });
  try {
    const importing = Split.preload();
    await downloadSplit("import-first");
    expect(fetch).not.toHaveBeenCalled();
    finish();
    await importing;
  } finally {
    manifest.remove();
  }
});

it("shares a pending intent preload with rendering, preserves props, and stays mounted across parent renders", async () => {
  let finish: (
    value: React.ComponentType<{ label: string }>,
  ) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<React.ComponentType<{ label: string }>>((resolve) => {
        finish = resolve;
      }),
  );
  const Split = defineSplit({
    id: "editor",
    load,
    loading: ({ label }) => <p>Loading {label}</p>,
    tier: "intent",
  });
  const view = render(<button {...Split.intentProps}>Open</button>);
  expect(load).not.toHaveBeenCalled();
  fireEvent.focus(screen.getByRole("button"));
  fireEvent.pointerEnter(screen.getByRole("button"));
  await act(async () => {});
  view.rerender(<Split label="document" />);
  expect(screen.getByText("Loading document")).toBeTruthy();
  expect(load).toHaveBeenCalledOnce();
  await act(async () =>
    finish(({ label }) => <input aria-label={label} defaultValue="draft" />),
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "unsaved" },
  });
  view.rerender(<Split label="renamed" />);
  expect(screen.getByRole("textbox", { name: "renamed" })).toHaveProperty(
    "value",
    "unsaved",
  );
});

it("keeps load failure local and retries a failed import instead of caching the rejection forever", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const load = vi.fn<() => Promise<React.ComponentType>>();
  load.mockRejectedValueOnce(new Error("offline"));
  load.mockResolvedValueOnce(() => <p>Editor ready</p>);
  const Split = defineSplit({
    id: "retry",
    load,
    loading: () => <p>Loading</p>,
    tier: "intent",
  });
  render(
    <>
      <p>Shell stays</p>
      <Split />
    </>,
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText("Shell stays")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Editor ready")).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
});

it("recovers from a rejected speculative preload when the feature is opened", async () => {
  const load = vi.fn<() => Promise<React.ComponentType>>();
  load.mockRejectedValueOnce(new Error("offline"));
  load.mockResolvedValueOnce(() => <p>Ready after preload failure</p>);
  const Split = defineSplit({
    id: "preload-retry",
    load,
    loading: () => null,
    tier: "intent",
  });
  await Split.preload();
  render(<Split />);
  expect(await screen.findByText("Ready after preload failure")).toBeTruthy();
});

it.each(["preload", "previous mount"])(
  "does not commit a loading fallback after %s resolves the component",
  async (warmup) => {
    const fallbackCommitted = vi.fn();
    function Loading() {
      useLayoutEffect(() => {
        fallbackCommitted();
      }, []);
      return <p>Loading cached feature</p>;
    }
    const Split = defineSplit({
      id: "cached-mount",
      load: async () => () => <input aria-label="Cached editor" />,
      loading: Loading,
      tier: "intent",
    });
    if (warmup === "preload") {
      await Split.preload();
    } else {
      const first = render(<Split />);
      await screen.findByRole("textbox", { name: "Cached editor" });
      first.unmount();
      fallbackCommitted.mockClear();
    }
    const second = render(<Split />);
    expect(fallbackCommitted).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Cached editor" })).toBeTruthy();
    second.unmount();
  },
);

it("reports a download failure as one, logs it, and reloads once the server answers", async () => {
  vi.useFakeTimers();
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const failure = new TypeError(
    "Failed to fetch dynamically imported module: /assets/editor.js",
  );
  reloadAfterChunkDownloadFailure
    .mockResolvedValueOnce("server-unreachable")
    .mockResolvedValueOnce("reloading");
  const load = vi
    .fn<() => Promise<React.ComponentType>>()
    .mockRejectedValue(failure);
  const Split = defineSplit({
    id: "download-failure",
    load,
    loading: () => <p>Loading editor</p>,
    tier: "intent",
  });
  const view = render(<Split />);
  await act(async () => {});
  expect(load).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert").textContent).toContain(
    "Couldn't download this part of bb.",
  );
  expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  expect(logged).toHaveBeenCalledWith(
    '[bb] split "download-failure" failed',
    failure,
    expect.any(String),
  );
  expect(reloadAfterChunkDownloadFailure).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(4999));
  expect(reloadAfterChunkDownloadFailure).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(reloadAfterChunkDownloadFailure).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(reloadAfterChunkDownloadFailure).toHaveBeenCalledTimes(2);
  view.unmount();
});

it("stops waiting for the server when the failed split unmounts", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  reloadAfterChunkDownloadFailure.mockResolvedValue("server-unreachable");
  const Split = defineSplit({
    id: "download-failure-unmount",
    load: () =>
      Promise.reject(new TypeError("Importing a module script failed.")),
    loading: () => null,
    tier: "intent",
  });
  const view = render(<Split />);
  await act(async () => {});
  expect(reloadAfterChunkDownloadFailure).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(reloadAfterChunkDownloadFailure).toHaveBeenCalledOnce();
});

it("reports a crash inside a loaded split as a crash, logs it, and lets Try again remount it", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  let crash = true;
  const crashError = new Error("queued row could not render");
  function Crashing() {
    if (crash) throw crashError;
    return <p>Rows ready</p>;
  }
  const Split = defineSplit({
    id: "render-crash",
    load: async () => Crashing,
    loading: () => null,
    tier: "intent",
  });
  render(<Split />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Something went wrong here.");
  expect(alert.textContent).not.toContain("download");
  expect(logged).toHaveBeenCalledWith(
    '[bb] split "render-crash" failed',
    crashError,
    expect.any(String),
  );
  expect(reloadAfterChunkDownloadFailure).not.toHaveBeenCalled();
  crash = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Rows ready")).toBeTruthy();
});

it("mounts only when wanted and keeps a retained split mounted after it closes", async () => {
  const Split = defineSplit<{ open: boolean }>({
    id: "gated",
    load: async () => () => <input aria-label="Gated editor" />,
    loading: () => null,
    unmounted: () => <p>Closed shell</p>,
    mountWhen: ({ open }) => open,
    keepMounted: true,
    tier: "intent",
  });
  const view = render(<Split open={false} />);
  expect(screen.getByText("Closed shell")).toBeTruthy();
  view.rerender(<Split open />);
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Gated editor" }),
    { target: { value: "kept" } },
  );
  view.rerender(<Split open={false} />);
  expect(screen.queryByText("Closed shell")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Gated editor" })).toHaveProperty(
    "value",
    "kept",
  );
});

it.each([true, false])(
  "preloads preload-tier splits at idle once preloading starts, including ones defined later (idle API: %s)",
  async (hasIdleCallback) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestIdleCallback",
      hasIdleCallback
        ? (callback: () => void) => window.setTimeout(callback, 1000)
        : undefined,
    );
    vi.resetModules();
    const { defineSplit: define } = await import("./define-split");
    const { startSplitPreloading: start } = await import("./split-prefetch");
    const load = vi.fn(async () => () => <p>Warm feature</p>);
    const Split = define({
      id: "preload",
      load,
      loading: () => null,
      tier: "preload",
    });
    const intentLoad = vi.fn(async () => () => null);
    define({
      id: "intent",
      load: intentLoad,
      loading: () => null,
      tier: "intent",
    });
    await act(async () => vi.runAllTimersAsync());
    expect(load).not.toHaveBeenCalled();
    start();
    await act(async () => vi.runAllTimersAsync());
    expect(load).toHaveBeenCalledOnce();
    expect(intentLoad).not.toHaveBeenCalled();
    const lateLoad = vi.fn(async () => () => null);
    define({
      id: "late-preload",
      load: lateLoad,
      loading: () => null,
      tier: "preload",
    });
    await act(async () => vi.runAllTimersAsync());
    expect(lateLoad).toHaveBeenCalledOnce();
    render(<Split />);
    expect(screen.getByText("Warm feature")).toBeTruthy();
    expect(load).toHaveBeenCalledOnce();
  },
);

it("holds preload-tier work until rendered splits have loaded", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.resetModules();
  const { defineSplit: define } = await import("./define-split");
  const { startSplitPreloading: start } = await import("./split-prefetch");
  let finishPage!: () => void;
  const Page = define({
    id: "page",
    load: () =>
      new Promise<React.ComponentType>((resolve) => {
        finishPage = () => resolve(() => <p>Page content</p>);
      }),
    loading: () => null,
    tier: "intent",
  });
  const preloadLoad = vi.fn(async () => () => null);
  define({
    id: "later",
    load: preloadLoad,
    loading: () => null,
    tier: "preload",
  });
  render(<Page />);
  start();
  await act(async () => vi.runAllTimersAsync());
  expect(preloadLoad).not.toHaveBeenCalled();
  await act(async () => {
    finishPage();
    await vi.runAllTimersAsync();
  });
  expect(screen.getByText("Page content")).toBeTruthy();
  expect(preloadLoad).toHaveBeenCalledOnce();
});
