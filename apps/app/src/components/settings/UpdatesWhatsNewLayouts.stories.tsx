import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  SystemAppUpdateStatus,
  SystemVersionResponse,
} from "@bb/server-contract";
import type { ProviderCliStatusResponse } from "@bb/host-daemon-contract";
import { createPortal } from "react-dom";
import { Button } from "@bb/shared-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@bb/shared-ui/dialog";
import { Icon } from "@bb/shared-ui/icon";
import { PageShell } from "@/components/ui/page-shell";
import { cn } from "@bb/shared-ui/lib/utils";
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
import {
  WhatsNewNotes,
  type WhatsNewNotesData,
} from "../../../../../plugins/whats-new/notes";
import { ReleaseVisual } from "../../../../../plugins/whats-new/release-visual";
import { InlineMarkdown } from "../../../../../plugins/whats-new/inline-markdown";
import { ShowMeAction } from "../../../../../plugins/whats-new/show-me";
import { WHATS_NEW_SECTION_ID } from "../../../../../plugins/whats-new/seen";
import {
  changelogUrl,
  type ReleaseNotes,
} from "../../../../../plugins/whats-new/state";

export default {
  title: "settings/Updates What's new layouts",
};

const noop = () => {};
const NO_JOBS: ReadonlySet<string> = new Set();
const NO_FAILURES = new Map<string, never>();
const STORY_NOW = 1_800_000_000_000;

const CURRENT: ReleaseNotes = {
  version: "0.45.0",
  date: "October 2, 2026",
  headline: "Native Windows support, service tiers, and faster conversations",
  visual: "native-windows",
  hero: null,
  lede: [
    {
      kind: "paragraph",
      text: "bb now runs natively on Windows, lets you pick a **service tier** per thread, and streams long conversations faster.",
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
            "**Faster conversations:** long threads stream and scroll smoothly.",
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
            "The diff panel remembers its filter per thread.",
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
          text: "[@ada](https://github.com/ada), [@grace](https://github.com/grace)",
        },
      ],
    },
  ],
};

const SKIPPED: ReleaseNotes = {
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
            "Filter the diff panel with globs like `*.md` or `!*.test.ts`.",
          ],
        },
      ],
    },
  ],
};

const AVAILABLE: ReleaseNotes = {
  ...SKIPPED,
  version: "0.46.0",
  date: null,
  headline: null,
  visual: null,
  lede: [{ kind: "paragraph", text: "The next release is ready to install." }],
};

const NOTES: WhatsNewNotesData = {
  current: CURRENT,
  skipped: [SKIPPED],
  updatedFrom: "0.44.0",
  available: AVAILABLE,
};

const SYSTEM_VERSION: SystemVersionResponse = {
  currentVersion: "0.45.0",
  latestVersion: "0.46.0",
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
    version: "0.46.0",
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

function UpdateRows() {
  return (
    <div data-story-update-rows className="space-y-6">
      <BbUpdatesCard>
        <BbAppUpdateRows
          systemVersion={SYSTEM_VERSION}
          appUpdate={APP_UPDATE}
          desktopInfo={null}
          isDesktop={false}
          onApplyAppUpdate={applyAppUpdate}
          onRelaunchDesktop={null}
          onRetryDesktop={null}
          onShowAppUpdateResult={noop}
        />
      </BbUpdatesCard>
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
  );
}

function FullNotes({
  notes,
  className,
}: {
  notes: WhatsNewNotesData;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>(
        '[data-whats-new-current] button[aria-expanded="false"]',
      )
      ?.click();
  }, []);
  return (
    <div ref={ref} className={className}>
      <WhatsNewNotes {...notes} onShowMe={noop} />
    </div>
  );
}

function releaseCountLabel(notes: WhatsNewNotesData): string | null {
  if (notes.skipped.length === 0) return null;
  return `+${notes.skipped.length} more since ${notes.updatedFrom}`;
}

function CompactRow({
  notes,
  anchorId,
  trailing,
  onActivate,
  expanded,
}: {
  notes: WhatsNewNotesData;
  anchorId: string | undefined;
  trailing: ReactNode;
  onActivate(): void;
  expanded?: boolean;
}) {
  const { current } = notes;
  const extra = releaseCountLabel(notes);
  return (
    <section
      id={anchorId}
      aria-label="What's new"
      tabIndex={-1}
      className="outline-none"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onActivate}
        className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-left hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ReleaseVisual visual={current.visual} className="size-6" />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
          <span className="shrink-0 font-medium text-foreground">
            What&rsquo;s new in v{current.version}
          </span>
          {current.headline === null ? null : (
            <span className="min-w-0 truncate text-muted-foreground">
              {current.headline}
            </span>
          )}
          {extra === null ? null : (
            <span className="hidden shrink-0 text-xs text-subtle-foreground @min-[40rem]/whats-new-row:inline">
              {extra}
            </span>
          )}
        </span>
        {trailing}
      </button>
    </section>
  );
}

function NotesDialog({
  notes,
  open,
  onOpenChange,
}: {
  notes: WhatsNewNotesData;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-2xl">
        <DialogTitle className="sr-only">
          What&rsquo;s new in bb {notes.current.version}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Release notes for bb {notes.current.version}
        </DialogDescription>
        <FullNotes notes={notes} className="pt-4" />
      </DialogContent>
    </Dialog>
  );
}

function CompactRowWithDialog({
  notes,
  defaultOpen = false,
}: {
  notes: WhatsNewNotesData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="@container/whats-new-row">
      <CompactRow
        notes={notes}
        anchorId={open ? undefined : WHATS_NEW_SECTION_ID}
        onActivate={() => setOpen(true)}
        trailing={
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            View notes
            <Icon aria-hidden name="ArrowRight" className="size-3.5" />
          </span>
        }
      />
      <NotesDialog notes={notes} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function BottomDisclosure({
  notes,
  defaultOpen = false,
}: {
  notes: WhatsNewNotesData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (open) {
    return (
      <div>
        <FullNotes notes={notes} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 -ml-3 text-muted-foreground"
          onClick={() => setOpen(false)}
        >
          <Icon aria-hidden name="ChevronUp" className="size-3.5" />
          Collapse What&rsquo;s new
        </Button>
      </div>
    );
  }
  return (
    <div className="@container/whats-new-row space-y-3">
      <div className="flex flex-row items-center justify-between gap-4">
        <h2 className="min-w-0 text-sm font-semibold text-foreground">
          What&rsquo;s new
        </h2>
        <a
          href={changelogUrl(notes.current.version)}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Full changelog
          <Icon aria-hidden name="ExternalLink" className="size-3" />
        </a>
      </div>
      <CompactRow
        notes={notes}
        anchorId={WHATS_NEW_SECTION_ID}
        expanded={false}
        onActivate={() => setOpen(true)}
        trailing={
          <Icon
            aria-hidden
            name="ChevronDown"
            className="size-4 shrink-0 text-subtle-foreground"
          />
        }
      />
    </div>
  );
}

function TopRowTakeover({
  notes,
  defaultOpen = false,
}: {
  notes: WhatsNewNotesData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(
    () =>
      defaultOpen ||
      (typeof window !== "undefined" &&
        window.location.hash === `#${WHATS_NEW_SECTION_ID}`),
  );
  const rowRef = useRef<HTMLButtonElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const { current } = notes;
  const extra = releaseCountLabel(notes);
  useEffect(() => {
    if (open) {
      notesRef.current
        ?.querySelector<HTMLElement>(`#${WHATS_NEW_SECTION_ID}`)
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      rowRef.current?.focus();
    }
  }, [open]);
  const close = () => {
    restoreFocus.current = true;
    setOpen(false);
  };
  return (
    <div data-story-whats-new-takeover={open ? "open" : "closed"}>
      <div className="@container/whats-new-row">
        {open ? (
          <button
            ref={rowRef}
            type="button"
            aria-expanded
            aria-controls="whats-new-takeover"
            onClick={close}
            className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon
              aria-hidden
              name="ArrowLeft"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 font-medium text-foreground">
              Back to Updates
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              Hide notes
              <Icon aria-hidden name="ChevronUp" className="size-3.5" />
            </span>
          </button>
        ) : (
          <section
            id={WHATS_NEW_SECTION_ID}
            aria-label="What's new"
            tabIndex={-1}
            className="outline-none"
          >
            <button
              ref={rowRef}
              type="button"
              aria-expanded={false}
              aria-controls="whats-new-takeover"
              onClick={() => setOpen(true)}
              className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-left hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <ReleaseVisual visual={current.visual} className="size-6" />
              <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
                <span className="shrink-0 font-medium text-foreground">
                  v{current.version}
                </span>
                {current.headline === null ? null : (
                  <span className="min-w-0 truncate text-muted-foreground">
                    {current.headline}
                  </span>
                )}
                {extra === null ? null : (
                  <span className="hidden shrink-0 text-xs text-subtle-foreground @min-[40rem]/whats-new-row:inline">
                    {extra}
                  </span>
                )}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                View notes
                <Icon aria-hidden name="ChevronDown" className="size-3.5" />
              </span>
            </button>
          </section>
        )}
      </div>
      <div
        id="whats-new-takeover"
        ref={notesRef}
        hidden={!open}
        className="mt-6"
      >
        {open ? <FullNotes notes={notes} /> : null}
      </div>
      <div hidden={open} className="mt-6">
        <UpdateRows />
      </div>
    </div>
  );
}

const applyAppUpdate = noop;

function includesLabel(notes: WhatsNewNotesData): string | null {
  if (notes.skipped.length === 0) return null;
  return `Also includes ${notes.skipped.map((release) => release.version).join(", ")}`;
}

function AvailableUpdateAction({ container }: { container: HTMLElement }) {
  return createPortal(
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Update available · Download the update and restart bb"
      className="h-6 shrink-0 gap-1.5 px-2 text-xs"
      onClick={applyAppUpdate}
    >
      Update
    </Button>,
    container,
  );
}

function TakeoverNotes({ notes }: { notes: WhatsNewNotesData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    root
      ?.querySelector<HTMLButtonElement>(
        '[data-whats-new-current] button[aria-expanded="false"]',
      )
      ?.click();
    const header = root?.querySelector<HTMLElement>(
      "[data-whats-new-available] [data-whats-new-release] > div:first-child",
    );
    if (header === null || header === undefined) return;
    header.classList.add("flex", "items-start", "gap-3");
    const slot = document.createElement("span");
    slot.className = "flex shrink-0 items-center pt-0.5 pr-2";
    header.append(slot);
    setActionSlot(slot);
    return () => slot.remove();
  }, []);
  return (
    <div ref={ref}>
      <WhatsNewNotes {...notes} onShowMe={noop} />
      {actionSlot === null ? null : (
        <AvailableUpdateAction container={actionSlot} />
      )}
    </div>
  );
}

function TopRowTakeoverV2({
  notes,
  defaultOpen = false,
}: {
  notes: WhatsNewNotesData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(
    () =>
      defaultOpen ||
      (typeof window !== "undefined" &&
        window.location.hash === `#${WHATS_NEW_SECTION_ID}`),
  );
  const rowRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  const { current } = notes;
  const extra = includesLabel(notes);
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (open ? backRef : rowRef).current?.focus();
  }, [open]);
  const toggle = (next: boolean) => {
    focusAfterToggle.current = true;
    setOpen(next);
  };
  return (
    <div data-story-whats-new-takeover={open ? "open" : "closed"}>
      {open ? (
        <div id="whats-new-takeover">
          <Button
            ref={backRef}
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 mb-4 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => toggle(false)}
          >
            <Icon aria-hidden name="ArrowLeft" className="size-4" />
            Back to Updates
          </Button>
          <TakeoverNotes notes={notes} />
        </div>
      ) : (
        <section
          id={WHATS_NEW_SECTION_ID}
          aria-labelledby="whats-new-row-label"
          tabIndex={-1}
          className="@container/whats-new-row outline-none"
        >
          <h2
            id="whats-new-row-label"
            className="mb-3 text-sm font-semibold text-foreground"
          >
            What&rsquo;s new
          </h2>
          <button
            ref={rowRef}
            type="button"
            aria-controls="whats-new-takeover"
            onClick={() => toggle(true)}
            className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg bg-muted/50 px-4 py-2.5 text-left hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ReleaseVisual visual={current.visual} className="size-7" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
                <span className="shrink-0 font-medium text-foreground">
                  v{current.version}
                </span>
                {current.headline === null ? null : (
                  <>
                    <span aria-hidden className="text-subtle-foreground">
                      ·
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {current.headline}
                    </span>
                  </>
                )}
              </span>
              {extra === null ? null : (
                <span className="mt-0.5 block text-xs text-subtle-foreground">
                  {extra}
                </span>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              View notes
              <Icon aria-hidden name="ArrowRight" className="size-3.5" />
            </span>
          </button>
        </section>
      )}
      <div hidden={open} className="mt-6">
        <UpdateRows />
      </div>
    </div>
  );
}

type ReleaseBlock = ReleaseNotes["lede"][number];

function WebBlocks({
  blocks,
  showMe,
}: {
  blocks: readonly ReleaseBlock[];
  showMe: boolean;
}) {
  return blocks.map((block, index) =>
    block.kind === "list" ? (
      <ul key={index} className="mt-3 flex max-w-[44em] flex-col gap-2">
        {block.items.map((item) => (
          <li
            key={item}
            className="relative pl-5 text-base leading-relaxed text-muted-foreground before:absolute before:left-0.5 before:top-[0.62em] before:size-1.5 before:rounded-xs before:bg-subtle-foreground/50"
          >
            <InlineMarkdown text={item} />
            {showMe ? <ShowMeAction item={item} onShowMe={noop} /> : null}
          </li>
        ))}
      </ul>
    ) : (
      <p
        key={index}
        className="mt-3 max-w-[44em] text-base leading-relaxed text-muted-foreground"
      >
        <InlineMarkdown text={block.text} />
      </p>
    ),
  );
}

function VersionPill({ version }: { version: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-base font-semibold leading-none text-foreground">
      {version}
    </span>
  );
}

function WebReleaseBody({
  release,
  headingLevel = 2,
}: {
  release: ReleaseNotes;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const lede = release.lede.filter((block) => block.kind === "paragraph");
  return (
    <div className="min-w-0">
      <Heading className="text-balance text-3xl font-bold leading-tight tracking-tight text-foreground">
        {release.headline ?? `bb ${release.version}`}
      </Heading>
      {lede.map((block, index) =>
        block.kind === "paragraph" ? (
          <p
            key={index}
            className="mt-3.5 max-w-[38em] text-lg leading-relaxed text-muted-foreground"
          >
            <InlineMarkdown text={block.text} />
          </p>
        ) : null,
      )}
      {release.hero === null ? null : (
        <img
          src={release.hero.src}
          alt={release.hero.alt}
          loading="lazy"
          className="mt-5 block h-auto w-full rounded-xl"
        />
      )}
      {release.sections.map((section) => (
        <section key={section.title}>
          <h3 className="mt-10 text-lg font-semibold tracking-tight text-foreground">
            {section.title}
          </h3>
          <WebBlocks
            blocks={section.blocks}
            showMe={section.title === "Highlights"}
          />
        </section>
      ))}
    </div>
  );
}

function WebReleaseRail({ release }: { release: ReleaseNotes }) {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      <ReleaseVisual visual={release.visual} className="size-8" />
      <VersionPill version={release.version} />
      {release.date === null ? null : (
        <span className="text-sm text-subtle-foreground">{release.date}</span>
      )}
    </div>
  );
}

function WebOtherRelease({
  release,
  label,
  action,
}: {
  release: ReleaseNotes;
  label: string;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border py-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon
            aria-hidden
            name="ChevronRight"
            className={cn(
              "size-4 shrink-0 text-subtle-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
          <VersionPill version={release.version} />
          <span className="min-w-0 truncate text-base font-medium text-foreground">
            {release.headline ?? label}
          </span>
          {release.date === null ? null : (
            <span className="shrink-0 text-sm text-subtle-foreground">
              {release.date}
            </span>
          )}
        </button>
        {action}
      </div>
      {open ? (
        <div className="mt-6 pl-6.5">
          <WebReleaseBody release={release} headingLevel={3} />
        </div>
      ) : null}
    </div>
  );
}

function WebMatchedNotes({ notes }: { notes: WhatsNewNotesData }) {
  const { current, available, skipped, updatedFrom } = notes;
  return (
    <section
      id={WHATS_NEW_SECTION_ID}
      aria-labelledby="whats-new-notes-title"
      className="outline-none"
    >
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4">
        <h2
          id="whats-new-notes-title"
          className="text-sm font-semibold text-foreground"
        >
          What&rsquo;s new
          {updatedFrom === null ? null : (
            <span className="ml-2 font-normal text-subtle-foreground">
              Updated from {updatedFrom}
            </span>
          )}
        </h2>
        <a
          href={changelogUrl(current.version)}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Full changelog
          <Icon aria-hidden name="ExternalLink" className="size-3.5" />
        </a>
      </div>
      <article data-whats-new-current className="pb-10">
        <WebReleaseRail release={current} />
        <WebReleaseBody release={current} />
      </article>
      {available === null ? null : (
        <WebOtherRelease
          release={available}
          label="Update available"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Update available · Download the update and restart bb"
              className="h-6 shrink-0 gap-1.5 px-2 text-xs"
              onClick={applyAppUpdate}
            >
              Update
            </Button>
          }
        />
      )}
      {skipped.map((release) => (
        <WebOtherRelease
          key={release.version}
          release={release}
          label={`bb ${release.version}`}
        />
      ))}
    </section>
  );
}

function TopRowTakeoverV3({
  notes,
  defaultOpen = false,
}: {
  notes: WhatsNewNotesData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(
    () =>
      defaultOpen ||
      (typeof window !== "undefined" &&
        window.location.hash === `#${WHATS_NEW_SECTION_ID}`),
  );
  const rowRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  const { current } = notes;
  const extra = includesLabel(notes);
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (open ? backRef : rowRef).current?.focus();
  }, [open]);
  const toggle = (next: boolean) => {
    focusAfterToggle.current = true;
    setOpen(next);
  };
  return (
    <div data-story-whats-new-takeover={open ? "open" : "closed"}>
      {open ? (
        <div id="whats-new-takeover">
          <Button
            ref={backRef}
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 mb-4 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => toggle(false)}
          >
            <Icon aria-hidden name="ArrowLeft" className="size-4" />
            Back to Updates
          </Button>
          <WebMatchedNotes notes={notes} />
        </div>
      ) : (
        <section
          aria-labelledby="whats-new-row-label"
          className="@container/whats-new-row"
        >
          <h2
            id="whats-new-row-label"
            className="mb-3 text-sm font-semibold text-foreground"
          >
            What&rsquo;s new
          </h2>
          <button
            ref={rowRef}
            type="button"
            aria-controls="whats-new-takeover"
            onClick={() => toggle(true)}
            className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 text-left hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ReleaseVisual visual={current.visual} className="size-8" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2.5">
                <VersionPill version={current.version} />
                {current.headline === null ? null : (
                  <span className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground">
                    {current.headline}
                  </span>
                )}
              </span>
              {extra === null ? null : (
                <span className="mt-1 block text-sm text-subtle-foreground">
                  {extra}
                </span>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
              View notes
              <Icon aria-hidden name="ArrowRight" className="size-3.5" />
            </span>
          </button>
        </section>
      )}
      <div hidden={open} className="mt-6">
        <UpdateRows />
      </div>
    </div>
  );
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

const SIDE_COLUMN_MIN_WIDTH = 880;

function SideColumnLayout({ notes }: { notes: WhatsNewNotesData }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const wide = width !== null && width >= SIDE_COLUMN_MIN_WIDTH;
  return (
    <div ref={ref} className="mx-auto w-full max-w-[1120px]">
      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-8">
          <UpdateRows />
          <aside
            aria-label="What's new"
            className="sticky top-0 max-h-[calc(100dvh-7rem)] overflow-y-auto"
          >
            <WhatsNewNotes {...notes} onShowMe={noop} />
          </aside>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <UpdateRows />
          <CompactRowWithDialog notes={notes} />
        </div>
      )}
    </div>
  );
}

function Page({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <SettingsStoryFixtures>
      {wide ? (
        <SettingsStoryChrome activeSection="updates" contentOwnsPageShell>
          <PageShell
            contentClassName="pt-4 md:pt-5"
            maxWidthClassName="max-w-[1120px]"
          >
            {children}
          </PageShell>
        </SettingsStoryChrome>
      ) : (
        <SettingsStoryChrome activeSection="updates">
          <div className="space-y-6">{children}</div>
        </SettingsStoryChrome>
      )}
    </SettingsStoryFixtures>
  );
}

export function ACompactRow() {
  return (
    <Page>
      <UpdateRows />
      <CompactRowWithDialog notes={NOTES} />
    </Page>
  );
}

export function ACompactRowOpen() {
  return (
    <Page>
      <UpdateRows />
      <CompactRowWithDialog notes={NOTES} defaultOpen />
    </Page>
  );
}

export function BBottomDisclosure() {
  return (
    <Page>
      <UpdateRows />
      <BottomDisclosure notes={NOTES} />
    </Page>
  );
}

export function BBottomDisclosureOpen() {
  return (
    <Page>
      <UpdateRows />
      <BottomDisclosure notes={NOTES} defaultOpen />
    </Page>
  );
}

export function CSideColumn() {
  return (
    <Page wide>
      <SideColumnLayout notes={NOTES} />
    </Page>
  );
}

export function CurrentBelowRows() {
  return (
    <Page>
      <UpdateRows />
      <WhatsNewNotes {...NOTES} onShowMe={noop} />
    </Page>
  );
}

export function DTopRowTakeover() {
  return (
    <Page>
      <TopRowTakeover notes={NOTES} />
    </Page>
  );
}

export function DTopRowTakeoverOpen() {
  return (
    <Page>
      <TopRowTakeover notes={NOTES} defaultOpen />
    </Page>
  );
}

export function D2TopRowTakeover() {
  return (
    <Page>
      <TopRowTakeoverV2 notes={NOTES} />
    </Page>
  );
}

export function D2TopRowTakeoverOpen() {
  return (
    <Page>
      <TopRowTakeoverV2 notes={NOTES} defaultOpen />
    </Page>
  );
}

export function D3WebsiteMatchedNotes() {
  return (
    <Page>
      <TopRowTakeoverV3 notes={NOTES} />
    </Page>
  );
}

export function D3WebsiteMatchedNotesOpen() {
  return (
    <Page>
      <TopRowTakeoverV3 notes={NOTES} defaultOpen />
    </Page>
  );
}

function AccentVersionPill({ version }: { version: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-full border border-timeline-accent/25 bg-timeline-accent/10 px-2 py-0.5 font-mono text-xs font-semibold leading-tight text-timeline-accent">
      {version}
    </span>
  );
}

function CardBlocks({
  blocks,
  showMe,
}: {
  blocks: readonly ReleaseBlock[];
  showMe: boolean;
}) {
  return blocks.map((block, index) =>
    block.kind === "list" ? (
      <ul key={index} className="mt-2 flex max-w-[44em] flex-col gap-1.5">
        {block.items.map((item) => (
          <li
            key={item}
            className="relative pl-4 text-sm leading-relaxed text-muted-foreground before:absolute before:left-0.5 before:top-[0.6em] before:size-1.5 before:rounded-xs before:bg-subtle-foreground/50"
          >
            <InlineMarkdown text={item} />
            {showMe ? <ShowMeAction item={item} onShowMe={noop} /> : null}
          </li>
        ))}
      </ul>
    ) : (
      <p
        key={index}
        className="mt-2 max-w-[44em] text-sm leading-relaxed text-muted-foreground"
      >
        <InlineMarkdown text={block.text} />
      </p>
    ),
  );
}

function CardReleaseBody({
  release,
  headingLevel = 3,
}: {
  release: ReleaseNotes;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const lede = release.lede.filter((block) => block.kind === "paragraph");
  return (
    <div className="min-w-0">
      <Heading className="text-balance text-base font-semibold tracking-tight text-foreground">
        {release.headline ?? `bb ${release.version}`}
      </Heading>
      {lede.map((block, index) =>
        block.kind === "paragraph" ? (
          <p
            key={index}
            className="mt-1 max-w-[44em] text-sm leading-relaxed text-muted-foreground"
          >
            <InlineMarkdown text={block.text} />
          </p>
        ) : null,
      )}
      {release.hero === null ? null : (
        <img
          src={release.hero.src}
          alt={release.hero.alt}
          loading="lazy"
          className="mt-4 block h-auto w-full rounded-lg border border-border"
        />
      )}
      {release.sections.map((section) => (
        <section key={section.title} className="mt-6">
          <h4 className="text-sm font-semibold text-foreground">
            {section.title}
          </h4>
          <CardBlocks
            blocks={section.blocks}
            showMe={section.title === "Highlights"}
          />
        </section>
      ))}
    </div>
  );
}

function CardOtherRelease({
  release,
  label,
  action,
}: {
  release: ReleaseNotes;
  label: string;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon
            aria-hidden
            name="ChevronRight"
            className={cn(
              "size-4 shrink-0 text-subtle-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
          <span className="w-14 shrink-0 font-mono text-xs font-medium text-foreground">
            {release.version}
          </span>
          <span className="min-w-0 truncate font-medium text-foreground">
            {release.headline ?? label}
          </span>
          {release.date === null ? null : (
            <span className="shrink-0 text-xs text-subtle-foreground">
              {release.date}
            </span>
          )}
        </button>
        {action}
      </div>
      {open ? (
        <div className="px-4 pb-5 pl-[3.25rem]">
          <CardReleaseBody release={release} headingLevel={4} />
        </div>
      ) : null}
    </div>
  );
}

function AlignedCardNotes({ notes }: { notes: WhatsNewNotesData }) {
  const { current, available, skipped, updatedFrom } = notes;
  return (
    <section
      id={WHATS_NEW_SECTION_ID}
      aria-labelledby="whats-new-card-title"
      className="space-y-3 outline-none"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="whats-new-card-title"
          className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-foreground"
        >
          What&rsquo;s new
          {updatedFrom === null ? null : (
            <span className="text-xs font-normal text-subtle-foreground">
              Updated from {updatedFrom}
            </span>
          )}
        </h2>
        <a
          href={changelogUrl(current.version)}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Full changelog
          <Icon aria-hidden name="ExternalLink" className="size-3" />
        </a>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <article data-whats-new-current className="px-5 pt-4 pb-5">
          <div className="mb-3 flex items-center gap-2.5">
            <ReleaseVisual visual={current.visual} className="size-7" />
            <AccentVersionPill version={current.version} />
            {current.date === null ? null : (
              <span className="text-xs text-subtle-foreground">
                {current.date}
              </span>
            )}
          </div>
          <CardReleaseBody release={current} />
        </article>
        <div className="divide-y divide-border border-t border-border">
          {available === null ? null : (
            <CardOtherRelease
              release={available}
              label="Update available"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Update available · Download the update and restart bb"
                  className="h-6 shrink-0 gap-1.5 px-2 text-xs"
                  onClick={applyAppUpdate}
                >
                  Update
                </Button>
              }
            />
          )}
          {skipped.map((release) => (
            <CardOtherRelease
              key={release.version}
              release={release}
              label={`bb ${release.version}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function AlignedCardTakeover({
  notes,
  defaultOpen = false,
}: {
  notes: WhatsNewNotesData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(
    () =>
      defaultOpen ||
      (typeof window !== "undefined" &&
        window.location.hash === `#${WHATS_NEW_SECTION_ID}`),
  );
  const rowRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  const { current } = notes;
  const extra = includesLabel(notes);
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (open ? backRef : rowRef).current?.focus();
  }, [open]);
  const toggle = (next: boolean) => {
    focusAfterToggle.current = true;
    setOpen(next);
  };
  return (
    <div data-story-whats-new-takeover={open ? "open" : "closed"}>
      {open ? (
        <div id="whats-new-takeover" className="space-y-4">
          <Button
            ref={backRef}
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => toggle(false)}
          >
            <Icon aria-hidden name="ArrowLeft" className="size-4" />
            Back to Updates
          </Button>
          <AlignedCardNotes notes={notes} />
        </div>
      ) : (
        <section
          aria-labelledby="whats-new-row-label"
          className="@container/whats-new-row space-y-3"
        >
          <h2
            id="whats-new-row-label"
            className="text-sm font-semibold text-foreground"
          >
            What&rsquo;s new
          </h2>
          <button
            ref={rowRef}
            type="button"
            aria-controls="whats-new-takeover"
            onClick={() => toggle(true)}
            className="group flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ReleaseVisual visual={current.visual} className="size-6" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <AccentVersionPill version={current.version} />
                {current.headline === null ? null : (
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {current.headline}
                  </span>
                )}
              </span>
              {extra === null ? null : (
                <span className="mt-0.5 block text-xs text-subtle-foreground">
                  {extra}
                </span>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              View notes
              <Icon aria-hidden name="ArrowRight" className="size-3.5" />
            </span>
          </button>
        </section>
      )}
      <div hidden={open} className="mt-6">
        <UpdateRows />
      </div>
    </div>
  );
}

export function D4AlignedCard() {
  return (
    <Page>
      <AlignedCardTakeover notes={NOTES} />
    </Page>
  );
}

export function D4AlignedCardOpen() {
  return (
    <Page>
      <AlignedCardTakeover notes={NOTES} defaultOpen />
    </Page>
  );
}
