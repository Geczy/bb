import type { BbDesktopInfo } from "@bb/desktop-contract";
import {
  BbAppUpdateRows,
  BbUpdatesCard,
} from "@/components/settings/UpdatesSettingsSection";
import { UpdatesReleaseNotesLayout } from "@/components/settings/UpdatesReleaseNotesLayout";
import {
  useAutoOpenReleaseNotes,
  useOpenReleaseNotes,
} from "@/components/settings/release-notes";
import { SettingsStoryChrome } from "./story-settings-chrome";

export interface ReleaseNotesStoryVersions {
  installedVersion: string;
  version: string;
}

export function releaseNotesStoryDesktopInfo({
  installedVersion,
  version,
}: ReleaseNotesStoryVersions): BbDesktopInfo {
  return {
    lastCheckedAt: "2026-10-24T00:00:00.000Z",
    latestVersion: version,
    pendingVersion: null,
    platform: "macos",
    updateAvailable: true,
    updateDownloaded: false,
    downloadState: "idle",
    version: installedVersion,
  };
}

function ReleaseNotesUpdatesContent(versions: ReleaseNotesStoryVersions) {
  const openReleaseNotes = useOpenReleaseNotes();
  useAutoOpenReleaseNotes(true);
  return (
    <BbUpdatesCard>
      <BbAppUpdateRows
        name="Desktop"
        systemVersion={undefined}
        desktopInfo={releaseNotesStoryDesktopInfo(versions)}
        isDesktop
        onRelaunchDesktop={null}
        onRetryDesktop={null}
        releaseNotes={{
          version: versions.version,
          onOpen: () => openReleaseNotes(versions.version, "updates_link"),
        }}
      />
    </BbUpdatesCard>
  );
}

export function UpdatesWithReleaseNotesStory(
  versions: ReleaseNotesStoryVersions,
) {
  return (
    <SettingsStoryChrome activeSection="updates" contentOwnsPageShell>
      <UpdatesReleaseNotesLayout>
        <div className="mx-auto w-full max-w-3xl space-y-10">
          <ReleaseNotesUpdatesContent {...versions} />
        </div>
      </UpdatesReleaseNotesLayout>
    </SettingsStoryChrome>
  );
}
