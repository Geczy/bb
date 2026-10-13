import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  removePluginSlotRegistrations,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";
import type {
  SystemAppUpdateStatus,
  SystemVersionResponse,
} from "@bb/server-contract";
import type { ProviderCliStatusResponse } from "@bb/host-daemon-contract";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { AppLayoutSidebar } from "@/components/layout/AppLayoutSidebar";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { PageShell } from "@/components/ui/page-shell";
import {
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  buildUpdateInventoryProviderIssues,
  type UpdateInventoryMachine,
} from "@/hooks/useUpdateInventory";
import { SettingsStoryChrome } from "../../../.ladle/story-settings-chrome";
import { SettingsStoryFixtures } from "../../../.ladle/settings-story-fixtures";
import {
  makeHost,
  makeProviderCliStatus,
} from "../../../.ladle/story-fixtures";
import {
  BbAppUpdateRows,
  BbUpdatesCard,
  ProviderCliUpdatesSection,
} from "./UpdatesSettingsSection";
import { ReleaseVisual } from "../../../../../plugins/whats-new/release-visual";
import { InlineMarkdown } from "../../../../../plugins/whats-new/inline-markdown";
import { highlightSubject } from "../../../../../plugins/whats-new/show-me";
import {
  changelogUrl,
  type ReleaseNotes,
} from "../../../../../plugins/whats-new/state";

export default {
  title: "settings/What's new page",
};

const STORY_THREAD_LIST_PLUGIN_ID = "story-thread-list";
const STORY_THREADS = [
  "Fix flaky composer test",
  "Release notes draft",
  "Ambient shader palette",
  "Digest: GitHub activity",
  "File Pins menu alignment",
  "Plugin catalog refresh",
];

function StoryThreadList() {
  return (
    <div className="px-2 pt-1">
      <p className="px-2 pb-1 pt-2 text-xs text-subtle-foreground">bb</p>
      <SidebarMenu>
        {STORY_THREADS.map((title) => (
          <SidebarMenuItem key={title}>
            <SidebarMenuButton>
              <span className="truncate">{title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </div>
  );
}

function StoryThreadListPlugin({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPluginSlotRegistrations(
      STORY_THREAD_LIST_PLUGIN_ID,
      makePluginRegistrationSet({
        threadLists: [
          { id: "list", title: "Threads", component: StoryThreadList },
        ],
      }),
    );
    setReady(true);
    return () => removePluginSlotRegistrations(STORY_THREAD_LIST_PLUGIN_ID);
  }, []);
  return ready ? children : null;
}

const noop = () => {};
const NO_JOBS: ReadonlySet<string> = new Set();
const NO_FAILURES = new Map<string, never>();
const STORY_NOW = 1_800_000_000_000;
const WHATS_NEW_PAGE_HREF = "/plugins/whats-new/notes";

const CURRENT: ReleaseNotes = {
  version: "0.45.0",
  date: "October 2, 2026",
  headline: "Native Windows support, service tiers, and faster conversations",
  visual: "native-windows",
  hero: null,
  lede: [
    {
      kind: "paragraph",
      text: "bb now runs natively on Windows, lets you pick a service tier per thread, and streams long conversations faster.",
    },
  ],
  sections: [
    {
      title: "Highlights",
      blocks: [
        {
          kind: "list",
          items: [
            "**Native Windows:** install the desktop app and run agents on Windows machines.",
            "**Service tiers:** choose a faster or cheaper tier from the model picker.",
            "**Faster conversations:** smoother streaming, quicker thread switching, and less background work.",
          ],
        },
      ],
    },
    {
      title: "Improvements",
      blocks: [
        {
          kind: "list",
          items: [
            "**Agents:** instant thread forks named after their source.",
            "**Composer:** remembered scheduled-send choices and 5/10-minute presets.",
            "`bb status --json` includes each machine's daemon version.",
          ],
        },
      ],
    },
    {
      title: "Fixes",
      blocks: [
        {
          kind: "list",
          items: [
            "Fixed `bb status` output when a machine is offline.",
            "Fixed a flicker when switching threads with a long transcript.",
          ],
        },
      ],
    },
    {
      title: "Thanks",
      blocks: [
        {
          kind: "paragraph",
          text: "[@ada](https://github.com/ada), [@grace](https://github.com/grace), and [@linus](https://github.com/linus).",
        },
      ],
    },
  ],
};

const EARLIER: ReleaseNotes = {
  version: "0.44.1",
  date: "September 28, 2026",
  headline: "Diff filtering, safer archiving, and plugin safe mode",
  visual: "diff-filter",
  hero: null,
  lede: [
    {
      kind: "paragraph",
      text: "Filter large diffs, recover archived threads more safely, and troubleshoot plugins with safe mode.",
    },
  ],
  sections: [
    {
      title: "Highlights",
      blocks: [
        {
          kind: "list",
          items: [
            "**Diff filtering:** filter the diff panel with globs like `*.md` or `!*.test.ts`.",
            "**Safer archiving:** archived threads keep their worktree until you confirm deletion.",
            "**Plugin safe mode:** start bb with every plugin paused to track down a misbehaving one.",
          ],
        },
      ],
    },
    {
      title: "Fixes",
      blocks: [
        {
          kind: "list",
          items: [
            "Fixed the diff panel losing its scroll position after a refresh.",
          ],
        },
      ],
    },
  ],
};

const AVAILABLE_VERSION = "0.46.0";
const UPDATED_FROM = "0.44.0";

type ReleaseBlock = ReleaseNotes["lede"][number];

function Blocks({
  blocks,
  showMe,
}: {
  blocks: readonly ReleaseBlock[];
  showMe: boolean;
}) {
  return blocks.map((block, index) =>
    block.kind === "list" ? (
      <ul key={index} className="mt-3 flex flex-col gap-2.5">
        {block.items.map((item) => (
          <li
            key={item}
            className="relative pl-5 text-base leading-relaxed text-muted-foreground before:absolute before:left-0.5 before:top-[0.68em] before:size-1.5 before:rounded-xs before:bg-subtle-foreground/40"
          >
            <InlineMarkdown text={item} />
            {showMe ? (
              <>
                {" "}
                <ShowMeButton item={item} />
              </>
            ) : null}
          </li>
        ))}
      </ul>
    ) : (
      <p
        key={index}
        className="mt-3 text-base leading-relaxed text-muted-foreground"
      >
        <InlineMarkdown text={block.text} />
      </p>
    ),
  );
}

function ShowMeButton({ item }: { item: string }) {
  const { title } = highlightSubject(item);
  return (
    <button
      type="button"
      data-whats-new-show-me
      aria-label={`Show me ${title}`}
      onClick={noop}
      className="inline cursor-pointer whitespace-nowrap rounded-sm text-xs text-subtle-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      Show me
    </button>
  );
}

function VersionPill({ version }: { version: string }) {
  return (
    <span className="inline-flex rounded-full border border-border px-2.5 py-0.5 font-mono text-sm font-medium text-foreground">
      {version}
    </span>
  );
}

function ReleaseEntry({
  release,
  headingLevel,
}: {
  release: ReleaseNotes;
  headingLevel: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <article
      data-whats-new-release={release.version}
      aria-labelledby={`release-${release.version}`}
    >
      <div className="flex items-center gap-3">
        <VersionPill version={release.version} />
        {release.date === null ? null : (
          <span className="text-sm text-subtle-foreground">
            {release.date}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <Heading
            id={`release-${release.version}`}
            className={cn(
              "text-balance font-semibold leading-tight tracking-tight text-foreground",
              headingLevel === 1 ? "text-2xl" : "text-xl",
            )}
          >
            {release.headline ?? `bb ${release.version}`}
          </Heading>
          {release.lede.map((block, index) =>
            block.kind === "paragraph" ? (
              <p
                key={index}
                className="mt-3 text-base leading-relaxed text-muted-foreground"
              >
                <InlineMarkdown text={block.text} />
              </p>
            ) : null,
          )}
        </div>
        <ReleaseVisual
          visual={release.visual}
          className={headingLevel === 1 ? "size-20" : "size-14"}
        />
      </div>
      {release.sections.map((section) => (
        <section key={section.title} className="mt-9">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {section.title}
          </h3>
          <Blocks
            blocks={section.blocks}
            showMe={section.title === "Highlights"}
          />
        </section>
      ))}
    </article>
  );
}

function UpdateNotice() {
  return (
    <div
      data-whats-new-available
      className="mb-10 flex items-center gap-3 border-b border-border pb-4"
    >
      <Icon
        aria-hidden
        name="Download"
        className="size-4 shrink-0 text-subtle-foreground"
      />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          bb {AVAILABLE_VERSION}
        </span>{" "}
        is ready to install.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={noop}>
        Update
      </Button>
    </div>
  );
}

function WhatsNewPage() {
  return (
    <div data-whats-new-page className="pb-24 pt-10">
      <UpdateNotice />
      <ReleaseEntry release={CURRENT} headingLevel={1} />
      <div className="mt-10">
        <a
          href={changelogUrl(CURRENT.version)}
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Full changelog
          <Icon aria-hidden name="ExternalLink" className="size-3.5" />
        </a>
      </div>
      <div className="mt-12 border-t border-border pt-8">
        <p className="mb-5 text-sm text-subtle-foreground">
          Also new since {UPDATED_FROM}
        </p>
        <ReleaseEntry release={EARLIER} headingLevel={2} />
      </div>
    </div>
  );
}

export function CenterPanePage() {
  return (
    <SettingsStoryFixtures>
      <StoryThreadListPlugin>
      <SidebarProvider
        className="h-screen bg-background"
        style={{ "--bb-shell-height": "100vh" } as CSSProperties}
      >
        <AppLayoutSidebar
          mode="app"
          isResizing={false}
          onResizeMouseDown={noop}
          settingsRoutePath="/settings/updates"
        />
        <SidebarInset>
          <div className="relative flex h-full min-h-0 min-w-0 flex-col">
            <AppPageHeader
              center={
                <div className="flex min-w-0 items-center gap-2">
                  <SidebarTrigger className="-ml-2" />
                  <Icon
                    aria-hidden
                    name="News01"
                    className="size-4 text-muted-foreground"
                  />
                  <span className="truncate text-sm font-semibold">
                    What&rsquo;s new
                  </span>
                </div>
              }
            />
            <main className="flex min-h-0 flex-1 flex-col p-4 md:p-5">
              <PageShell
                maxWidthClassName="max-w-[688px]"
                contentClassName="px-2"
              >
                <WhatsNewPage />
              </PageShell>
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
      </StoryThreadListPlugin>
    </SettingsStoryFixtures>
  );
}

const SYSTEM_VERSION: SystemVersionResponse = {
  currentVersion: "0.45.0",
  latestVersion: AVAILABLE_VERSION,
  currentCommit: null,
  installKind: "npm",
  source: "npm",
  updateAvailable: true,
  isDevelopment: false,
  upgradeCommand: "npx bb-app@latest",
};

const APP_UPDATE: SystemAppUpdateStatus = {
  activity: { phase: "idle" },
  available: {
    channel: "latest",
    commit: null,
    commitCount: null,
    subjects: [],
    version: AVAILABLE_VERSION,
  },
  blocked: null,
  current: { commit: null, version: "0.45.0" },
  lastResult: null,
  runningThreadCount: 0,
  support: { kind: "supported", mode: "npm" },
};

const PROVIDER_STATUS = {
  codex: makeProviderCliStatus("codex", {
    currentVersion: "0.145.0",
    latestVersion: "0.146.0",
    needsUpdate: true,
    installAction: { kind: "update", label: "Update", command: "codex update" },
  }),
} satisfies ProviderCliStatusResponse;

const MACHINE: UpdateInventoryMachine = {
  host: makeHost({ lastSeenAt: STORY_NOW, updatedAt: STORY_NOW }),
  isPrimary: true,
  providerStatus: PROVIDER_STATUS,
  statusPending: false,
  statusError: false,
  statusFetching: false,
  issues: buildUpdateInventoryProviderIssues(PROVIDER_STATUS),
  canRetryDaemonUpdate: false,
};

export function UpdatesWithLink() {
  return (
    <SettingsStoryFixtures>
      <SettingsStoryChrome activeSection="updates">
        <div className="space-y-6">
          <div>
            <BbUpdatesCard>
              <BbAppUpdateRows
                systemVersion={SYSTEM_VERSION}
                appUpdate={APP_UPDATE}
                desktopInfo={null}
                isDesktop={false}
                onApplyAppUpdate={noop}
                onRelaunchDesktop={null}
                onRetryDesktop={null}
                onShowAppUpdateResult={noop}
              />
            </BbUpdatesCard>
            <a
              href={WHATS_NEW_PAGE_HREF}
              data-whats-new-link
              className="mt-3 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              What&rsquo;s new in {CURRENT.version}
              <Icon aria-hidden name="ArrowRight" className="size-3.5" />
            </a>
          </div>
          <ProviderCliUpdatesSection
            machines={[MACHINE]}
            now={STORY_NOW}
            localDaemonHostId={null}
            serverHostId={MACHINE.host.id}
            retryPendingHostId={null}
            runningJobKey={null}
            queuedJobKeys={NO_JOBS}
            failuresByJobKey={NO_FAILURES}
            onStartInstall={noop}
            onRetryDaemonUpdate={noop}
            onRetryAllDaemonUpdates={noop}
            onRecheckClis={noop}
          />
        </div>
      </SettingsStoryChrome>
    </SettingsStoryFixtures>
  );
}
