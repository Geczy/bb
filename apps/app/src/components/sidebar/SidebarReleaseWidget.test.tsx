// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { defaultExperiments } from "@bb/domain";
import type { SystemAppUpdateStatus } from "@bb/server-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseChangelog } from "../../../../../changelog-parser";
import { changelogEntriesQueryOptions } from "@/components/settings/changelog-preview";
import {
  systemAppUpdateQueryKey,
  systemConfigQueryKey,
} from "@/hooks/queries/query-keys";
import type { UpdateInventory } from "@/hooks/useUpdateInventory";
import { makeSystemConfig } from "@/test/fixtures/system-config";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { dismissedReleaseVersionAtom } from "./release-widget-preferences";
import {
  resetReleaseWidgetSessionForTest,
  SidebarReleaseWidget,
} from "./SidebarReleaseWidget";
import { SidebarUpdatesBadge } from "./SidebarUpdatesBadge";
import { TooltipProvider } from "@bb/shared-ui/tooltip";

const useUpdateInventoryMock = vi.hoisted(() => vi.fn());
const recordTelemetryEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useUpdateInventory", () => ({
  useUpdateInventory: useUpdateInventoryMock,
}));

vi.mock("@/components/onboarding/onboarding-telemetry", () => ({
  recordTelemetryEvent: recordTelemetryEventMock,
}));

vi.mock("@/components/provider-cli/provider-cli-install", () => ({
  useProviderCliInstallRunner: () => ({ runningJobKey: null }),
}));

vi.mock("@/lib/sdk", () => ({
  sdk: {
    providers: { list: vi.fn(async () => []) },
    system: {
      appUpdate: vi.fn(() => new Promise(() => {})),
      config: vi.fn(() => new Promise(() => {})),
    },
  },
}));

vi.mock("@/lib/ws", () => ({
  wsManager: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));

const LEGACY_KEY = "bb.settings.updates.dismissed-changelog-version";

const CHANGELOG = parseChangelog(`## 0.48.0

### Highlights

- **Release forty-eight:** next.

## 0.47.0

### Highlights

- **Customizable sidebar navigation:** switch.
- **New and improved ACP support:** rebuilt.
- **Diff review:** viewed files.
- **More customization surfaces:** plugins.

## 0.46.1

### Fixes

- Fixed.
`);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useUpdateInventoryMock.mockReset();
  recordTelemetryEventMock.mockReset();
  resetReleaseWidgetSessionForTest();
});

function appUpdate(version: string | null): SystemAppUpdateStatus {
  return {
    activity: { phase: "idle" },
    available:
      version === null
        ? null
        : {
            channel: "latest",
            commit: null,
            commitCount: null,
            subjects: [],
            version,
          },
    blocked: null,
    current: { commit: null, version: "0.46.1" },
    lastResult: null,
    runningThreadCount: 0,
    support: { kind: "supported", mode: "npm" },
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {`${location.pathname} ${JSON.stringify(location.state)}`}
    </output>
  );
}

interface RenderOptions {
  experiment?: boolean;
  available?: string | null;
  visible?: boolean;
  dismissed?: string | null;
}

function renderWidget({
  experiment = true,
  available = "0.47.0",
  visible = true,
  dismissed = null,
}: RenderOptions = {}) {
  useUpdateInventoryMock.mockReturnValue({
    isLoading: false,
    systemVersion: undefined,
    desktopInfo: null,
    appUpdateAvailable: available !== null,
    desktopUpdateReady: false,
    machines: [],
    actionableCount: available === null ? 0 : 1,
    hasAttention: available !== null,
  } satisfies Partial<UpdateInventory>);
  const { queryClient } = createQueryClientTestHarness();
  queryClient.setQueryData(
    systemConfigQueryKey(),
    makeSystemConfig({
      experiments: { ...defaultExperiments, releaseWidget: experiment },
    }),
  );
  queryClient.setQueryData(systemAppUpdateQueryKey(), appUpdate(available));
  queryClient.setQueryData(changelogEntriesQueryOptions().queryKey, CHANGELOG);
  const store = createStore();
  store.set(dismissedReleaseVersionAtom, dismissed);
  const onNavigate = vi.fn();
  const result = render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <TooltipProvider>
            <SidebarUpdatesBadge />
            <SidebarReleaseWidget visible={visible} onNavigate={onNavigate} />
            <Routes>
              <Route path="*" element={<LocationProbe />} />
            </Routes>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return { ...result, store, onNavigate, queryClient };
}

function widget(): HTMLElement | null {
  return screen.queryByTestId("sidebar-release-widget");
}

describe("SidebarReleaseWidget", () => {
  it("stays hidden when the experiment is off, but the chip still shows", () => {
    renderWidget({ experiment: false });

    expect(screen.getByTestId("sidebar-updates-badge-bb")).toBeTruthy();
    expect(widget()).toBeNull();
    expect(recordTelemetryEventMock).not.toHaveBeenCalled();
  });

  it("shows the release and its highlights alongside the chip", () => {
    renderWidget();

    expect(screen.getByTestId("sidebar-updates-badge-bb")).toBeTruthy();
    const card = screen.getByRole("button", {
      name: "bb 0.47.0 is available. Open Updates",
    });
    expect(card.textContent).toContain("bb 0.47.0 is available");
    expect(card.textContent).toContain("Customizable sidebar navigation");
    expect(card.textContent).toContain("New and improved ACP support");
    expect(card.textContent).toContain("Diff review");
    expect(card.textContent).not.toContain("More customization surfaces");
    expect(card.textContent).not.toContain(":");
  });

  it("stays hidden with no update, while collapsed, or without highlights", () => {
    renderWidget({ available: null });
    expect(widget()).toBeNull();
    cleanup();

    renderWidget({ visible: false });
    expect(widget()).toBeNull();
    cleanup();

    renderWidget({ available: "0.49.0" });
    expect(screen.getByTestId("sidebar-updates-badge-bb")).toBeTruthy();
    expect(widget()).toBeNull();
    expect(recordTelemetryEventMock).not.toHaveBeenCalled();
  });

  it("dismisses the release into the synced preference", () => {
    const { store } = renderWidget();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss the bb 0.47.0 release preview",
      }),
    );

    expect(widget()).toBeNull();
    expect(store.get(dismissedReleaseVersionAtom)).toBe("0.47.0");
    expect(screen.getByTestId("sidebar-updates-badge-bb")).toBeTruthy();
    expect(recordTelemetryEventMock).toHaveBeenCalledWith({
      name: "release_widget_action",
      properties: { release_version: "0.47.0", action: "dismiss" },
    });
  });

  it("keeps a dismissed release hidden and brings a newer one back", () => {
    renderWidget({ dismissed: "0.47.0" });
    expect(widget()).toBeNull();
    cleanup();

    renderWidget({ dismissed: "0.47.0", available: "0.48.0" });
    expect(
      screen.getByRole("button", {
        name: "bb 0.48.0 is available. Open Updates",
      }),
    ).toBeTruthy();
  });

  it("carries the old card's dismissal over once", () => {
    window.localStorage.setItem(LEGACY_KEY, "0.47.0");
    const { store } = renderWidget();

    expect(widget()).toBeNull();
    expect(store.get(dismissedReleaseVersionAtom)).toBe("0.47.0");
    expect(recordTelemetryEventMock).not.toHaveBeenCalled();
    cleanup();

    window.localStorage.setItem(LEGACY_KEY, "0.47.0");
    const newer = renderWidget({ available: "0.48.0" });
    expect(widget()).not.toBeNull();
    expect(newer.store.get(dismissedReleaseVersionAtom)).toBeNull();
  });

  it("opens Settings → Updates with the release in router state", () => {
    const { onNavigate } = renderWidget();

    fireEvent.click(
      screen.getByRole("button", {
        name: "bb 0.47.0 is available. Open Updates",
      }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location").textContent).toBe(
      '/settings/updates {"openReleaseNotes":"0.47.0"}',
    );
    expect(recordTelemetryEventMock).toHaveBeenCalledWith({
      name: "release_widget_action",
      properties: { release_version: "0.47.0", action: "open" },
    });
  });

  it("records it shown once per release per session", () => {
    renderWidget();
    cleanup();
    renderWidget();
    cleanup();
    renderWidget({ available: "0.48.0" });

    expect(recordTelemetryEventMock.mock.calls).toEqual([
      [
        {
          name: "release_widget_shown",
          properties: { release_version: "0.47.0" },
        },
      ],
      [
        {
          name: "release_widget_shown",
          properties: { release_version: "0.48.0" },
        },
      ],
    ]);
  });
});
