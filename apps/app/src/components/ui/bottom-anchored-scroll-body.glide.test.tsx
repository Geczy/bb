// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomAnchoredScrollBody } from "@/components/ui/bottom-anchored-scroll-body";

const SCROLL_AREA_CLASS = "scroll-area";
const FRAME_MS = 16;

class ResizeObserverMock implements ResizeObserver {
  static instances: ResizeObserverMock[] = [];
  readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  trigger() {
    this.callback([], this);
  }
}

let now = 0;
const pendingFrames = new Map<number, FrameRequestCallback>();

function runFrame(): void {
  now += FRAME_MS;
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  for (const callback of callbacks) callback(now);
}

function runFrames(count: number): void {
  for (let index = 0; index < count; index += 1) runFrame();
}

function setScrollHeight(element: HTMLElement, scrollHeight: number): void {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
}

function renderPinnedScrollBody(): HTMLElement {
  const view = render(
    <BottomAnchoredScrollBody
      footer={<div>Footer</div>}
      maxWidthClassName="max-w-none"
      scrollAreaClassName={SCROLL_AREA_CLASS}
    >
      <div data-timeline-row-id="row-a">row-a</div>
    </BottomAnchoredScrollBody>,
  );
  const scrollArea = view.container.querySelector(`.${SCROLL_AREA_CLASS}`);
  if (!(scrollArea instanceof HTMLElement)) throw new Error("missing scroller");
  Object.defineProperty(scrollArea, "clientHeight", {
    configurable: true,
    value: 100,
  });
  setScrollHeight(scrollArea, 400);
  scrollArea.scrollTop = 300;
  ResizeObserverMock.instances.at(-1)?.trigger();
  runFrames(4);
  return scrollArea;
}

function growContent(scrollArea: HTMLElement, scrollHeight: number): void {
  setScrollHeight(scrollArea, scrollHeight);
  ResizeObserverMock.instances.at(-1)?.trigger();
}

beforeEach(() => {
  now = 0;
  pendingFrames.clear();
  let nextHandle = 1;
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      pendingFrames.set(handle, callback);
      return handle;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((handle: number) => pendingFrames.delete(handle)),
  );
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BottomAnchoredScrollBody glide", () => {
  it("glides to the new bottom over several frames when content grows", () => {
    const scrollArea = renderPinnedScrollBody();

    growContent(scrollArea, 500);
    expect(scrollArea.scrollTop).toBe(300);

    runFrame();
    runFrame();
    expect(scrollArea.scrollTop).toBeGreaterThan(300);
    expect(scrollArea.scrollTop).toBeLessThan(400);

    runFrames(40);
    expect(scrollArea.scrollTop).toBe(400);
  });

  it("keeps its speed when more content arrives mid-glide", () => {
    const scrollArea = renderPinnedScrollBody();
    growContent(scrollArea, 500);
    runFrames(3);
    const before = scrollArea.scrollTop;
    runFrame();
    const stepBeforeGrowth = scrollArea.scrollTop - before;

    growContent(scrollArea, 600);
    const atGrowth = scrollArea.scrollTop;
    runFrame();

    expect(scrollArea.scrollTop - atGrowth).toBeGreaterThanOrEqual(
      stepBeforeGrowth,
    );
    runFrames(60);
    expect(scrollArea.scrollTop).toBe(500);
  });

  it("jumps straight to the bottom when the growth is taller than the viewport", () => {
    const scrollArea = renderPinnedScrollBody();

    growContent(scrollArea, 650);

    expect(scrollArea.scrollTop).toBe(550);
  });

  it("stops gliding once the user scrolls away", () => {
    const scrollArea = renderPinnedScrollBody();
    growContent(scrollArea, 500);
    runFrame();
    runFrame();

    fireEvent.wheel(scrollArea, { deltaY: -40 });
    scrollArea.scrollTop = 200;
    fireEvent.scroll(scrollArea);
    runFrames(40);

    expect(scrollArea.scrollTop).toBe(200);
  });
});
