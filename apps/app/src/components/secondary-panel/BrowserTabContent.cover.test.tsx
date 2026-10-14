// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import type {
  BbDesktopBrowserApi,
  BbDesktopBrowserSetCoveredRequest,
  BbDesktopBrowserSnapshot,
} from "@bb/desktop-contract";
import { defaultAppSettings } from "@bb/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBbDesktopApi,
  createNoopDesktopBrowserApi,
} from "@/test/bb-desktop-test-utils";
import { AppCommandProvider } from "@/components/commands/AppCommandProvider";
import { BrowserTabContent } from "./BrowserTabContent";

vi.mock("@/hooks/queries/system-queries", () => ({
  useSystemConfig: () => ({
    data: { generalSettings: defaultAppSettings, keybindings: [] },
  }),
}));

const desktopInfo = {
  lastCheckedAt: null,
  latestVersion: null,
  pendingVersion: null,
  platform: "macos" as const,
  updateAvailable: false,
  updateDownloaded: false,
  version: "0.0.0-test",
};

const BROWSER_RECT = { left: 0, top: 100, right: 800, bottom: 700 };

function domRect(rect: typeof BROWSER_RECT): DOMRect {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  return {
    ...rect,
    x: rect.left,
    y: rect.top,
    width,
    height,
    toJSON: () => rect,
  };
}

interface CoverHarness {
  api: BbDesktopBrowserApi;
  emitSnapshot: (snapshot: BbDesktopBrowserSnapshot) => void;
  setCovered: ReturnType<
    typeof vi.fn<(request: BbDesktopBrowserSetCoveredRequest) => void>
  >;
}

function createCoverHarness(): CoverHarness {
  const snapshotListeners = new Set<
    (snapshot: BbDesktopBrowserSnapshot) => void
  >();
  const setCovered =
    vi.fn<(request: BbDesktopBrowserSetCoveredRequest) => void>();
  const api: BbDesktopBrowserApi = {
    ...createNoopDesktopBrowserApi(),
    setCovered,
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
  };
  return {
    api,
    emitSnapshot(snapshot) {
      for (const listener of snapshotListeners) listener(snapshot);
    },
    setCovered,
  };
}

function renderBrowser(api: BbDesktopBrowserApi) {
  window.bbDesktop = createBbDesktopApi(desktopInfo, api);
  return render(
    <AppCommandProvider>
      <BrowserTabContent
        tabId="browser:test"
        initialUrl="https://example.com/docs"
        addressFocusRequest={null}
        canShowNativeBrowserView={true}
        visibilityCoordinator={null}
        environmentId={null}
        threadId="thread-1"
        onUpdate={() => {}}
      />
    </AppCommandProvider>,
  );
}

function openMenu(rect: typeof BROWSER_RECT): HTMLElement {
  const menu = document.createElement("div");
  menu.setAttribute("data-bb-portaled-overlay", "");
  menu.setAttribute("data-state", "open");
  menu.setAttribute("role", "menu");
  menu.dataset.testRect = JSON.stringify(rect);
  document.body.append(menu);
  return menu;
}

async function flushFrames(count = 2) {
  for (let index = 0; index < count; index += 1) {
    await act(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        }),
    );
  }
}

describe("BrowserTabContent cover placeholder", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const testRect =
          this instanceof HTMLElement ? this.dataset.testRect : undefined;
        if (testRect !== undefined) {
          return domRect(JSON.parse(testRect));
        }
        if (this.classList.contains("flex-1")) {
          return domRect(BROWSER_RECT);
        }
        return domRect({ left: 0, top: 0, right: 0, bottom: 0 });
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    for (const element of document.querySelectorAll(
      "[data-bb-portaled-overlay]",
    )) {
      element.remove();
    }
    delete window.bbDesktop;
  });

  it("covers the native view with a snapshot placeholder while a menu overlaps it", async () => {
    const harness = createCoverHarness();
    renderBrowser(harness.api);
    await flushFrames();
    expect(harness.setCovered).toHaveBeenLastCalledWith({
      tabId: "browser:test",
      covered: false,
    });

    const menu = openMenu({ left: 600, top: 80, right: 780, bottom: 300 });
    await flushFrames();
    expect(harness.setCovered).toHaveBeenLastCalledWith({
      tabId: "browser:test",
      covered: true,
    });
    expect(screen.getByTestId("browser-cover-placeholder")).not.toBeNull();

    act(() => {
      harness.emitSnapshot({
        tabId: "browser:test",
        dataUrl: "data:image/jpeg;base64,AAAA",
      });
    });
    expect(
      document.querySelector('img[src="data:image/jpeg;base64,AAAA"]'),
    ).not.toBeNull();

    menu.setAttribute("data-state", "closed");
    await flushFrames();
    expect(harness.setCovered).toHaveBeenLastCalledWith({
      tabId: "browser:test",
      covered: false,
    });
    expect(screen.queryByTestId("browser-cover-placeholder")).toBeNull();
  });

  it("covers the native view when a submenu opens inside a menu that does not overlap it", async () => {
    const harness = createCoverHarness();
    renderBrowser(harness.api);
    await flushFrames();

    const menu = openMenu({ left: -300, top: 120, right: -10, bottom: 400 });
    await flushFrames(8);
    expect(harness.setCovered).not.toHaveBeenCalledWith({
      tabId: "browser:test",
      covered: true,
    });

    const submenu = document.createElement("div");
    submenu.setAttribute("data-bb-portaled-overlay", "");
    submenu.setAttribute("data-state", "open");
    submenu.setAttribute("role", "menu");
    submenu.dataset.testRect = JSON.stringify({
      left: -20,
      top: 200,
      right: 40,
      bottom: 260,
    });
    menu.append(submenu);
    await flushFrames();

    expect(harness.setCovered).toHaveBeenLastCalledWith({
      tabId: "browser:test",
      covered: true,
    });
  });

  it("ignores menus that do not overlap the browser and tooltips that do", async () => {
    const harness = createCoverHarness();
    renderBrowser(harness.api);
    await flushFrames();

    openMenu({ left: 0, top: 0, right: 200, bottom: 90 });
    const tooltip = openMenu({ left: 100, top: 200, right: 300, bottom: 240 });
    tooltip.removeAttribute("role");
    const tooltipLabel = document.createElement("span");
    tooltipLabel.setAttribute("role", "tooltip");
    tooltip.append(tooltipLabel);
    await flushFrames();

    expect(harness.setCovered).not.toHaveBeenCalledWith({
      tabId: "browser:test",
      covered: true,
    });
    expect(screen.queryByTestId("browser-cover-placeholder")).toBeNull();
  });
});
