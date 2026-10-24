// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFixedPanelTabsState } from "@/lib/fixed-panel-tabs";
import { createBbDesktopApi } from "@/test/bb-desktop-test-utils";
import { recordTelemetryEvent } from "@/components/onboarding/onboarding-telemetry";
import { useOpenReleaseNotes } from "./release-notes";
import {
  SETTINGS_UPDATES_PANEL_STATE_ID,
  UpdatesReleaseNotesLayout,
} from "./UpdatesReleaseNotesLayout";

vi.mock("@/components/onboarding/onboarding-telemetry", () => ({
  recordTelemetryEvent: vi.fn(),
}));

const openUrlInExternalBrowserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/url-open-routing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/url-open-routing")>()),
  openUrlInExternalBrowser: openUrlInExternalBrowserMock,
}));

function OpenReleaseNotesButton({ version }: { version: string }) {
  const openReleaseNotes = useOpenReleaseNotes();
  return (
    <button
      type="button"
      onClick={() => openReleaseNotes(version, "updates_link")}
    >
      {`Open ${version}`}
    </button>
  );
}

function PanelStateProbe() {
  const state = useFixedPanelTabsState(SETTINGS_UPDATES_PANEL_STATE_ID, null);
  return (
    <span data-testid="panel-state">
      {JSON.stringify({
        isOpen: state.secondary.isOpen,
        urls: state.secondary.tabs.flatMap((tab) =>
          tab.kind === "browser" ? [tab.url] : [],
        ),
      })}
    </span>
  );
}

function renderLayout(): void {
  render(
    <JotaiProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UpdatesReleaseNotesLayout>
            <OpenReleaseNotesButton version="0.47.0" />
            <OpenReleaseNotesButton version="0.46.0" />
          </UpdatesReleaseNotesLayout>
          <PanelStateProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </JotaiProvider>,
  );
}

function panelState(): { isOpen: boolean; urls: string[] } {
  return JSON.parse(screen.getByTestId("panel-state").textContent ?? "{}");
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  delete window.bbDesktop;
});

describe("UpdatesReleaseNotesLayout", () => {
  it("opens release notes in one in-app browser tab beside Updates", () => {
    window.bbDesktop = createBbDesktopApi({
      lastCheckedAt: null,
      latestVersion: "0.47.0",
      pendingVersion: null,
      platform: "macos",
      updateAvailable: true,
      updateDownloaded: false,
      version: "0.46.0",
    });
    renderLayout();

    expect(panelState()).toEqual({ isOpen: false, urls: [] });

    fireEvent.click(screen.getByRole("button", { name: "Open 0.47.0" }));
    expect(panelState()).toEqual({
      isOpen: true,
      urls: ["https://getbb.app/changelog#0-47-0"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Open 0.47.0" }));
    fireEvent.click(screen.getByRole("button", { name: "Open 0.46.0" }));
    expect(panelState()).toEqual({
      isOpen: true,
      urls: ["https://getbb.app/changelog#0-46-0"],
    });
    expect(openUrlInExternalBrowserMock).not.toHaveBeenCalled();
    expect(recordTelemetryEvent).toHaveBeenNthCalledWith(1, {
      name: "release_notes_opened",
      properties: {
        release_version: "0.47.0",
        entry_point: "updates_link",
        destination: "browser_panel",
      },
    });
  });

  it("falls back to the external browser without the in-app browser", () => {
    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "Open 0.47.0" }));

    expect(openUrlInExternalBrowserMock).toHaveBeenCalledExactlyOnceWith(
      "https://getbb.app/changelog#0-47-0",
    );
    expect(panelState()).toEqual({ isOpen: false, urls: [] });
    expect(recordTelemetryEvent).toHaveBeenCalledExactlyOnceWith({
      name: "release_notes_opened",
      properties: {
        release_version: "0.47.0",
        entry_point: "updates_link",
        destination: "external_browser",
      },
    });
  });
});
