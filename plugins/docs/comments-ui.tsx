import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/core";
import { useRpc, useRealtime, useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { docsRpcContract } from "./server.js";
import type { CommentTarget } from "./comments-service.js";
import {
  commentMentions,
  exactOccurrences,
  makeAnchor,
  type CommentAuthor as Author,
  type CommentMessage as Message,
  type ListedComment as CommentThread,
  type CommentsList,
} from "./comments.js";
import {
  commentHighlightKey,
  commentRanges,
  visibleEditor,
  type CommentRange,
} from "./comment-editor.js";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import ArrowUpRight01Icon from "@hugeicons/core-free-icons/ArrowUpRight01Icon";
import BotIcon from "@hugeicons/core-free-icons/BotIcon";
import BubbleChatIcon from "@hugeicons/core-free-icons/BubbleChatIcon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import Edit02Icon from "@hugeicons/core-free-icons/Edit02Icon";
import MoreHorizontalIcon from "@hugeicons/core-free-icons/MoreHorizontalIcon";
import ArrowTurnBackwardIcon from "@hugeicons/core-free-icons/ArrowTurnBackwardIcon";
import Unlink02Icon from "@hugeicons/core-free-icons/Unlink02Icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PersistentResponsiveDrawerShell,
  useResponsiveDrawerRealization,
} from "@/components/ui/responsive-overlay";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { cn } from "@/lib/utils";

function Glyph({
  icon,
  className,
}: {
  icon: IconSvgElement;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={1.75}
      className={cn("size-3.5 shrink-0", className)}
    />
  );
}

function IconAction({
  label,
  icon,
  shortcut,
  onClick,
}: {
  label: string;
  icon: IconSvgElement;
  shortcut?: string;
  onClick(): void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Glyph icon={icon} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? (
          <span className="ml-2 text-muted-foreground">{shortcut}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function AuthorAvatar({ author }: { author: Author }) {
  if (author.kind === "agent") {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Glyph icon={BotIcon} className="size-3" />
      </span>
    );
  }
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-2xs font-medium text-background">
      {author.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function MessageBody({ body }: { body: string }) {
  const navigate = useBbNavigate();
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {body
        .split(/(@\[[^\]\n]+\]\(thread:thr_[a-zA-Z0-9_-]+\))/g)
        .map((part, i) => {
          const mention = commentMentions(part)[0];
          return mention ? (
            <button
              key={i}
              className="rounded bg-muted px-1 font-medium"
              onClick={() => navigate.toThread(mention.id)}
            >
              @{mention.name}
            </button>
          ) : (
            part
          );
        })}
    </p>
  );
}

function Composer({
  placeholder,
  initial = "",
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  submitLabel: string;
  autoFocus: boolean;
  onSubmit(body: string): Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const mentionQuery = /(?:^|\s)@([\w ]*)$/.exec(value)?.[1] ?? null;
  const rpc = useRpc<typeof docsRpcContract>();
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (mentionQuery === null) {
      setMatches([]);
      return;
    }
    const timeout = setTimeout(() => {
      void rpc
        .call("commentThreads", { query: mentionQuery })
        .then((items) => {
          if (live) setMatches(items);
        })
        .catch(() => {
          if (live) setMatches([]);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [rpc, mentionQuery]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  const submit = async () => {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(body);
      setValue("");
    } catch (error) {
      setError(String(error));
    } finally {
      setSending(false);
    }
  };

  const insertMention = (item: { id: string; name: string }) => {
    setValue(
      value.replace(/@([\w ]*)$/, `@[${item.name}](thread:${item.id}) `),
    );
    ref.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Enter" && matches.length > 0 && !event.shiftKey) {
      event.preventDefault();
      insertMention(matches[0]);
    }
    if (event.key === "Escape") onCancel?.();
  };

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        className="block w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {matches.length > 0 ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface-raised-solid p-1 shadow-md"
        >
          {matches.map((name, index) => (
            <button
              key={name.id}
              type="button"
              role="option"
              aria-selected={index === 0}
              onClick={() => insertMention(name)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-state-hover",
                index === 0 && "bg-state-hover",
              )}
            >
              <Glyph icon={BotIcon} className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{name.name}</span>
              <span className="text-xs text-muted-foreground">Thread</span>
            </button>
          ))}
        </div>
      ) : null}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {value.trim() || onCancel ? (
        <div className="mt-1.5 flex items-center justify-end gap-1.5">
          {onCancel ? (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={!value.trim() || sending}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MessageRow({
  message: item,
  isRoot,
  canAct,
  onEdit,
  onDelete,
}: {
  message: Message;
  isRoot: boolean;
  canAct: boolean;
  onEdit(body: string): Promise<void>;
  onDelete(): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const own = item.author.kind === "user";

  return (
    <div className="group/message">
      <div className="flex items-center gap-2">
        <AuthorAvatar author={item.author} />
        <span className="min-w-0 truncate text-sm font-medium">
          {item.author.name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
          {item.editedAt ? " · edited" : ""}
        </span>
        {own && canAct ? (
          <div className="relative ml-auto">
            <IconAction
              label="More actions"
              icon={MoreHorizontalIcon}
              onClick={() => setMenuOpen((open) => !open)}
            />
            {menuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-border bg-surface-raised-solid p-1 shadow-md">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-state-hover"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                >
                  <Glyph icon={Edit02Icon} /> Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-state-hover"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(false);
                    setConfirmingDelete(true);
                  }}
                >
                  <Glyph icon={Delete02Icon} />
                  {isRoot ? "Delete thread" : "Delete reply"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-1 pl-7">
        {editing ? (
          <Composer
            placeholder="Edit comment"
            initial={item.body}
            submitLabel="Save"
            autoFocus
            onSubmit={async (body) => {
              await onEdit(body);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <MessageBody body={item.body} />
        )}
        {confirmingDelete ? (
          <div
            className="mt-2 flex items-center gap-1.5 rounded-md bg-surface-destructive px-2 py-1.5"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="min-w-0 flex-1 text-xs">
              {isRoot ? "Delete this thread and its replies?" : "Delete reply?"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ThreadActions {
  activate(id: string | null): void;
  reply(id: string, body: string): Promise<void>;
  setResolved(id: string, resolved: boolean): void;
  editMessage(id: string, messageId: string, body: string): Promise<void>;
  deleteMessage(id: string, messageId: string): void;
  startReattach(id: string): void;
  startAgent(id: string, projectId: string): Promise<void>;
}

function ThreadCard({
  thread,
  active,
  reattaching,
  actions,
}: {
  thread: CommentThread;
  active: boolean;
  reattaching: boolean;
  actions: ThreadActions;
}) {
  const [root, ...replies] = thread.messages;
  const navigate = useBbNavigate();
  const mentions = thread.messages.flatMap((message) => message.sentTo);
  const rpc = useRpc<typeof docsRpcContract>();
  const [projects, setProjects] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [projectId, setProjectId] = useState("");
  const [starting, setStarting] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const resolved = thread.resolvedBy !== null;
  const orphaned = thread.anchor.state === "orphaned";

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => actions.activate(thread.id)}
        className={cn(
          "block w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-state-hover",
          resolved && "opacity-70",
        )}
      >
        {orphaned ? (
          <span className="mb-1 flex items-center gap-1.5 text-xs text-warning-text">
            <Glyph icon={Unlink02Icon} className="size-3" />
            Text not found
          </span>
        ) : null}
        <span className="flex items-center gap-2">
          <AuthorAvatar author={root.author} />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="mr-1 font-medium">{root.author.name}</span>{" "}
            {root.body}
          </span>
          {replies.length > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {replies.length + 1}
            </span>
          ) : null}
          {resolved ? (
            <Glyph
              icon={CheckmarkCircle02Icon}
              className="text-muted-foreground"
            />
          ) : null}
        </span>
      </button>
    );
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="rounded-lg border border-border bg-background shadow-md"
    >
      <div className="flex items-center gap-1 border-b border-border py-1 pl-3 pr-1">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {resolved ? `Resolved by ${thread.resolvedBy?.name}` : null}
          {!resolved && orphaned ? "Text not found" : null}
          {!resolved && !orphaned
            ? `${thread.messages.length} ${thread.messages.length === 1 ? "comment" : "comments"}`
            : null}
        </span>
        {resolved ? (
          <IconAction
            label="Reopen"
            icon={ArrowTurnBackwardIcon}
            onClick={() => actions.setResolved(thread.id, false)}
          />
        ) : (
          <IconAction
            label="Resolve"
            icon={CheckmarkCircle02Icon}
            shortcut="⌘⇧Enter"
            onClick={() => actions.setResolved(thread.id, true)}
          />
        )}
        <IconAction
          label="Close"
          icon={Cancel01Icon}
          shortcut="Esc"
          onClick={() => actions.activate(null)}
        />
      </div>
      {orphaned ? (
        <div className="border-b border-border bg-surface-attention px-3 py-2">
          <p className="text-xs leading-relaxed">
            The commented text was edited or removed.
          </p>
          <p className="mt-1 text-xs italic text-muted-foreground line-through">
            “{thread.anchor.quote}”
          </p>
          <div className="mt-2 flex gap-1.5">
            <Button
              size="sm"
              variant={reattaching ? "secondary" : "outline"}
              onClick={() => actions.startReattach(thread.id)}
            >
              {reattaching ? "Select text in the doc…" : "Reattach to text"}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="space-y-3 px-3 py-2.5">
        {thread.messages.map((item, index) => (
          <MessageRow
            key={item.id}
            message={item}
            isRoot={index === 0}
            canAct={!resolved}
            onEdit={(body) => actions.editMessage(thread.id, item.id, body)}
            onDelete={() => actions.deleteMessage(thread.id, item.id)}
          />
        ))}
        {mentions
          .filter(
            (item, i) =>
              mentions.findIndex((other) => item.id === other.id) === i,
          )
          .map((item) => (
            <button
              key={item.id}
              className="flex items-center gap-1.5 pl-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate.toThread(item.id)}
            >
              <Glyph icon={ArrowUpRight01Icon} className="size-3" /> Sent to{" "}
              {item.name}
            </button>
          ))}
        {!resolved && (
          <div className="pl-7 text-xs">
            {projects === null ? (
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void rpc
                    .call("commentProjects", {})
                    .then((items) => {
                      setProjects(items);
                      setProjectId(items[0]?.id ?? "");
                    })
                    .catch((error) => setAgentError(String(error)));
                }}
              >
                New thread
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Project for new thread"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="min-w-0 max-w-full rounded border border-input bg-background p-1"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!projectId || starting}
                  onClick={() => {
                    setStarting(true);
                    void actions
                      .startAgent(thread.id, projectId)
                      .then(() => setProjects(null))
                      .catch((error) => setAgentError(String(error)))
                      .finally(() => setStarting(false));
                  }}
                >
                  Start thread
                </Button>
                <button onClick={() => setProjects(null)}>Cancel</button>
              </div>
            )}
            {agentError && (
              <p role="alert" className="text-destructive">
                {agentError}
              </p>
            )}
          </div>
        )}
        {resolved ? null : (
          <Composer
            key={thread.messages.length}
            placeholder="Reply, or @mention an agent"
            submitLabel="Reply"
            autoFocus={false}
            onSubmit={(body) => actions.reply(thread.id, body)}
          />
        )}
      </div>
    </div>
  );
}

type Selection = {
  quote: string;
  occurrence: number;
  from: number;
  to: number;
  top: number;
  left: number;
};
const EMPTY: CommentsList = { sidecarSha256: null, threads: [], notice: null };
export function CommentsSurface({
  target,
  editor,
  sha256,
  flush,
  children,
}: {
  target: CommentTarget;
  editor: Editor | null;
  sha256: string;
  flush(): Promise<void>;
  children: ReactNode;
}) {
  const rpc = useRpc<typeof docsRpcContract>();
  const targetKey = JSON.stringify(target);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [data, setData] = useState<CommentsList>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(true);
  const [resolved, setResolved] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<Selection | null>(null);
  const [reattach, setReattach] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const compact = useIsCompactViewport();
  const { isContentRealized } = useResponsiveDrawerRealization({
    open: drawerOpen,
    enabled: compact,
  });
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const request = useRef(0);
  const savedSha = useRef(sha256);
  const activeRef = useRef(active);
  activeRef.current = active;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const result = await rpc.call("listComments", {
        ...targetRef.current,
        status: "all",
      });
      if (version === request.current) {
        setData(result);
        setError(null);
      }
    } catch (error) {
      if (version === request.current) setError(String(error));
    }
  }, [rpc]);
  useEffect(() => {
    setData(EMPTY);
    setActive(null);
    setDraft(null);
    void refresh();
    return () => {
      request.current++;
    };
  }, [targetKey, refresh]);
  const changed = useCallback(
    (payload: unknown) => {
      if (typeof payload !== "object" || payload === null) return;
      if ("path" in payload && payload.path !== targetRef.current.path) return;
      if (
        "vaultId" in payload &&
        payload.vaultId &&
        payload.vaultId !== targetRef.current.vaultId
      )
        return;
      void refresh();
    },
    [refresh],
  );
  useRealtime("comments-changed", changed);
  useRealtime("vault-changed", changed);

  const activate = useCallback(
    (id: string | null) => {
      setActive(id);
      setShown(true);
      setDraft(null);
      if (compact) setDrawerOpen(id !== null);
    },
    [compact],
  );
  const apply = async (work: Promise<CommentsList>) => {
    const key = targetKey;
    const result = await work;
    if (key === JSON.stringify(targetRef.current)) {
      request.current++;
      setData(result);
      setError(null);
    }
  };
  const act = (work: Promise<void>) => {
    void work.catch((error) => setError(String(error)));
  };
  const actions: ThreadActions = {
    activate,
    startAgent: (commentId, projectId) =>
      apply(rpc.call("startCommentAgent", { ...target, commentId, projectId })),
    reply: (commentId, body) =>
      apply(rpc.call("replyComment", { ...target, commentId, body })),
    setResolved: (commentId, resolved) =>
      act(
        apply(
          rpc.call("setCommentStatus", { ...target, commentId, resolved }),
        ).then(() => activate(null)),
      ),
    editMessage: (commentId, messageId, body) =>
      apply(
        rpc.call("editCommentMessage", {
          ...target,
          commentId,
          messageId,
          body,
        }),
      ),
    deleteMessage: (commentId, messageId) =>
      act(
        apply(
          rpc.call("deleteCommentMessage", { ...target, commentId, messageId }),
        ),
      ),
    startReattach: (id) => {
      setReattach(id);
      setDraft(null);
      setDrawerOpen(false);
    },
  };
  const startDraft = useCallback(() => {
    const selected = selectionRef.current;
    if (!selected) return;
    setDraft(selected);
    setShown(true);
    setActive(null);
    setSelection(null);
    if (compact) setDrawerOpen(true);
  }, [compact]);
  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || !editor.isFocused) {
        setSelection(null);
        return;
      }
      const visible = visibleEditor(editor.state.doc);
      const start = visible.positions.findIndex((position) => position >= from);
      let end = visible.positions.findIndex((position) => position >= to);
      if (end < 0) end = visible.text.length;
      const quote = visible.text.slice(start, end);
      if (start < 0 || !quote.trim()) {
        setSelection(null);
        return;
      }
      const bounds = root.current?.getBoundingClientRect();
      const coords = editor.view.coordsAtPos(to);
      setSelection({
        quote,
        occurrence: exactOccurrences(visible.text, quote).indexOf(start) + 1,
        from,
        to,
        top:
          coords.bottom -
          (bounds?.top ?? 0) +
          (root.current?.scrollTop ?? 0) +
          6,
        left: Math.max(
          8,
          Math.min(
            coords.left - (bounds?.left ?? 0),
            (bounds?.width ?? 390) - 120,
          ),
        ),
      });
    };
    const onTransaction = () => {
      setRevision((revision) => revision + 1);
      onSelection();
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        event.code === "KeyM"
      ) {
        event.preventDefault();
        startDraft();
      }
    };
    const onClick = (event: MouseEvent) => {
      const position = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      const decorations = commentHighlightKey.getState(editor.state);
      if (!position || !decorations) return;
      const range = commentRanges(editor.state.doc, decorations)
        .filter(
          (range) => range.from <= position.pos && range.to >= position.pos,
        )
        .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
      if (range) activate(range.id);
    };
    editor.on("selectionUpdate", onSelection);
    editor.on("transaction", onTransaction);
    editor.view.dom.addEventListener("keydown", onKey);
    editor.view.dom.addEventListener("click", onClick);
    return () => {
      editor.off("selectionUpdate", onSelection);
      editor.off("transaction", onTransaction);
      editor.view.dom.removeEventListener("keydown", onKey);
      editor.view.dom.removeEventListener("click", onClick);
    };
  }, [editor, activate, startDraft]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const visible = visibleEditor(editor.state.doc);
    const ranges: CommentRange[] = [];
    for (const thread of data.threads) {
      if (
        thread.resolvedAt ||
        thread.anchor.start === null ||
        thread.anchor.end === null
      )
        continue;
      const from = visible.positions[thread.anchor.start];
      const to = visible.positions[thread.anchor.end - 1];
      if (from !== undefined && to !== undefined)
        ranges.push({ id: thread.id, from, to: to + 1 });
    }
    editor.view.dispatch(
      editor.state.tr.setMeta(commentHighlightKey, {
        ranges,
        active: activeRef.current,
      }),
    );
  }, [editor, data]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const decorations = commentHighlightKey.getState(editor.state);
    if (decorations)
      editor.view.dispatch(
        editor.state.tr.setMeta(commentHighlightKey, {
          ranges: commentRanges(editor.state.doc, decorations),
          active,
        }),
      );
  }, [editor, active]);
  useEffect(() => {
    if (savedSha.current === sha256) return;
    savedSha.current = sha256;
    if (!editor || !data.threads.length || !sha256) {
      void refresh();
      return;
    }
    const decorations = commentHighlightKey.getState(editor.state);
    if (!decorations) return;
    const visible = visibleEditor(editor.state.doc);
    const anchors = commentRanges(editor.state.doc, decorations).flatMap(
      (range) => {
        const start = visible.positions.indexOf(range.from);
        let end = visible.positions.findIndex(
          (position) => position >= range.to,
        );
        if (end < 0) end = visible.text.length;
        return start < 0 || end <= start
          ? []
          : [
              {
                id: range.id,
                anchor: makeAnchor(visible.text, start, end, sha256),
              },
            ];
      },
    );
    if (anchors.length)
      void rpc
        .call("refreshCommentAnchors", {
          ...targetRef.current,
          documentSha256: sha256,
          anchors,
        })
        .then(setData)
        .catch(() => refresh());
    else void refresh();
  }, [sha256, editor, data.threads.length, rpc, refresh]);
  const visibleThreads = data.threads
    .filter((thread) => resolved || !thread.resolvedAt)
    .sort((a, b) => (a.anchor.start ?? -1) - (b.anchor.start ?? -1));
  useLayoutEffect(() => {
    if (compact || !editor || !root.current) return;
    const layout = () => {
      const container = content.current;
      if (!container) return;
      let bottom = 12;
      const origin = container.getBoundingClientRect().top;
      const decorations = commentHighlightKey.getState(editor.state);
      const ranges = decorations
        ? commentRanges(editor.state.doc, decorations)
        : [];
      const items = [
        ...visibleThreads.map((thread) => ({
          id: thread.id,
          position: ranges.find((range) => range.id === thread.id)?.from,
        })),
        ...(draft ? [{ id: "draft", position: draft.from }] : []),
      ];
      items.sort((a, b) => (a.position ?? -1) - (b.position ?? -1));
      for (const item of items) {
        const card = cards.current.get(item.id);
        if (!card) continue;
        const top =
          item.position === undefined
            ? 12
            : editor.view.coordsAtPos(
                Math.min(item.position, editor.state.doc.content.size),
              ).top - origin;
        card.style.top = `${Math.max(bottom, top)}px`;
        bottom = Math.max(bottom, top) + card.offsetHeight + 10;
      }
      container.style.minHeight = `${bottom + 24}px`;
    };
    layout();
    const observer = new ResizeObserver(layout);
    for (const card of cards.current.values()) observer.observe(card);
    observer.observe(editor.view.dom);
    return () => observer.disconnect();
  }, [editor, compact, visibleThreads, draft, revision, shown]);
  const cancelDraft = () => {
    setDraft(null);
    setDrawerOpen(false);
  };
  const draftCard = draft && (
    <div className="rounded-lg border border-border bg-background p-3 shadow-md">
      <p className="mb-2 truncate text-xs text-muted-foreground">
        on “{draft.quote}”
      </p>
      <Composer
        placeholder={
          reattach ? "Reattach this thread" : "Comment, or @mention an agent"
        }
        submitLabel="Comment"
        autoFocus
        onCancel={cancelDraft}
        onSubmit={async (body) => {
          await flush();
          await apply(
            rpc.call("addComment", {
              ...target,
              quote: draft.quote,
              occurrence: draft.occurrence,
              body,
            }),
          );
          cancelDraft();
        }}
      />
    </div>
  );
  const startSelection = () => {
    if (reattach && selection) {
      act(
        flush()
          .then(() =>
            apply(
              rpc.call("reattachComment", {
                ...target,
                commentId: reattach,
                quote: selection.quote,
                occurrence: selection.occurrence,
              }),
            ),
          )
          .then(() => {
            activate(reattach);
            setReattach(null);
            setSelection(null);
          }),
      );
    } else startDraft();
  };
  const threadContent = (
    <div className="space-y-2 p-3">
      {draftCard}
      {!draft &&
        visibleThreads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            active={active === thread.id}
            reattaching={reattach === thread.id}
            actions={actions}
          />
        ))}
      {!draft && !visibleThreads.length && (
        <p className="text-sm text-muted-foreground">
          Select text in the document to leave a comment.
        </p>
      )}
    </div>
  );
  return (
    <TooltipProvider delayDuration={200}>
      <div className="bb-docs-comment-surface flex min-h-0 flex-1 flex-col">
        <style>{`
      .bb-docs-comment-surface .bb-simple-notes-editor { overflow: visible; }
      .docs-comment-highlight { background: color-mix(in oklab, var(--warning) 16%, transparent); border-bottom: 2px solid color-mix(in oklab, var(--warning) 50%, transparent); cursor:pointer; }
      .docs-comment-highlight[data-active="true"] { background:color-mix(in oklab,var(--warning) 34%,transparent); border-bottom-color:var(--warning); }
    `}</style>
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          {data.threads.some((thread) => thread.resolvedAt) && (
            <button
              aria-pressed={resolved}
              className={cn(
                "rounded px-2 py-1 hover:bg-state-hover",
                resolved && "bg-muted",
              )}
              onClick={() => setResolved(!resolved)}
            >
              {data.threads.filter((thread) => thread.resolvedAt).length}{" "}
              resolved
            </button>
          )}
          <button
            aria-label="Comments"
            aria-expanded={compact ? drawerOpen : shown}
            className="flex items-center gap-1.5 rounded px-2 py-1 hover:bg-state-hover"
            onClick={() =>
              compact ? setDrawerOpen(!drawerOpen) : setShown(!shown)
            }
          >
            <Glyph icon={BubbleChatIcon} />
            {data.threads.filter((thread) => !thread.resolvedAt).length}
          </button>
        </div>
        {(error || data.notice) && (
          <div role="alert" className="px-3 py-2 text-xs text-destructive">
            {error || data.notice}{" "}
            <button onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        {reattach && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            Select new text, then choose Reattach.{" "}
            <button onClick={() => setReattach(null)}>Cancel</button>
          </div>
        )}
        <div ref={root} className="relative min-h-0 flex-1 overflow-auto">
          <div
            ref={content}
            className={cn(
              "relative flex min-w-0",
              !compact &&
                shown &&
                (data.threads.length > 0 || draft) &&
                "pr-80",
            )}
          >
            <div className="min-w-0 flex-1">{children}</div>
            {!compact && shown && (
              <aside
                aria-label="Document comments"
                className="absolute inset-y-0 right-0 w-80 border-l border-border bg-muted/10"
              >
                {visibleThreads.map((thread) => (
                  <div
                    key={thread.id}
                    ref={(element) => {
                      if (element) cards.current.set(thread.id, element);
                      else cards.current.delete(thread.id);
                    }}
                    className="absolute left-3 right-3"
                  >
                    <ThreadCard
                      thread={thread}
                      active={active === thread.id}
                      reattaching={reattach === thread.id}
                      actions={actions}
                    />
                  </div>
                ))}
                {draft && (
                  <div
                    ref={(element) => {
                      if (element) cards.current.set("draft", element);
                      else cards.current.delete("draft");
                    }}
                    className="absolute left-3 right-3"
                  >
                    {draftCard}
                  </div>
                )}
              </aside>
            )}
          </div>
          {selection && !draft && (
            <button
              className="absolute z-20 flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs shadow-md"
              style={{ top: selection.top, left: selection.left }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={startSelection}
            >
              <Glyph icon={BubbleChatIcon} />
              {reattach ? "Reattach" : "Comment"}
            </button>
          )}
        </div>
        {compact && (
          <PersistentResponsiveDrawerShell
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            srLabel="Document comments"
          >
            {isContentRealized && (
              <div className="min-h-0 overflow-y-auto">{threadContent}</div>
            )}
          </PersistentResponsiveDrawerShell>
        )}
      </div>
    </TooltipProvider>
  );
}
