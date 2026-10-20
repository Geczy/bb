// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
  within,
} from "@testing-library/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetPluginLogoStoreForTest,
  setPluginLogoUrls,
} from "@/lib/plugin-logos";
import { COMPACT_VIEWPORT_QUERY } from "@bb/shared-ui/hooks/use-compact-viewport";
import { POINTER_COARSE_QUERY } from "@bb/shared-ui/hooks/use-pointer-coarse";
import {
  findMessageActionTooltipCollisionBoundary,
  MessageActionBar,
} from "./MessageActionBar";

function render(ui: ReactNode) {
  return renderComponent(ui, { wrapper: Provider });
}

const TIMESTAMP = Date.UTC(2026, 8, 30, 16, 5);

afterEach(() => {
  cleanup();
  window.localStorage.removeItem("bb.messageActionRecents.user");
  window.localStorage.removeItem("bb.messageActionRecents.assistant");
  resetPluginLogoStoreForTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function installControlledResizeObserver() {
  const observations: { callback: ResizeObserverCallback; node: Element }[] =
    [];
  class ControlledResizeObserver {
    readonly #callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
    }
    observe(node: Element) {
      observations.push({ callback: this.#callback, node });
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  return {
    reportWidth(width: number) {
      act(() => {
        for (const { callback, node } of observations) {
          callback(
            [
              {
                target: node,
                contentRect: { width, height: 20 },
              } as unknown as ResizeObserverEntry,
            ],
            undefined as unknown as ResizeObserver,
          );
        }
      });
    },
  };
}

function mockMobileCoarsePointer() {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === COMPACT_VIEWPORT_QUERY || query === POINTER_COARSE_QUERY,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function openDesktopMenu() {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Message actions" }),
  );
  return screen.getByRole("menu");
}

function renderTwoNarrowAssistantRows() {
  const resizeObserver = installControlledResizeObserver();
  const actions = ["Summarize", "Translate"].map((label) => ({
    key: label,
    pluginId: null,
    icon: null,
    label,
    onSelect: vi.fn(),
  }));
  render(
    <>
      {[0, 1].map((index) => (
        <section key={index} data-testid={`row-${index}`}>
          <MessageActionBar
            messageRole="assistant"
            timestamp={TIMESTAMP}
            messageText="Message"
            alignment="start"
            mobileActionDisplay="inline"
            pluginActions={actions}
          />
        </section>
      ))}
    </>,
  );
  resizeObserver.reportWidth(72);
  const row = (index: number) => screen.getByTestId(`row-${index}`);
  const labels = (index: number) =>
    within(row(index))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
  const slot = row(0).firstElementChild!;
  let pointerOverSlot = false;
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    if (selector === ":hover" && this === slot) return pointerOverSlot;
    return matches.call(this, selector);
  });
  const selectTranslateFromMenu = (pointerStaysOnRow: boolean) => {
    pointerOverSlot = true;
    fireEvent.pointerEnter(slot);
    fireEvent.pointerDown(
      within(row(0)).getByRole("button", { name: "Message actions" }),
    );
    const menu = screen.getByRole("menu");
    fireEvent.pointerEnter(menu);
    pointerOverSlot = pointerStaysOnRow;
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Translate" }));
  };
  return { labels, slot, selectTranslateFromMenu };
}

describe("MessageActionBar", () => {
  it("keeps Copy fixed and shares recent actions only within the same message role", () => {
    const actions = ["Summarize", "Translate"].map((label) => ({
      key: label,
      pluginId: null,
      icon: null,
      label,
      onSelect: vi.fn(),
    }));
    const fixture = (
      <>
        {["user", "assistant", "assistant"].map((role, index) => (
          <section key={index} data-testid={`row-${index}`}>
            <MessageActionBar
              messageRole={role === "user" ? "user" : "assistant"}
              timestamp={TIMESTAMP}
              messageText="Message"
              alignment="start"
              mobileActionDisplay="inline"
              pluginActions={actions}
            />
          </section>
        ))}
      </>
    );
    const firstRender = render(fixture);
    const row = (index: number) => screen.getByTestId(`row-${index}`);
    const labels = (index: number) =>
      within(row(index))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"));
    const bar = within(row(1))
      .getByRole("button", { name: "Translate" })
      .closest(".relative")!;
    fireEvent.pointerEnter(bar);
    fireEvent.click(within(row(1)).getByRole("button", { name: "Translate" }));
    expect(labels(1)).toEqual([
      "Copy message",
      "Summarize",
      "Translate",
      "Message actions",
    ]);
    expect(labels(2)).toEqual([
      "Copy message",
      "Translate",
      "Summarize",
      "Message actions",
    ]);
    fireEvent.pointerLeave(bar);
    expect(labels(1)).toEqual(labels(2));
    expect(labels(0)).toEqual([
      "Copy message",
      "Summarize",
      "Translate",
      "Message actions",
    ]);
    firstRender.unmount();
    render(fixture);
    expect(labels(2)).toEqual([
      "Copy message",
      "Translate",
      "Summarize",
      "Message actions",
    ]);
    expect(labels(0)).toEqual([
      "Copy message",
      "Summarize",
      "Translate",
      "Message actions",
    ]);
  });

  it("re-sorts a row after a mouse-selected menu item closes the menu away from the row", () => {
    const { labels, selectTranslateFromMenu } = renderTwoNarrowAssistantRows();
    expect(labels(0)).toEqual(["Copy message", "Summarize", "Message actions"]);
    selectTranslateFromMenu(false);
    expect(labels(1)).toEqual(["Copy message", "Translate", "Message actions"]);
    expect(labels(0)).toEqual(labels(1));
  });

  it("keeps a row frozen after a mouse-selected menu item while the pointer stays on the row", () => {
    const { labels, slot, selectTranslateFromMenu } =
      renderTwoNarrowAssistantRows();
    selectTranslateFromMenu(true);
    expect(labels(0)).toEqual(["Copy message", "Summarize", "Message actions"]);
    expect(labels(1)).toEqual(["Copy message", "Translate", "Message actions"]);
    fireEvent.pointerLeave(slot);
    expect(labels(0)).toEqual(labels(1));
  });

  it("ranks inline and overflow actions together without growing the visible row", () => {
    const resizeObserver = installControlledResizeObserver();
    const onSelect = vi.fn();
    const fixture = (generation: number) => (
      <MessageActionBar
        messageRole="assistant"
        timestamp={TIMESTAMP}
        messageText="Message"
        alignment="start"
        mobileActionDisplay="inline"
        onEdit={vi.fn()}
        onCopyLink={vi.fn()}
        onAddToChat={vi.fn()}
        onFork={vi.fn()}
        pluginActions={[
          {
            key: `demo/translate/${generation}`,
            recencyKey: "plugin/demo/translate",
            pluginId: null,
            icon: null,
            label: "Translate",
            onSelect,
          },
        ]}
      />
    );
    const view = render(fixture(1));
    resizeObserver.reportWidth(72);
    const trigger = screen.getByRole("button", { name: "Message actions" });
    act(() => trigger.focus());
    const translate = within(openDesktopMenu()).getByRole("menuitem", {
      name: "Translate",
    });
    act(() => translate.focus());
    fireEvent.click(translate);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Translate" })).toBeTruthy();
    view.rerender(fixture(2));
    expect(screen.getByRole("button", { name: "Translate" })).toBeTruthy();
    fireEvent.click(
      within(openDesktopMenu()).getByRole("menuitem", { name: "Copy link" }),
    );
    act(() => {
      trigger.blur();
    });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull();
    for (const name of ["Add to chat", "Fork thread"]) {
      fireEvent.click(
        within(openDesktopMenu()).getByRole("menuitem", { name }),
      );
      act(() => trigger.blur());
      expect(screen.getByRole("button", { name })).toBeTruthy();
      expect(screen.getAllByRole("button")).toHaveLength(3);
    }
    resizeObserver.reportWidth(300);
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Copy message",
      "Fork thread",
      "Add to chat",
      "Message actions",
    ]);
  });

  it("uses the nearest thread window as the tooltip collision boundary", () => {
    const threadWindow = document.createElement("div");
    threadWindow.setAttribute("data-thread-window", "");
    const sidePanel = document.createElement("aside");
    const actionBar = document.createElement("div");
    threadWindow.append(actionBar);
    document.body.append(threadWindow, sidePanel);

    expect(findMessageActionTooltipCollisionBoundary(actionBar)).toBe(
      threadWindow,
    );
    expect(
      findMessageActionTooltipCollisionBoundary(sidePanel),
    ).toBeUndefined();
  });

  it("keeps candidates inline in priority order and reserves the menu for trailing actions", () => {
    const resizeObserver = installControlledResizeObserver();
    setPluginLogoUrls(
      new Map([
        [
          "demo",
          {
            displayName: "Demo",
            icon: "Check",
            compactIconUrl: "/demo.svg",
            logoUrl: null,
            logoDarkUrl: null,
            icons: new Map(),
          },
        ],
      ]),
    );
    const onPluginSelect = vi.fn();
    const onCopyLink = vi.fn();
    const { container } = render(
      <MessageActionBar
        messageRole="assistant"
        timestamp={TIMESTAMP}
        messageText="An answer."
        alignment="start"
        mobileActionDisplay="inline"
        onEdit={vi.fn()}
        onCopyLink={onCopyLink}
        onAddToChat={vi.fn()}
        onFork={vi.fn()}
        pluginActions={[
          {
            key: "demo/summarize/1",
            pluginId: "demo",
            icon: "Zap",
            label: "Summarize",
            onSelect: onPluginSelect,
          },
        ]}
      />,
    );
    resizeObserver.reportWidth(100);

    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button[aria-label]")]
        .map((button) => button.getAttribute("aria-label"))
        .filter((label) => label !== "Message actions"),
    ).toEqual(["Copy message", "Edit message", "Summarize"]);
    expect(
      screen
        .getByRole("button", { name: "Summarize" })
        .querySelector('[data-icon="Zap"]'),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Summarize" }));
    expect(onPluginSelect).toHaveBeenCalledTimes(1);

    const menu = openDesktopMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Copy link", "Add to chat", "Fork thread"]);
    expect(menu.getAttribute("data-side")).toBe("bottom");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy link" }));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it("moves candidates that do not fit into the menu from the end", () => {
    const resizeObserver = installControlledResizeObserver();
    render(
      <MessageActionBar
        messageRole="user"
        timestamp={TIMESTAMP}
        messageText="An answer."
        alignment="end"
        mobileActionDisplay="inline"
        onEdit={vi.fn()}
        onCopyLink={vi.fn()}
        onAddToChat={vi.fn()}
        onFork={vi.fn()}
        pluginActions={[
          {
            key: "demo/summarize/1",
            pluginId: null,
            icon: "Zap",
            label: "Summarize",
            onSelect: vi.fn(),
          },
          {
            key: "demo/translate/1",
            pluginId: null,
            icon: "Languages",
            label: "Translate",
            onSelect: vi.fn(),
          },
        ]}
      />,
    );
    resizeObserver.reportWidth(72);

    expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit message" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Summarize" })).toBeNull();

    expect(
      within(openDesktopMenu())
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Summarize",
      "Translate",
      "Copy link",
      "Add to chat",
      "Fork thread",
    ]);
  });

  it("puts every candidate in the menu when none fit", () => {
    const resizeObserver = installControlledResizeObserver();
    render(
      <MessageActionBar
        messageRole="user"
        timestamp={TIMESTAMP}
        messageText="An answer."
        alignment="end"
        mobileActionDisplay="inline"
        onEdit={vi.fn()}
        onAddToChat={vi.fn()}
        onFork={vi.fn()}
      />,
    );
    resizeObserver.reportWidth(30);

    expect(screen.queryByRole("button", { name: "Copy message" })).toBeNull();
    expect(
      within(openDesktopMenu())
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Copy message", "Edit message", "Add to chat", "Fork thread"]);
  });

  it("shows a timestamp-only footer in the menu", () => {
    render(
      <MessageActionBar
        messageRole="assistant"
        timestamp={TIMESTAMP}
        messageText="An answer."
        alignment="start"
        mobileActionDisplay="inline"
      />,
    );

    const menu = openDesktopMenu();
    const metadata = menu.querySelector<HTMLElement>("[data-message-metadata]");
    const time = within(metadata!).getByRole("time");
    expect(time.getAttribute("datetime")).toBe("2026-09-30T16:05:00.000Z");
    expect(time.textContent).not.toBe("");
    expect(metadata?.textContent).not.toMatch(/model|reasoning/i);
  });

  it("lists every action in the latest touch message drawer even when actions fit inline", async () => {
    mockMobileCoarsePointer();
    const resizeObserver = installControlledResizeObserver();
    const onFork = vi.fn();
    const onPluginSelect = vi.fn();
    render(
      <main data-testid="app-root">
        <MessageActionBar
          messageRole="assistant"
          timestamp={TIMESTAMP}
          messageText="An answer."
          alignment="start"
          mobileActionDisplay="inline"
          onEdit={vi.fn()}
          onAddToChat={vi.fn()}
          onFork={onFork}
          pluginActions={[
            {
              key: "demo/summarize/1",
              pluginId: null,
              icon: "Zap",
              label: "Summarize",
              onSelect: onPluginSelect,
            },
          ]}
        />
      </main>,
    );
    resizeObserver.reportWidth(200);

    expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Summarize" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));

    const drawer = await screen.findByRole("dialog", {
      name: "Message actions",
    });
    const menuItems = await within(drawer).findAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Copy message",
      "Edit message",
      "Summarize",
      "Add to chat",
      "Fork thread",
    ]);
    resizeObserver.reportWidth(60);
    expect(screen.queryByRole("button", { name: "Summarize" })).toBeNull();
    expect(
      within(drawer)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Copy message",
      "Edit message",
      "Summarize",
      "Add to chat",
      "Fork thread",
    ]);
    expect(document.body.querySelector('[data-side="top"]')).toBeNull();
    expect(screen.getByTestId("app-root").hasAttribute("inert")).toBe(false);
    expect(screen.getByTestId("app-root").hasAttribute("aria-hidden")).toBe(
      false,
    );
    fireEvent.click(
      within(drawer).getByRole("menuitem", { name: "Fork thread" }),
    );
    expect(onFork).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));
    fireEvent.click(
      await within(drawer).findByRole("menuitem", { name: "Summarize" }),
    );
    expect(onPluginSelect).toHaveBeenCalledTimes(1);
  });

  it("shows only the menu trigger on older touch messages", async () => {
    mockMobileCoarsePointer();
    const onCopyLink = vi.fn();
    render(
      <MessageActionBar
        messageRole="assistant"
        timestamp={TIMESTAMP}
        messageText="An earlier answer."
        alignment="start"
        mobileActionDisplay="overflow"
        onEdit={vi.fn()}
        onCopyLink={onCopyLink}
        onAddToChat={vi.fn()}
        onFork={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Copy message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));

    const drawer = await screen.findByRole("dialog", {
      name: "Message actions",
    });
    const menuItems = await within(drawer).findAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Copy message",
      "Edit message",
      "Copy link",
      "Add to chat",
      "Fork thread",
    ]);
    fireEvent.click(
      within(drawer).getByRole("menuitem", { name: "Copy link" }),
    );
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it("marks the action row while the menu is open", () => {
    render(
      <MessageActionBar
        messageRole="user"
        timestamp={TIMESTAMP}
        messageText="An answer."
        alignment="end"
        mobileActionDisplay="inline"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Message actions" });
    const row = trigger.parentElement;

    expect(row?.hasAttribute("data-menu-open")).toBe(false);
    fireEvent.pointerDown(trigger);
    expect(row?.hasAttribute("data-menu-open")).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(row?.hasAttribute("data-menu-open")).toBe(false);
  });
});
