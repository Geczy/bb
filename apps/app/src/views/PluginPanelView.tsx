import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { Navigate, useLocation } from "react-router-dom";
import { requestedHomepageAtom } from "@/lib/homepage";
import { PageShell } from "@/components/ui/page-shell.js";
import { EmptyStatePanel } from "@bb/shared-ui/empty-state";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import { usePluginFrontendsSettled } from "@/lib/plugin-frontend-boot-state";
import { usePluginSlots } from "@/lib/plugin-slots";

interface PluginPanelViewProps {
  pluginId: string;
  panelPath: string;
  subPath: string;
}

export function PluginPanelView({
  pluginId,
  panelPath,
  subPath,
}: PluginPanelViewProps) {
  const { navPanels } = usePluginSlots();
  const requestedPage = useAtomValue(requestedHomepageAtom);
  const location = useLocation();
  const isHomepage =
    requestedPage !== null && requestedPage.path === location.pathname;
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!isHomepage) return;
    const timer = window.setTimeout(() => setTimedOut(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [isHomepage, location.pathname]);
  const pluginsSettled = usePluginFrontendsSettled();
  const panel =
    navPanels.find(
      (candidate) =>
        candidate.pluginId === pluginId && candidate.path === panelPath,
    ) ?? null;

  if (panel === null) {
    if (isHomepage && (pluginsSettled || timedOut)) {
      return <Navigate to="/" replace />;
    }
    if (!pluginsSettled) {
      return (
        <PageShell contentClassName="pt-[calc(var(--bb-app-chrome-row-height)+1rem)] md:pt-[calc(var(--bb-app-chrome-row-height)+1.25rem)]">
          {null}
        </PageShell>
      );
    }
    return (
      <PageShell contentClassName="pt-[calc(var(--bb-app-chrome-row-height)+1rem)] md:pt-[calc(var(--bb-app-chrome-row-height)+1.25rem)]">
        <EmptyStatePanel className="rounded-lg p-6 text-sm">
          This plugin panel is not available. The plugin may have been disabled
          or removed.
        </EmptyStatePanel>
      </PageShell>
    );
  }

  return (
    <div
      className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden md:-m-5"
      data-testid="plugin-panel-body"
    >
      <PluginSlotMount
        key={`${panel.pluginId}/${panel.id}/${panel.generation}`}
        pluginId={panel.pluginId}
        slotKind="navPanel"
        slotId={panel.id}
        crashFallback={isHomepage ? <Navigate to="/" replace /> : undefined}
      >
        <panel.component subPath={subPath} />
      </PluginSlotMount>
    </div>
  );
}
