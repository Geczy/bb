import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type {
  BbDesktopApi,
  BbDesktopBrowserApi,
  BbDesktopBrowserState,
  BbDesktopBrowserStateHandler,
  BbDesktopBrowserViewBounds,
  BbDesktopInfo,
} from "@bb/desktop-contract";

const STORY_DESKTOP_INFO: BbDesktopInfo = {
  lastCheckedAt: null,
  latestVersion: null,
  pendingVersion: null,
  platform: "macos",
  updateAvailable: false,
  updateDownloaded: false,
  version: "0.0.0-story",
};

interface StoryPreviewFrame {
  bounds: BbDesktopBrowserViewBounds;
  reloadCount: number;
  tabId: string;
  url: string;
  visible: boolean;
}

interface StoryPreviewFrameStore {
  getSnapshot(): readonly StoryPreviewFrame[];
  subscribe(listener: () => void): () => void;
  update(
    tabId: string,
    change: (frame: StoryPreviewFrame) => StoryPreviewFrame,
  ): void;
  upsert(frame: StoryPreviewFrame): void;
  remove(tabId: string): void;
  get(tabId: string): StoryPreviewFrame | undefined;
}

function createStoryPreviewFrameStore(): StoryPreviewFrameStore {
  const frames = new Map<string, StoryPreviewFrame>();
  const listeners = new Set<() => void>();
  let snapshot: readonly StoryPreviewFrame[] = [];
  const publish = () => {
    snapshot = [...frames.values()];
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(tabId, change) {
      const frame = frames.get(tabId);
      if (frame === undefined) return;
      frames.set(tabId, change(frame));
      publish();
    },
    upsert(frame) {
      frames.set(frame.tabId, frame);
      publish();
    },
    remove(tabId) {
      if (frames.delete(tabId)) publish();
    },
    get: (tabId) => frames.get(tabId),
  };
}

function storyPreviewState(frame: StoryPreviewFrame): BbDesktopBrowserState {
  return {
    tabId: frame.tabId,
    url: frame.url,
    title: null,
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    errorText: null,
  };
}

function createStoryDesktopBrowserApi(
  initialState: BbDesktopBrowserState | null,
  previewFrames: StoryPreviewFrameStore | null,
): BbDesktopBrowserApi {
  const stateListeners = new Set<BbDesktopBrowserStateHandler>();
  const emitFrameState = (tabId: string) => {
    queueMicrotask(() => {
      const frame = previewFrames?.get(tabId);
      if (frame === undefined) return;
      for (const listener of stateListeners) listener(storyPreviewState(frame));
    });
  };
  return {
    attach(request) {
      if (previewFrames === null) return;
      const existing = previewFrames.get(request.tabId);
      previewFrames.upsert({
        tabId: request.tabId,
        url: existing?.url ?? request.url,
        bounds: request.bounds,
        visible: request.visible,
        reloadCount: existing?.reloadCount ?? 0,
      });
      emitFrameState(request.tabId);
    },
    detach(tabId) {
      previewFrames?.remove(tabId);
    },
    navigate({ tabId, url }) {
      previewFrames?.update(tabId, (frame) => ({ ...frame, url }));
      emitFrameState(tabId);
    },
    goBack() {},
    goForward() {},
    reload(tabId) {
      previewFrames?.update(tabId, (frame) => ({
        ...frame,
        reloadCount: frame.reloadCount + 1,
      }));
    },
    stop() {},
    setBounds({ tabId, bounds }) {
      previewFrames?.update(tabId, (frame) => ({ ...frame, bounds }));
    },
    setVisible({ tabId, visible }) {
      previewFrames?.update(tabId, (frame) => ({ ...frame, visible }));
    },
    onState(listener) {
      let subscribed = true;
      stateListeners.add(listener);
      if (initialState !== null) {
        queueMicrotask(() => {
          if (subscribed) listener(initialState);
        });
      }
      if (previewFrames !== null) {
        queueMicrotask(() => {
          if (!subscribed) return;
          for (const frame of previewFrames.getSnapshot()) {
            listener(storyPreviewState(frame));
          }
        });
      }
      return () => {
        subscribed = false;
        stateListeners.delete(listener);
      };
    },
    onOpenTab() {
      return () => {};
    },
  };
}

function createStoryDesktopApi(
  browserState: BbDesktopBrowserState | null,
  previewFrames: StoryPreviewFrameStore | null,
  desktopInfo: Partial<BbDesktopInfo> | undefined,
): BbDesktopApi {
  const info: BbDesktopInfo = { ...STORY_DESKTOP_INFO, ...desktopInfo };
  return {
    ...info,
    browser: createStoryDesktopBrowserApi(browserState, previewFrames),
    async checkForUpdates() {
      return info;
    },
    async getInfo() {
      return info;
    },
    async installUpdate() {},
    onChange() {
      return () => {};
    },
    setTheme() {},
    openExternalUrl() {},
  };
}

function StoryPreviewFrames({ store }: { store: StoryPreviewFrameStore }) {
  const frames = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return createPortal(
    frames.map((frame) =>
      frame.url.length === 0 ? null : (
        <iframe
          key={`${frame.tabId}:${frame.reloadCount}`}
          data-story-browser-preview={frame.tabId}
          title={frame.url}
          src={frame.url}
          className="fixed z-50 border-0 bg-white"
          style={{
            display:
              frame.visible && frame.bounds.width > 0 && frame.bounds.height > 0
                ? "block"
                : "none",
            left: frame.bounds.x,
            top: frame.bounds.y,
            width: frame.bounds.width,
            height: frame.bounds.height,
          }}
        />
      ),
    ),
    document.body,
  );
}

interface WithDesktopBrowserProps {
  browserState?: BbDesktopBrowserState | null;
  children: ReactNode;
  desktopInfo?: Partial<BbDesktopInfo>;
  previewFrames?: boolean;
}

export function WithDesktopBrowser({
  browserState = null,
  children,
  desktopInfo,
  previewFrames = false,
}: WithDesktopBrowserProps) {
  const [previewStore] = useState(() =>
    previewFrames ? createStoryPreviewFrameStore() : null,
  );
  const [desktopApi] = useState(() =>
    createStoryDesktopApi(browserState, previewStore, desktopInfo),
  );
  if (typeof window !== "undefined" && window.bbDesktop === undefined) {
    window.bbDesktop = desktopApi;
  }
  useEffect(() => {
    if (window.bbDesktop === undefined) {
      window.bbDesktop = desktopApi;
    }
    return () => {
      if (window.bbDesktop === desktopApi) {
        delete window.bbDesktop;
      }
    };
  }, [desktopApi]);
  return (
    <>
      {children}
      {previewStore === null ? null : (
        <StoryPreviewFrames store={previewStore} />
      )}
    </>
  );
}
