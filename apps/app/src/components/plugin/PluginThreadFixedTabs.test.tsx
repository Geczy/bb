// @vitest-environment jsdom

import { ThreadInfoContentContext } from "@/components/secondary-panel/thread-info-registration";

import { useReconciledFixedPanelTabsState } from "@/lib/fixed-panel-tabs";
import {
  createEmptyFixedPanelTabsState,
  createPluginFixedPanelTab,
  createThreadInfoFixedPanelTab,
  getFixedPanelTabsStateStorageKey,
  serializeFixedPanelTabsState,
} from "@/lib/fixed-panel-tabs-state";
import {
  markPluginFrontendBootStarted,
  markPluginFrontendsSettled,
  resetPluginFrontendBootStateForTest,
} from "@/lib/plugin-frontend-boot-state";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  definePluginApp,
  collectPluginAppRegistrations,
} from "@/lib/plugin-app-definition";
import {
  setPluginSlotRegistrations,
  removePluginSlotRegistrations,
  resetPluginSlotStoreForTest,
} from "@/lib/plugin-slots";
import { openAppFixedTabFromDestinations } from "@/lib/app-fixed-tab-navigation";
import { usePluginId } from "./plugin-context";
import { resetAllCrashedPluginSlotsForTest } from "./PluginSlotMount";
import {
  createThreadFixedTabDestination,
  createThreadFixedTabDescriptor,
  buildThreadFixedPanelViewTabs,
  ThreadFixedTabContent,
  useThreadFixedTabs,
} from "./PluginThreadFixedTabs";

function install(title = "Status") {
  setPluginSlotRegistrations(
    "example",
    collectPluginAppRegistrations(
      definePluginApp((app) => {
        app.slots.experimental_threadFixedTab({
          id: "status",
          title,
          icon: "Info",
          useVisible: ({ threadId }) =>
            usePluginId() === "example" && threadId !== "hidden",
          component: function Status({ threadId }) {
            return (
              <div>
                {usePluginId()}:{threadId}:{title}
              </div>
            );
          },
        });
      }),
    ),
  );
}

function Host({ threadId }: { threadId: string | null }) {
  const { entries, observers } = useThreadFixedTabs({ threadId });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const destinations = entries.map((entry) =>
    createThreadFixedTabDestination(entry, (selected) =>
      setActiveId(selected.tab.id),
    ),
  );
  const entry = entries.find((candidate) => candidate.tab.id === activeId);
  return (
    <>
      {observers}
      {threadId === null
        ? null
        : entries.map((entry) => {
            const descriptor = createThreadFixedTabDescriptor(
              entry,
              threadId,
              (reference) =>
                setAccepted(
                  openAppFixedTabFromDestinations(destinations, {
                    surface: { kind: "current" },
                    tab: reference,
                  }),
                ),
            );
            return (
              <button
                key={entry.tab.id}
                aria-label={descriptor.ariaLabel}
                title={descriptor.title}
                onClick={descriptor.onSelect}
              >
                {descriptor.label}
              </button>
            );
          })}
      <button
        onClick={() =>
          setAccepted(
            openAppFixedTabFromDestinations(destinations, {
              surface: { kind: "current" },
              tab: entries[0]?.reference ?? {
                ownerId: "missing",
                tabId: "missing",
              },
              target: { invalid: true },
            }),
          )
        }
      >
        Invalid target
      </button>
      <output>{String(accepted)}</output>
      <ThreadInfoContentContext.Provider
        value={<div>Core info:{threadId}</div>}
      >
        {entry === undefined || threadId === null ? null : (
          <ThreadFixedTabContent entry={entry} threadId={threadId} />
        )}
      </ThreadInfoContentContext.Provider>
    </>
  );
}

function RestoringHost() {
  const { entries, observers, isReady } = useThreadFixedTabs({
    threadId: "thr_restore",
  });
  const state = useReconciledFixedPanelTabsState({
    fixedTabs: entries.map((entry) => entry.tab),
    isAuthoritative: isReady,
    panelStateId: "thr_restore",
    syncThreadId: null,
  });
  return (
    <>
      {observers}
      <output>{state.secondary.activeTabId}</output>
    </>
  );
}

function mount(threadId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Host threadId={threadId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    ...result,
    changeThread: (id: string | null) =>
      result.rerender(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Host threadId={id} />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
  };
}

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
  resetPluginFrontendBootStateForTest();
  window.localStorage.clear();
  resetAllCrashedPluginSlotsForTest();
});

describe("thread fixed-tab contract", () => {
  it.each([
    ["Info", "Core info:thr_one"],
    ["Status", "example:thr_one:Status"],
  ])(
    "selects and renders %s through registered destinations",
    (title, content) => {
      install();
      mount("thr_one");
      fireEvent.click(
        screen.getByRole("button", { name: `Show ${title} panel` }),
      );
      expect(screen.getByText(content)).toBeTruthy();
      expect(
        screen
          .getByRole("button", { name: `Show ${title} panel` })
          .getAttribute("title"),
      ).toBe(title);
      expect(screen.getByRole("status").textContent).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Invalid target" }));
      expect(screen.getByRole("status").textContent).toBe("false");
      expect(screen.getByText(content)).toBeTruthy();
    },
  );

  it("keeps default Info before pinned Diff to match the Plugin Guide and Theme Preview fixtures", () => {
    const { result } = renderHook(() => {
      const { entries } = useThreadFixedTabs({ threadId: "thr_fixture" });
      return buildThreadFixedPanelViewTabs({ entries, includeDiff: true });
    });
    expect(result.current.map((tab) => tab.kind)).toEqual([
      "thread-info",
      "git-diff",
    ]);
  });

  it("does not expose or mount thread tabs without a thread", () => {
    install();
    const view = mount(null);
    expect(
      screen.queryByRole("button", { name: "Show Info panel" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Show Status panel" }),
    ).toBeNull();
    view.changeThread("");
    expect(
      screen.queryByRole("button", { name: "Show Info panel" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Show Status panel" }),
    ).toBeNull();
    view.changeThread("thr_one");
    fireEvent.click(screen.getByRole("button", { name: "Show Status panel" }));
    expect(screen.getByText("example:thr_one:Status")).toBeTruthy();
  });

  it("keeps a restored selection while registrations and initial visibility are loading", () => {
    const plugin = createPluginFixedPanelTab({
      pluginId: "example",
      tabId: "status",
    });
    const state = createEmptyFixedPanelTabsState({
      lastUsedAt: Date.now(),
      secondary: {
        tabs: [createThreadInfoFixedPanelTab(), plugin],
        activeTabId: plugin.id,
        isOpen: true,
      },
    });
    const key = getFixedPanelTabsStateStorageKey({ threadId: "thr_restore" });
    window.localStorage.setItem(key, serializeFixedPanelTabsState({ state }));
    markPluginFrontendBootStarted();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RestoringHost />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe(plugin.id);
    act(() => {
      install();
      markPluginFrontendsSettled();
    });
    expect(screen.getByRole("status").textContent).toBe(plugin.id);
  });

  it("updates visibility per thread and replaces reloaded components without duplicating tabs", () => {
    install();
    const view = mount("thr_one");
    fireEvent.click(screen.getByRole("button", { name: "Show Status panel" }));
    view.changeThread("hidden");
    expect(
      screen.queryByRole("button", { name: "Show Status panel" }),
    ).toBeNull();
    view.changeThread("thr_two");
    expect(screen.getByText("example:thr_two:Status")).toBeTruthy();
    act(() => install("Reloaded"));
    expect(
      screen.getAllByRole("button", { name: "Show Reloaded panel" }),
    ).toHaveLength(1);
    expect(screen.getByText("example:thr_two:Reloaded")).toBeTruthy();
    act(() => removePluginSlotRegistrations("example"));
    expect(
      screen.queryByRole("button", { name: "Show Reloaded panel" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show Info panel" }),
    ).toBeTruthy();
  });
});
