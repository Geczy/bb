import { createContext, useCallback, useContext, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { recordTelemetryEvent } from "@/components/onboarding/onboarding-telemetry";
import type { ReleaseWidgetLocationState } from "@/components/sidebar/SidebarReleaseWidget";
import { isReleaseVersion } from "@/components/sidebar/release-widget-model";
import { openUrlInExternalBrowser } from "@/lib/url-open-routing";

const RELEASE_NOTES_BASE_URL = "https://getbb.app/changelog";

export type ReleaseNotesEntryPoint = "widget_auto" | "updates_link";

export type OpenReleaseNotesInPanel = (url: string) => void;

export const ReleaseNotesPanelContext =
  createContext<OpenReleaseNotesInPanel | null>(null);

const autoOpenedReleaseNotesVersions = new Set<string>();

export function resetReleaseNotesSessionForTest(): void {
  autoOpenedReleaseNotesVersions.clear();
}

export function getReleaseNotesUrl(version: string): string {
  return `${RELEASE_NOTES_BASE_URL}#${version.replaceAll(".", "-")}`;
}

function readReleaseNotesVersion(state: unknown): string | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }
  const version = (state as Partial<ReleaseWidgetLocationState>)
    .openReleaseNotes;
  return typeof version === "string" && isReleaseVersion(version)
    ? version
    : null;
}

export function useOpenReleaseNotes(): (
  version: string,
  entryPoint: ReleaseNotesEntryPoint,
) => void {
  const openInPanel = useContext(ReleaseNotesPanelContext);
  return useCallback(
    (version, entryPoint) => {
      const url = getReleaseNotesUrl(version);
      if (openInPanel === null) {
        openUrlInExternalBrowser(url);
      } else {
        openInPanel(url);
      }
      if (!isReleaseVersion(version)) {
        return;
      }
      recordTelemetryEvent({
        name: "release_notes_opened",
        properties: {
          release_version: version,
          entry_point: entryPoint,
          destination:
            openInPanel === null ? "external_browser" : "browser_panel",
        },
      });
    },
    [openInPanel],
  );
}

export function useAutoOpenReleaseNotes(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const openReleaseNotes = useOpenReleaseNotes();
  const version = readReleaseNotesVersion(location.state);
  const { hash, pathname, search } = location;
  useEffect(() => {
    if (version === null) {
      return;
    }
    navigate({ hash, pathname, search }, { replace: true, state: null });
    if (autoOpenedReleaseNotesVersions.has(version)) {
      return;
    }
    autoOpenedReleaseNotesVersions.add(version);
    openReleaseNotes(version, "widget_auto");
  }, [hash, navigate, openReleaseNotes, pathname, search, version]);
}
