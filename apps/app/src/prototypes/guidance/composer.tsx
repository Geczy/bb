import { useMemo, useState } from "react";
import type { PermissionMode, PromptTextMention } from "@bb/domain";
import { PromptBoxInternal } from "@/components/promptbox/PromptBoxInternal";
import { NewThreadPromptBoxUI } from "@/components/promptbox/NewThreadPromptBox";
import { ExecutionControls } from "@/components/promptbox/ExecutionControls";
import { HOST_IDS, STORY_PROJECTS, STORY_PROJECT_SOURCES, STORY_WORKTREE_OPTIONS, makeHost, useInteractiveExecutionControls, makeAttachmentsConfig, makeExecutionControlsProps, makeTypeaheadConfig, STORY_CLAUDE_CODE_MODELS, STORY_CLAUDE_CODE_MORE_MODELS, STORY_CLAUDE_REASONING } from "../../../.ladle/story-fixtures";

export function Composer({ value, onChange, onSubmit, running, onStop, focusKey, newThread, noProject = false, claude = false, autoFocus = true }: {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  running: boolean;
  onStop(): void;
  focusKey: number;
  newThread: boolean;
  noProject?: boolean;
  claude?: boolean;
  autoFocus?: boolean;
}) {
  const [mentions, setMentions] = useState<PromptTextMention[]>([]);
  const typeahead = useMemo(() => makeTypeaheadConfig(), []);
  const attachments = useMemo(() => makeAttachmentsConfig(), []);
  const baseExecution = makeExecutionControlsProps();
  const execution = useInteractiveExecutionControls(claude ? {
    ...baseExecution,
    provider: { ...baseExecution.provider, selectedId: "claude-code" },
    model: { ...baseExecution.model, active: { model: "claude-sonnet-5" }, selected: "claude-sonnet-5", options: STORY_CLAUDE_CODE_MODELS, moreOptions: STORY_CLAUDE_CODE_MORE_MODELS },
    reasoning: { ...baseExecution.reasoning, options: STORY_CLAUDE_REASONING },
  } : baseExecution);
  const [projectId, setProjectId] = useState<string | null>(noProject ? null : STORY_PROJECTS[0].id);
  const [worktree, setWorktree] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionMode>("auto");
  if (newThread) return <NewThreadPromptBoxUI
    id="guidance-new-thread-composer"
    autoFocus={autoFocus}
    value={value}
    mentionRanges={mentions}
    onChange={(next, ranges) => { onChange(next); setMentions(ranges); }}
    onSubmit={onSubmit}
    isSubmitting={false}
    disabled={false}
    history={{ currentDraft: { text: value, mentions, attachments: [] }, entries: [], onSelectEntry: entry => onChange(entry.text) }}
    typeahead={typeahead}
    attachments={attachments}
    mentionMenuPlacement="top"
    project={{ projects: STORY_PROJECTS, value: projectId, onChange: setProjectId, allowNoProject: true }}
    modeConfig={{
      environment: { value: `host:${HOST_IDS.local}:local`, sources: STORY_PROJECT_SOURCES, host: makeHost({ id: HOST_IDS.local }), isLocal: true },
      worktree: { options: STORY_WORKTREE_OPTIONS, value: worktree, onChange: setWorktree },
      permission: { value: permission, supported: true, onChange: setPermission, options: [{ value: "accept-edits", label: "Accept Edits" }, { value: "auto", label: "Approve for me" }, { value: "full", label: "Full Access", tone: "warning" }] },
    }}
    execution={execution}
  />;
  return <PromptBoxInternal
    id="guidance-composer"
    autoFocus={autoFocus}
    value={value}
    mentionRanges={mentions}
    onChange={(next, ranges) => { onChange(next); setMentions(ranges); }}
    onSubmit={onSubmit}
    placeholder={running ? "Add a follow-up…" : "What would you like to do next?"}
    typeahead={typeahead}
    attachments={attachments}
    mentionMenuPlacement="top"
    footerStart={<ExecutionControls {...execution} />}
    focusEndKey={focusKey}
    submission={{ isRunning: running, onStop, label: running ? "Queue follow-up" : "Send", title: running ? "Queue follow-up" : "Send", swapSubmitActions: running, onModifierSubmit: running ? onSubmit : undefined }}
    suppressPluginComposerCustomizations
  />;
}

