import { useCallback, useMemo, useState, type ReactNode } from "react";
import { COARSE_POINTER_COMPACT_ICON_SIZE_CLASS } from "@bb/shared-ui/coarse-pointer-sizing";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { BrowserTabIcon } from "@/components/secondary-panel/BrowserTabIcon";
import { SecondaryPanelLayout } from "@/components/secondary-panel/SecondaryPanelLayout";
import type { SecondaryPanelRenderableTab } from "@/components/secondary-panel/ThreadSecondaryPanel";
import {
  LazyBrowserTabDeck,
  LazyThreadSecondaryPanel,
} from "@/components/secondary-panel/lazySecondaryPanelComponents";
import { useThreadFileTabs } from "@/components/secondary-panel/useThreadFileTabs";
import { PageShell } from "@/components/ui/page-shell.js";
import { isDesktopBrowserAvailable } from "@/lib/bb-desktop";
import { getBrowserUrlHost } from "@/lib/browser-url";
import {
  useCloseFixedSecondaryPanel,
  useFixedPanelTabsState,
  useTouchFixedPanelTabsState,
} from "@/lib/fixed-panel-tabs";
import { getActiveFixedSecondaryTab } from "@/views/thread-detail/threadSecondaryPanelSelection";
import { useThreadSecondaryPanelDrawerVisibility } from "@/views/thread-detail/useThreadSecondaryPanelVisibility";
import { ReleaseNotesPanelContext } from "./release-notes";

export const SETTINGS_UPDATES_PANEL_STATE_ID = "settings-updates";

const SETTINGS_PAGE_CONTENT_CLASS = "pt-4 md:pt-5";

function noop(): void {}

export function UpdatesReleaseNotesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [browserAvailable] = useState(isDesktopBrowserAvailable);
  if (!browserAvailable) {
    return (
      <PageShell contentClassName={SETTINGS_PAGE_CONTENT_CLASS}>
        {children}
      </PageShell>
    );
  }
  return <ReleaseNotesPanelHost>{children}</ReleaseNotesPanelHost>;
}

function ReleaseNotesPanelHost({ children }: { children: ReactNode }) {
  const isCompactViewport = useIsCompactViewport();
  const fixedPanelTabsState = useFixedPanelTabsState(
    SETTINGS_UPDATES_PANEL_STATE_ID,
    null,
  );
  const drawer = useThreadSecondaryPanelDrawerVisibility({
    isCompactViewport,
    threadId: SETTINGS_UPDATES_PANEL_STATE_ID,
  });
  const isOpen = isCompactViewport
    ? drawer.isDrawerVisible
    : fixedPanelTabsState.secondary.isOpen;
  const activeTab = getActiveFixedSecondaryTab({ fixedPanelTabsState });
  const touchPanelState = useTouchFixedPanelTabsState(
    SETTINGS_UPDATES_PANEL_STATE_ID,
    null,
  );
  const closePersistedPanel = useCloseFixedSecondaryPanel(
    SETTINGS_UPDATES_PANEL_STATE_ID,
    null,
  );
  const {
    activateTab,
    browserTabs,
    closeTab,
    openTab,
    orderedSecondaryFileTabs,
    reorderTab,
    updateBrowserTab,
  } = useThreadFileTabs({
    panelStateId: SETTINGS_UPDATES_PANEL_STATE_ID,
    syncThreadId: null,
    environmentId: null,
    onCloseLastTab: drawer.closeDrawer,
    storageFiles: undefined,
    terminalSessions: undefined,
  });

  const closePanel = useCallback(() => {
    closePersistedPanel();
    drawer.closeDrawer();
  }, [closePersistedPanel, drawer]);
  const togglePanel = useCallback(() => {
    if (isOpen) {
      closePanel();
    }
  }, [closePanel, isOpen]);

  const openInPanel = useCallback(
    (url: string) => {
      const existing = browserTabs.find((tab) => tab.url === url);
      if (existing === undefined) {
        for (const tab of browserTabs) {
          closeTab(tab.id, { remember: false });
        }
        openTab({ kind: "browser", url });
      } else {
        activateTab(existing.id);
      }
      drawer.openDrawer();
    },
    [activateTab, browserTabs, closeTab, drawer, openTab],
  );
  const openInBrowserTab = useCallback(
    (url?: string) => {
      if (url !== undefined && url.length > 0) {
        openTab({ kind: "browser", url });
      }
    },
    [openTab],
  );

  const panelTabs = useMemo<readonly SecondaryPanelRenderableTab[]>(
    () =>
      orderedSecondaryFileTabs.flatMap((tab): SecondaryPanelRenderableTab[] => {
        if (tab.kind !== "browser") {
          return [];
        }
        const label =
          tab.title ?? (tab.url.length > 0 ? getBrowserUrlHost(tab.url) : "");
        return [
          {
            label: label.length > 0 ? label : "Release notes",
            leadingVisual: (
              <BrowserTabIcon
                tabId={tab.id}
                className={COARSE_POINTER_COMPACT_ICON_SIZE_CLASS}
              />
            ),
            statusLabel: null,
            onSelect: () => activateTab(tab.id),
            onClose: () => closeTab(tab.id),
            renderContent: () => null,
            tab,
          },
        ];
      }),
    [activateTab, closeTab, orderedSecondaryFileTabs],
  );

  return (
    <ReleaseNotesPanelContext.Provider value={openInPanel}>
      <div className="-mx-4 -mb-4 -mt-4 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-clip md:-mx-5 md:-mb-5 md:-mt-5">
        <SecondaryPanelLayout
          open={isOpen}
          onToggle={togglePanel}
          onClose={closePanel}
          resetKey={SETTINGS_UPDATES_PANEL_STATE_ID}
          contentKey={SETTINGS_UPDATES_PANEL_STATE_ID}
          drawerLabel="Release notes"
          drawerFallback={null}
          mainPanelId="settings-updates-main-panel"
          composerHost={null}
          main={
            <PageShell
              shellClassName="m-0 md:m-0"
              contentClassName={SETTINGS_PAGE_CONTENT_CLASS}
            >
              {children}
            </PageShell>
          }
          renderPanel={({
            presentation,
            canShowNativeBrowserView,
            onToggleMainCollapse,
            resizablePanelId,
          }) => (
            <LazyThreadSecondaryPanel
              activeTab={activeTab}
              canUseGitUi={false}
              metadataContent={null}
              tabs={panelTabs}
              fixedTabs={[]}
              onTabReorder={reorderTab}
              renderBrowserDeck={(activeBrowserTabId, pane) => (
                <LazyBrowserTabDeck
                  browserTabs={browserTabs}
                  activeBrowserTabId={activeBrowserTabId}
                  environmentId={null}
                  canShowNativeBrowserView={canShowNativeBrowserView}
                  canHandleBrowserCommands={
                    canShowNativeBrowserView && pane.isFocused
                  }
                  onNativeFocus={pane.onFocusPane}
                  threadId={SETTINGS_UPDATES_PANEL_STATE_ID}
                  onUpdate={updateBrowserTab}
                  onOpenInNewTab={openInBrowserTab}
                />
              )}
              drawerFallback={null}
              isOpen={isOpen}
              showConversationCollapseControl={false}
              showNewTabButton={false}
              resizablePanelId={resizablePanelId}
              onPanelFocus={touchPanelState}
              onCollapse={closePanel}
              onClose={closePanel}
              onOpenNewTab={noop}
              isConversationCollapsed={false}
              onToggleConversationCollapse={onToggleMainCollapse}
              renderAsDrawer={presentation === "drawer"}
            />
          )}
        />
      </div>
    </ReleaseNotesPanelContext.Provider>
  );
}
