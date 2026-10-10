import {
  createEventProjectionCheckpoint,
  THREAD_TIMELINE_EXCLUDED_EVENT_TYPES,
  type EventProjectionCheckpoint,
} from "@bb/thread-view";
import type { ThreadEventType } from "@bb/domain";
import {
  findTimelineWindowBudgetFloorSequence,
  getDatabaseDataVersion,
  getLatestThreadSequence,
  getThreadEventRewriteGeneration,
  hasParentedEventInSequenceRange,
  listStoredEventRowsByParentToolCallIds,
  listStoredTimelineWindowEventRows,
  type DbConnection,
  type TimelineWindowHint,
  type StoredEventRow,
} from "@bb/db";
import { getTimelineGroupingContext } from "./timeline-context-order.js";
import type { ThreadTimelinePageRequest } from "./timeline-pagination.js";

export type ThreadTimelineEventSelectionStrategy = "full" | "standard-window";

export interface TimelineEventRowSelection {
  contextOnlyInterruptionSequences: ReadonlySet<number>;
  orderingBoundarySequence: number | null;
  ownedSequenceStart: number;
  ownedSequenceEnd: number;
  hasOlderSegments: boolean;
  paginationPage: ThreadTimelinePageRequest;
  rows: StoredEventRow[];
  headStateRows: StoredEventRow[];
  strategy: ThreadTimelineEventSelectionStrategy;
}

export interface StandardTimelineEventRowSelection {
  hints: readonly TimelineWindowHint[];
  fetchedTurnIds: ReadonlySet<string>;
  selection: TimelineEventRowSelection;
}

export interface TimelineBudgetFloor {
  sequence: number | undefined;
}

export interface LatestTimelineSelectionMemoArgs {
  epochSequenceStart: number;
  eventBudget: number;
  excludeDiagnosticEvents: boolean;
  maxInlineOutputChars: number;
  maxSeq: number;
  page: ThreadTimelinePageRequest;
  threadId: string;
}

export interface LatestTimelineSelectionLookup {
  budgetFloor: TimelineBudgetFloor | null;
  checkpoints: Map<string, EventProjectionCheckpoint>;
  dataVersion: number;
  generation: number;
  selection: TimelineEventRowSelection | null;
}

interface TimelineSelectionMemoEntry {
  checkpoints: Map<string, EventProjectionCheckpoint>;
  hints: readonly TimelineWindowHint[];
  appendableTurnIds: ReadonlySet<string>;
  dataChars: number;
  dataVersion: number;
  epochSequenceStart: number;
  generation: number;
  maxSeq: number;
  selection: TimelineEventRowSelection;
  threadId: string;
}

interface TimelineSelectionMemo {
  dataChars: number;
  entries: Map<string, TimelineSelectionMemoEntry>;
}

export const TIMELINE_SELECTION_MEMO_MAX_ENTRIES = 16;
const TIMELINE_PROJECTION_CHECKPOINTS_PER_ENTRY = 4;
const TIMELINE_SELECTION_MEMO_MAX_DATA_CHARS = 16_000_000;
const TIMELINE_SELECTION_MEMO_MAX_APPENDED_ROWS = 512;

const NON_APPENDABLE_EVENT_TYPES: ReadonlySet<ThreadEventType> = new Set([
  "client/turn/requested",
  "client/turn/rejected",
  "turn/input/accepted",
  "turn/started",
  "turn/completed",
  "system/thread/interrupted",
  "thread/goal/updated",
  "thread/goal/cleared",
  "thread/extensionState/updated",
  "turn/plan/updated",
]);

const NON_APPENDABLE_ITEM_KINDS: ReadonlySet<string> = new Set([
  "backgroundTask",
  "delegation",
  "planSteps",
]);

const selectionMemos = new WeakMap<DbConnection, TimelineSelectionMemo>();

export function clearTimelineSelectionMemo(db: DbConnection): void {
  selectionMemos.delete(db);
}

export function countTimelineSelectionMemoEntries(db: DbConnection): number {
  return selectionMemos.get(db)?.entries.size ?? 0;
}

export function selectTimelineWindowStart(
  hints: readonly TimelineWindowHint[],
  budgetFloorSequence: number | undefined,
  segmentLimit: number,
  epochSequenceStart: number,
): number {
  if (budgetFloorSequence === undefined && hints.length <= segmentLimit) {
    return epochSequenceStart;
  }
  const affordable = hints.filter(
    (hint) =>
      budgetFloorSequence === undefined || hint.sequence >= budgetFloorSequence,
  );
  return (
    affordable[Math.min(segmentLimit, affordable.length) - 1]?.sequence ??
    hints[0]?.sequence ??
    budgetFloorSequence ??
    epochSequenceStart
  );
}

function getSelectionMemo(db: DbConnection): TimelineSelectionMemo {
  let memo = selectionMemos.get(db);
  if (memo === undefined) {
    memo = { dataChars: 0, entries: new Map() };
    selectionMemos.set(db, memo);
  }
  return memo;
}

function dataCharsOfRows(rows: readonly StoredEventRow[]): number {
  let chars = 0;
  for (const row of rows) {
    chars += row.data.length;
  }
  return chars;
}

function deleteMemoEntry(memo: TimelineSelectionMemo, key: string): void {
  const entry = memo.entries.get(key);
  if (entry === undefined) return;
  memo.entries.delete(key);
  memo.dataChars -= entry.dataChars;
}

function deleteThreadMemoEntries(
  memo: TimelineSelectionMemo,
  threadId: string,
  keep: (entry: TimelineSelectionMemoEntry) => boolean,
): void {
  for (const [key, entry] of memo.entries) {
    if (entry.threadId === threadId && !keep(entry)) {
      deleteMemoEntry(memo, key);
    }
  }
}

function storeMemoEntry(
  memo: TimelineSelectionMemo,
  key: string,
  entry: TimelineSelectionMemoEntry,
): void {
  deleteMemoEntry(memo, key);
  if (entry.dataChars > TIMELINE_SELECTION_MEMO_MAX_DATA_CHARS) return;
  memo.entries.set(key, entry);
  memo.dataChars += entry.dataChars;
  while (
    memo.entries.size > TIMELINE_SELECTION_MEMO_MAX_ENTRIES ||
    memo.dataChars > TIMELINE_SELECTION_MEMO_MAX_DATA_CHARS
  ) {
    const oldest = memo.entries.keys().next().value;
    if (oldest === undefined) break;
    deleteMemoEntry(memo, oldest);
  }
}

function selectionMemoKey(args: LatestTimelineSelectionMemoArgs): string {
  return JSON.stringify([
    args.threadId,
    args.page.segmentLimit,
    args.eventBudget,
    args.maxInlineOutputChars,
    args.excludeDiagnosticEvents,
    args.epochSequenceStart,
  ]);
}

function isAppendableRow(
  row: StoredEventRow,
  appendableTurnIds: ReadonlySet<string>,
): boolean {
  return (
    !NON_APPENDABLE_EVENT_TYPES.has(row.type) &&
    (row.itemKind === null || !NON_APPENDABLE_ITEM_KINDS.has(row.itemKind)) &&
    (row.turnId === null || appendableTurnIds.has(row.turnId))
  );
}

function delegatingItemId(row: StoredEventRow): string | null {
  return row.itemKind === "toolCall" || row.itemKind === "delegation"
    ? row.itemId
    : null;
}

function appendedToolCallsKeepSelection(
  db: DbConnection,
  args: LatestTimelineSelectionMemoArgs,
  entry: TimelineSelectionMemoEntry,
  appendedRows: readonly StoredEventRow[],
): boolean {
  const childParentIds = new Set(
    appendedRows.flatMap((row) =>
      row.parentToolCallId === null ? [] : [row.parentToolCallId],
    ),
  );
  const appendedToolCallIds = appendedRows.flatMap((row) => {
    const itemId = delegatingItemId(row);
    return itemId === null ? [] : [itemId];
  });
  if (childParentIds.size === 0 && appendedToolCallIds.length === 0) {
    return true;
  }
  const selectedToolCallIds = new Set(
    entry.selection.rows.flatMap((row) => {
      const itemId = delegatingItemId(row);
      return itemId === null ? [] : [itemId];
    }),
  );
  const visibleToolCallIds = new Set([
    ...selectedToolCallIds,
    ...appendedToolCallIds,
  ]);
  if ([...childParentIds].some((id) => !visibleToolCallIds.has(id))) {
    return false;
  }
  const selectedRowIds = new Set(entry.selection.rows.map((row) => row.id));
  return listStoredEventRowsByParentToolCallIds(db, {
    beforeSequence: entry.maxSeq + 1,
    excludedTypes: THREAD_TIMELINE_EXCLUDED_EVENT_TYPES,
    excludeDiagnosticEvents: args.excludeDiagnosticEvents,
    maxInlineOutputChars: args.maxInlineOutputChars,
    parentToolCallIds: [
      ...childParentIds,
      ...appendedToolCallIds.filter((id) => !selectedToolCallIds.has(id)),
    ],
    sequenceStart: args.epochSequenceStart,
    threadId: args.threadId,
  }).every((row) => selectedRowIds.has(row.id));
}

function orderingBoundaryKept(
  db: DbConnection,
  args: LatestTimelineSelectionMemoArgs,
  entry: TimelineSelectionMemoEntry,
): boolean {
  return (
    !hasParentedEventInSequenceRange(db, {
      afterSequence: entry.maxSeq,
      threadId: args.threadId,
      throughSequence: args.maxSeq,
    }) ||
    getTimelineGroupingContext(db, {
      maxSeq: args.maxSeq,
      sequenceStart: args.epochSequenceStart,
      threadId: args.threadId,
    }).orderingBoundarySequence === entry.selection.orderingBoundarySequence
  );
}

function listAppendableRows(
  db: DbConnection,
  args: LatestTimelineSelectionMemoArgs,
  entry: TimelineSelectionMemoEntry,
): StoredEventRow[] | null {
  if (
    args.maxSeq < entry.maxSeq ||
    args.maxSeq - entry.maxSeq > TIMELINE_SELECTION_MEMO_MAX_APPENDED_ROWS ||
    getLatestThreadSequence(db, { threadId: args.threadId }) !== args.maxSeq
  ) {
    return null;
  }
  const appendedRows = listStoredTimelineWindowEventRows(db, {
    beforeSequence: args.maxSeq + 1,
    excludeDiagnosticEvents: args.excludeDiagnosticEvents,
    excludedTypes: THREAD_TIMELINE_EXCLUDED_EVENT_TYPES,
    maxInlineOutputChars: args.maxInlineOutputChars,
    sequenceStart: entry.maxSeq + 1,
    threadId: args.threadId,
  });
  return appendedRows.every((row) =>
    isAppendableRow(row, entry.appendableTurnIds),
  ) &&
    appendedToolCallsKeepSelection(db, args, entry, appendedRows) &&
    orderingBoundaryKept(db, args, entry)
    ? appendedRows
    : null;
}

export function forgetLatestTimelineSelections(
  db: DbConnection,
  threadId: string,
): void {
  const memo = selectionMemos.get(db);
  if (memo === undefined) return;
  deleteThreadMemoEntries(memo, threadId, () => false);
}

export function lookupLatestTimelineSelection(
  db: DbConnection,
  args: LatestTimelineSelectionMemoArgs,
): LatestTimelineSelectionLookup {
  const generation = getThreadEventRewriteGeneration(args.threadId);
  const dataVersion = getDatabaseDataVersion(db);
  const memo = selectionMemos.get(db);
  const key = selectionMemoKey(args);
  const entry = memo?.entries.get(key);
  const miss: LatestTimelineSelectionLookup = {
    budgetFloor: null,
    checkpoints: entry?.checkpoints ?? new Map(),
    dataVersion,
    generation,
    selection: null,
  };
  if (
    memo === undefined ||
    entry === undefined ||
    entry.generation !== generation ||
    entry.dataVersion !== dataVersion
  ) {
    return miss;
  }
  const appendableRows = listAppendableRows(db, args, entry);
  if (appendableRows === null) {
    return miss;
  }
  const budgetFloor: TimelineBudgetFloor = {
    sequence: findTimelineWindowBudgetFloorSequence(db, {
      threadId: args.threadId,
      sequenceStart: args.epochSequenceStart,
      beforeSequence: args.maxSeq + 1,
      eventBudget: args.eventBudget,
      excludedTypes: THREAD_TIMELINE_EXCLUDED_EVENT_TYPES,
      excludeDiagnosticEvents: args.excludeDiagnosticEvents,
    }),
  };
  const sequenceStart = selectTimelineWindowStart(
    entry.hints,
    budgetFloor.sequence,
    args.page.segmentLimit,
    args.epochSequenceStart,
  );
  if (sequenceStart !== entry.selection.ownedSequenceStart) {
    return { ...miss, budgetFloor };
  }
  const selection: TimelineEventRowSelection = {
    ...entry.selection,
    ownedSequenceEnd: args.maxSeq + 1,
    paginationPage: args.page,
    rows: entry.selection.rows.concat(appendableRows),
  };
  storeMemoEntry(memo, key, {
    ...entry,
    dataChars: entry.dataChars + dataCharsOfRows(appendableRows),
    maxSeq: args.maxSeq,
    selection,
  });
  return { ...miss, budgetFloor, selection };
}

export function rememberLatestTimelineSelection(
  db: DbConnection,
  args: LatestTimelineSelectionMemoArgs,
  lookup: LatestTimelineSelectionLookup,
  result: StandardTimelineEventRowSelection,
): void {
  const memo = getSelectionMemo(db);
  deleteThreadMemoEntries(
    memo,
    args.threadId,
    (entry) => entry.epochSequenceStart === args.epochSequenceStart,
  );
  storeMemoEntry(memo, selectionMemoKey(args), {
    checkpoints: lookup.checkpoints,
    hints: result.hints,
    appendableTurnIds: result.fetchedTurnIds,
    dataChars:
      dataCharsOfRows(result.selection.rows) +
      dataCharsOfRows(result.selection.headStateRows),
    dataVersion: lookup.dataVersion,
    epochSequenceStart: args.epochSequenceStart,
    generation: lookup.generation,
    maxSeq: args.maxSeq,
    selection: result.selection,
    threadId: args.threadId,
  });
}

export function latestTimelineProjectionCheckpoint(
  checkpoints: Map<string, EventProjectionCheckpoint>,
  key: string,
): EventProjectionCheckpoint {
  const existing = checkpoints.get(key);
  if (existing !== undefined) {
    checkpoints.delete(key);
    checkpoints.set(key, existing);
    return existing;
  }
  const checkpoint = createEventProjectionCheckpoint();
  checkpoints.set(key, checkpoint);
  while (checkpoints.size > TIMELINE_PROJECTION_CHECKPOINTS_PER_ENTRY) {
    const oldest = checkpoints.keys().next().value;
    if (oldest === undefined) break;
    checkpoints.delete(oldest);
  }
  return checkpoint;
}
