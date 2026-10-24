import { useEffect, useId, useState } from "react";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { recordTelemetryEvent } from "@/components/onboarding/onboarding-telemetry";
import {
  CHANGELOG_ENTRIES,
  changelogEntriesQueryOptions,
} from "@/components/settings/changelog-preview";
import { useAppUpdateStatus } from "@/hooks/queries/app-update-queries";
import { useSystemConfig } from "@/hooks/queries/system-queries";
import { useUpdateInventory } from "@/hooks/useUpdateInventory";
import { rawStringLocalStorage } from "@/lib/browser-storage";
import { getBbDesktopInfo } from "@/lib/bb-desktop";
import { isInsideNativeShell } from "@/lib/native-shell";
import { getSettingsRoutePath } from "@/lib/route-paths";
import { dismissedReleaseVersionAtom } from "./release-widget-preferences";
import {
  resolveReleaseWidgetHighlights,
  resolveReleaseWidgetTargetVersion,
} from "./release-widget-model";

const CHANGELOG_PREVIEW_DISMISSED_VERSION_STORAGE_KEY =
  "bb.settings.updates.dismissed-changelog-version";

const reportedShownVersions = new Set<string>();

export function resetReleaseWidgetSessionForTest(): void {
  reportedShownVersions.clear();
}

export interface ReleaseWidgetLocationState {
  openReleaseNotes: string;
}

interface SidebarReleaseWidgetProps {
  visible: boolean;
  onNavigate?: () => void;
}

export function SidebarReleaseWidget({
  visible,
  onNavigate,
}: SidebarReleaseWidgetProps) {
  const enabled =
    useSystemConfig().data?.experiments.releaseWidget === true &&
    !isInsideNativeShell();
  if (!visible || !enabled) {
    return null;
  }
  return <ReleaseWidget onNavigate={onNavigate} />;
}

function ReleaseWidget({ onNavigate }: { onNavigate?: () => void }) {
  const inventory = useUpdateInventory();
  const appUpdate = useAppUpdateStatus().data;
  const [isDesktop] = useState(() => getBbDesktopInfo() !== null);
  const [dismissedVersion, setDismissedVersion] = useAtom(
    dismissedReleaseVersionAtom,
  );
  const updateAvailable =
    inventory.appUpdateAvailable || inventory.desktopUpdateReady;
  const version = updateAvailable
    ? resolveReleaseWidgetTargetVersion({
        isDesktop,
        desktopInfo: inventory.desktopInfo,
        appUpdate,
        systemVersion: inventory.systemVersion,
      })
    : null;
  const changelogQuery = useQuery({
    ...changelogEntriesQueryOptions(),
    enabled: version !== null,
  });
  const highlights =
    version === null
      ? null
      : resolveReleaseWidgetHighlights(
          version,
          changelogQuery.data,
          CHANGELOG_ENTRIES,
        );

  const legacyDismissed =
    version !== null &&
    dismissedVersion === null &&
    rawStringLocalStorage.getItem(
      CHANGELOG_PREVIEW_DISMISSED_VERSION_STORAGE_KEY,
      "",
    ) === version;
  const dismissed = version !== null && dismissedVersion === version;
  const shown = highlights !== null && !dismissed && !legacyDismissed;

  useEffect(() => {
    if (legacyDismissed) {
      setDismissedVersion((current) => current ?? version);
    }
  }, [legacyDismissed, setDismissedVersion, version]);

  useEffect(() => {
    if (!shown || version === null || reportedShownVersions.has(version)) {
      return;
    }
    reportedShownVersions.add(version);
    recordTelemetryEvent({
      name: "release_widget_shown",
      properties: { release_version: version },
    });
  }, [shown, version]);

  if (!shown || version === null) {
    return null;
  }
  return (
    <ReleaseWidgetCard
      version={version}
      highlights={highlights}
      onNavigate={onNavigate}
      onDismiss={() => {
        recordTelemetryEvent({
          name: "release_widget_action",
          properties: { release_version: version, action: "dismiss" },
        });
        setDismissedVersion(version);
      }}
    />
  );
}

interface ReleaseWidgetCardProps {
  version: string;
  highlights: readonly string[];
  onNavigate?: () => void;
  onDismiss: () => void;
}

function ReleaseWidgetCard({
  version,
  highlights,
  onNavigate,
  onDismiss,
}: ReleaseWidgetCardProps) {
  const navigate = useNavigate();
  const highlightsId = useId();
  const state: ReleaseWidgetLocationState = { openReleaseNotes: version };
  return (
    <div
      data-release-widget
      data-testid="sidebar-release-widget"
      className="relative rounded-lg border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground"
    >
      <button
        type="button"
        aria-label={`bb ${version} is available. Open Updates`}
        aria-describedby={highlightsId}
        className={cn(
          "flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-lg py-2 pr-8 pl-3 text-left outline-none",
          "transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        )}
        onClick={() => {
          recordTelemetryEvent({
            name: "release_widget_action",
            properties: { release_version: version, action: "open" },
          });
          onNavigate?.();
          void navigate(getSettingsRoutePath("updates"), { state });
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Icon
            name="Download"
            className="size-3 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="truncate">bb {version} is available</span>
        </span>
        <span id={highlightsId} className="flex min-w-0 flex-col gap-0.5">
          {highlights.map((highlight) => (
            <span
              key={highlight}
              className="truncate text-xs text-muted-foreground"
            >
              {highlight}
            </span>
          ))}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Dismiss the bb ${version} release preview`}
        className={cn(
          "absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none",
          "transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        )}
        onClick={onDismiss}
      >
        <Icon name="X" className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
