import { afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "@/lib/sdk";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import {
  prefetchCommandCatalog,
  scheduleCommandCatalogPrefetch,
} from "./useCommandSuggestions";

vi.mock("@/lib/sdk", () => ({
  sdk: {
    projects: {
      commands: vi.fn(),
    },
  },
}));

const TARGET = {
  projectId: "project-1",
  providerId: "codex",
  environmentId: "env-1",
  hostId: null,
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useCommandSuggestions catalog prefetch", () => {
  it("warms the command catalog for the composer's project, provider, and environment", async () => {
    vi.mocked(sdk.projects.commands).mockResolvedValue({ commands: [] });
    const { queryClient } = createQueryClientTestHarness();

    await prefetchCommandCatalog(queryClient, {
      projectId: "project-1",
      providerId: "codex",
      environmentId: "env-1",
      hostId: null,
    });

    expect(sdk.projects.commands).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sdk.projects.commands).mock.calls[0]?.[0]).toEqual({
      projectId: "project-1",
      provider: "codex",
      environmentId: "env-1",
      signal: expect.any(AbortSignal),
    });
  });

  it("sends no request when the composer loses focus before the delay", async () => {
    vi.useFakeTimers();
    vi.mocked(sdk.projects.commands).mockResolvedValue({ commands: [] });
    const { queryClient } = createQueryClientTestHarness();

    const cancel = scheduleCommandCatalogPrefetch(queryClient, TARGET);
    await vi.advanceTimersByTimeAsync(399);
    cancel();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sdk.projects.commands).not.toHaveBeenCalled();
  });

  it("sends one request when the composer stays focused past the delay", async () => {
    vi.useFakeTimers();
    vi.mocked(sdk.projects.commands).mockResolvedValue({ commands: [] });
    const { queryClient } = createQueryClientTestHarness();

    const cancel = scheduleCommandCatalogPrefetch(queryClient, TARGET);
    await vi.advanceTimersByTimeAsync(399);
    expect(sdk.projects.commands).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    cancel();

    expect(sdk.projects.commands).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sdk.projects.commands).mock.calls[0]?.[0]).toMatchObject({
      projectId: "project-1",
      provider: "codex",
      environmentId: "env-1",
    });
  });
});
