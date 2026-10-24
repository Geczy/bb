import { useEffect, useId, useState } from "react";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { buttonVariants } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { recordTelemetryEvent } from "@/components/onboarding/onboarding-telemetry";
import {
  CHANGELOG_ENTRIES,
  changelogEntriesQueryOptions,
} from "@/components/settings/changelog-preview";
import { useAppUpdateStatus } from "@/hooks/queries/app-update-queries";
import { BbLogo } from "@/components/ui/bb-logo";
import { useUpdateInventory } from "@/hooks/useUpdateInventory";
import { rawStringLocalStorage } from "@/lib/browser-storage";
import { getBbDesktopInfo } from "@/lib/bb-desktop";
import { isInsideNativeShell } from "@/lib/native-shell";
import { getSettingsRoutePath } from "@/lib/route-paths";
import { dismissedReleaseVersionAtom } from "./release-widget-preferences";
import {
  type ReleaseWidgetContent,
  type ReleaseWidgetImage,
  resolveReleaseWidgetContent,
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
  if (!visible || isInsideNativeShell()) {
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
  const content =
    version === null
      ? null
      : resolveReleaseWidgetContent(
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
  const shown = content !== null && !dismissed && !legacyDismissed;

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

  if (!shown || version === null || content === null) {
    return null;
  }
  return (
    <ReleaseWidgetCard
      version={version}
      content={content}
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
  content: ReleaseWidgetContent;
  onNavigate?: () => void;
  onDismiss: () => void;
}

function ReleaseWidgetCard({
  version,
  content,
  onNavigate,
  onDismiss,
}: ReleaseWidgetCardProps) {
  const navigate = useNavigate();
  const descriptionId = useId();
  const state: ReleaseWidgetLocationState = { openReleaseNotes: version };
  return (
    <div
      data-release-widget
      data-testid="sidebar-release-widget"
      className="relative text-sidebar-foreground"
    >
      <button
        type="button"
        aria-label={`bb ${version} is available. Open Updates`}
        aria-describedby={descriptionId}
        className={cn(
          "group/release flex w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-accent/50 text-left outline-none",
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
        <ReleaseWidgetHero version={version} image={content.image} />
        <span className="flex min-w-0 flex-col gap-2 p-3">
          <span className="truncate text-sm font-semibold">
            bb {version} is available
          </span>
          <span id={descriptionId} className="flex min-w-0 flex-col gap-2">
            {content.summary === null ? null : (
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {content.summary}
              </span>
            )}
            <span className="flex min-w-0 flex-col gap-1">
              {content.highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="flex min-w-0 items-center gap-2 text-xs"
                >
                  <span
                    aria-hidden
                    className="size-1 shrink-0 rounded-full bg-muted-foreground"
                  />
                  <span className="truncate">{highlight}</span>
                </span>
              ))}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              buttonVariants({ size: "sm" }),
              "mt-1 h-7 w-full group-hover/release:bg-foreground/90",
            )}
          >
            See what's new
            <Icon name="ArrowRight" aria-hidden />
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Dismiss the bb ${version} release preview`}
        className={cn(
          "absolute top-2 right-2 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white outline-none backdrop-blur-sm",
          "transition-colors hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        )}
        onClick={onDismiss}
      >
        <Icon name="X" className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function ReleaseWidgetHero({
  version,
  image,
}: {
  version: string;
  image: ReleaseWidgetImage | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = image !== null && failedSrc !== image.src;
  return (
    <span className="relative block aspect-video w-full shrink-0 overflow-hidden border-b border-sidebar-border bg-sidebar">
      {showImage ? (
        <img
          data-testid="sidebar-release-widget-image"
          src={image.src}
          alt={image.alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailedSrc(image.src)}
        />
      ) : (
        <span
          data-testid="sidebar-release-widget-fallback"
          aria-hidden
          className="flex size-full items-center justify-center gap-3 bg-linear-to-br from-sidebar-accent via-sidebar to-sidebar-accent"
        >
          <BbLogo className="size-9" />
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {version}
          </span>
        </span>
      )}
    </span>
  );
}
