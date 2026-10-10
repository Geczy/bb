import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  corpusAvailable,
  listCorpusThreads,
  loadCorpusThread,
  type CorpusStoredEventRow,
} from "@bb/test-helpers";
import {
  createConnection,
  getLatestThreadSequence,
  insertEvents,
  migrate,
  noopNotifier,
} from "@bb/db";
import type { DbConnection } from "@bb/db";
import type { Thread, ThreadEventType } from "@bb/domain";
import { turnScope } from "@bb/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProviderRegistryService } from "../../src/services/providers/provider-registry.js";
import { clearTimelineOrderingContextCache } from "../../src/services/threads/timeline-context-order.js";
import { THREAD_TIMELINE_DEFAULT_SEGMENT_LIMIT } from "../../src/services/threads/timeline.js";
import { createTestProviderRegistry } from "../helpers/provider-registry.js";
import {
  TIMELINE_VARIANTS,
  buildRouteTimelinePage,
  clearCrossBuildTimelineCaches,
  insertCorpusEventRows,
  latestTimelinePage,
  loadCorpusThreadIntoDb,
  percentile,
  selectionWasReused,
} from "./corpus-harness.js";

const PER_THREAD_TIMEOUT_MS = 5 * 60_000;
const PROBE_ITEM_ID = "corpus-memo-probe-message";

interface TickSpec {
  data: Record<string, unknown>;
  itemId: string;
  itemKind: "agentMessage" | null;
  target: "earlier-root-turn" | "latest-root-turn";
  type: ThreadEventType;
}

function tickSpec(
  type: ThreadEventType,
  data: Record<string, unknown>,
  overrides: Partial<TickSpec> = {},
): TickSpec {
  return {
    data,
    itemId: PROBE_ITEM_ID,
    itemKind: null,
    target: "latest-root-turn",
    type,
    ...overrides,
  };
}

const TICKS: readonly TickSpec[] = [
  tickSpec(
    "item/started",
    { item: { type: "agentMessage", id: PROBE_ITEM_ID, text: "" } },
    { itemKind: "agentMessage" },
  ),
  tickSpec("item/agentMessage/delta", {
    itemId: PROBE_ITEM_ID,
    delta: "Streaming probe",
  }),
  tickSpec("item/agentMessage/delta", {
    itemId: PROBE_ITEM_ID,
    delta: " line\n",
  }),
  tickSpec("thread/contextWindowUsage/updated", {
    contextWindowUsage: {
      estimated: false,
      modelContextWindow: 200_000,
      usedTokens: 1_234,
    },
  }),
  tickSpec("item/agentMessage/delta", {
    itemId: PROBE_ITEM_ID,
    delta: "partial",
  }),
  tickSpec(
    "item/commandExecution/outputDelta",
    { itemId: "corpus-memo-probe-late-command", delta: "late output\n" },
    { itemId: "corpus-memo-probe-late-command", target: "earlier-root-turn" },
  ),
  tickSpec("item/agentMessage/delta", {
    itemId: PROBE_ITEM_ID,
    delta: " after late\n",
  }),
];

interface RootTurn {
  providerThreadId: string | null;
  turnId: string;
}

function listLatestRootTurns(db: DbConnection, threadId: string): RootTurn[] {
  return db.$client
    .prepare<[string], RootTurn>(
      `SELECT turn_id AS turnId, provider_thread_id AS providerThreadId
       FROM events
       WHERE thread_id = ? AND type = 'turn/started' AND parent_tool_call_id IS NULL
       ORDER BY sequence DESC LIMIT 2`,
    )
    .all(threadId);
}

const available = corpusAvailable();
const corpusThreads = available ? listCorpusThreads() : [];

describe.skipIf(!available)("provider corpus streaming selection memo", () => {
  let registry: ProviderRegistryService | null = null;
  const totals = { comparisons: 0, reused: 0, threads: 0 };
  const warmTickMs: number[] = [];
  const coldTickMs: number[] = [];

  beforeAll(async () => {
    if (available) {
      registry = await createTestProviderRegistry();
    }
  });

  afterAll(() => {
    if (totals.threads === 0) return;
    process.stdout.write(
      `Streaming selection memo: ${totals.threads} threads, ${totals.comparisons} warm/cold comparisons, ${totals.reused} reused selections; ` +
        `tick build p50 warm ${percentile(warmTickMs, 0.5).toFixed(2)} ms vs cold ${percentile(coldTickMs, 0.5).toFixed(2)} ms\n`,
    );
  });

  it.each(corpusThreads.map((thread) => [thread.id, thread.provider] as const))(
    "%s (%s) matches a cold build while a turn streams",
    (threadId) => {
      if (registry === null) {
        throw new Error("provider registry did not load");
      }
      const corpusThread = loadCorpusThread(threadId);
      const loaded = loadCorpusThreadIntoDb(corpusThread);
      try {
        const [latestRootTurn, earlierRootTurn] = listLatestRootTurns(
          loaded.db,
          loaded.thread.id,
        );
        if (latestRootTurn === undefined) return;
        const thread: Thread = { ...loaded.thread, status: "active" };
        totals.threads += 1;
        for (const tick of [null, ...TICKS]) {
          if (tick !== null) {
            const rootTurn =
              tick.target === "latest-root-turn"
                ? latestRootTurn
                : earlierRootTurn;
            if (rootTurn === undefined) continue;
            insertEvents(loaded.db, noopNotifier, [
              {
                data: JSON.stringify(tick.data),
                itemId: tick.itemId,
                itemKind: tick.itemKind,
                parentToolCallId: null,
                providerThreadId:
                  rootTurn.providerThreadId ?? latestRootTurn.providerThreadId,
                scope: turnScope(rootTurn.turnId),
                sequence:
                  getLatestThreadSequence(loaded.db, {
                    threadId: loaded.thread.id,
                  }) + 1,
                threadId: loaded.thread.id,
                type: tick.type,
              },
            ]);
          }
          const clone = createConnection(loaded.db.$client.serialize());
          try {
            for (const variant of TIMELINE_VARIANTS) {
              const args = {
                page: latestTimelinePage(),
                registry,
                thread,
                variant,
              };
              const warm = buildRouteTimelinePage({ ...args, db: loaded.db });
              clearCrossBuildTimelineCaches(clone);
              clearTimelineOrderingContextCache(clone);
              const cold = buildRouteTimelinePage({ ...args, db: clone });
              expect(JSON.stringify(warm.response)).toBe(
                JSON.stringify(cold.response),
              );
              totals.comparisons += 1;
              if (selectionWasReused(warm.profile)) {
                totals.reused += 1;
                if (variant === "default") {
                  warmTickMs.push(warm.profile.totalDurationMs);
                  coldTickMs.push(cold.profile.totalDurationMs);
                }
              }
            }
          } finally {
            clone.$client.close();
          }
        }
      } finally {
        loaded.close();
      }
    },
    PER_THREAD_TIMEOUT_MS,
  );
});

const HEAVY_TURN_MIN_EVENTS = 500;
const HEAVY_TURN_THREAD_LIMIT = 10;
const REPLAY_BATCH_LIMIT = 40;
const REPLAY_BATCH_WINDOW_MS = 50;
const REPLAY_BUILDS = [
  { variant: "default", deferContent: false },
  { variant: "default", deferContent: true },
  { variant: "nested", deferContent: false },
] as const;

interface HeavyTurnReplay {
  batches: CorpusStoredEventRow[][];
  prefix: CorpusStoredEventRow[];
}

function planHeavyTurnReplay(
  rows: readonly CorpusStoredEventRow[],
): HeavyTurnReplay | null {
  const recentRootTurnIds = new Set(
    rows
      .filter(
        (row) => row.type === "turn/started" && row.parentToolCallId === null,
      )
      .slice(-THREAD_TIMELINE_DEFAULT_SEGMENT_LIMIT)
      .map((row) => row.turnId),
  );
  const rowsByTurn = new Map<string, CorpusStoredEventRow[]>();
  for (const row of rows) {
    if (row.turnId === null || !recentRootTurnIds.has(row.turnId)) continue;
    const turnRows = rowsByTurn.get(row.turnId) ?? [];
    turnRows.push(row);
    rowsByTurn.set(row.turnId, turnRows);
  }
  const heaviest = [...rowsByTurn.values()].sort(
    (left, right) => right.length - left.length,
  )[0];
  if (heaviest === undefined || heaviest.length < HEAVY_TURN_MIN_EVENTS) {
    return null;
  }
  const cutSequence = heaviest[Math.floor(heaviest.length / 2)]!.sequence;
  const batches: CorpusStoredEventRow[][] = [];
  let batchStartedAt = 0;
  for (const row of rows) {
    if (row.sequence <= cutSequence) continue;
    const current = batches.at(-1);
    if (
      current === undefined ||
      row.createdAt - batchStartedAt > REPLAY_BATCH_WINDOW_MS
    ) {
      if (batches.length === REPLAY_BATCH_LIMIT) break;
      batches.push([row]);
      batchStartedAt = row.createdAt;
    } else {
      current.push(row);
    }
  }
  return {
    batches,
    prefix: rows.filter((row) => row.sequence <= cutSequence),
  };
}

describe.skipIf(!available)("provider corpus heavy turn replay", () => {
  let registry: ProviderRegistryService | null = null;
  let replayedThreads = 0;

  beforeAll(async () => {
    if (available) {
      registry = await createTestProviderRegistry();
    }
  });

  it("replays recorded heavy turns batch by batch, each build equal to a cold build", () => {
    if (registry === null) {
      throw new Error("provider registry did not load");
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb-corpus-replay-"));
    try {
      for (const entry of corpusThreads) {
        if (replayedThreads === HEAVY_TURN_THREAD_LIMIT) break;
        const corpusThread = loadCorpusThread(entry.id);
        const replay = planHeavyTurnReplay(corpusThread.eventRows);
        if (replay === null) continue;
        replayedThreads += 1;
        const file = path.join(dir, `${entry.id}.db`);
        const seed = createConnection(file);
        migrate(seed);
        const loaded = loadCorpusThreadIntoDb(
          { ...corpusThread, eventRows: replay.prefix },
          seed,
        );
        const coldDb = createConnection(file);
        try {
          const thread: Thread = { ...loaded.thread, status: "active" };
          for (const [index, batch] of [[], ...replay.batches].entries()) {
            loaded.db.transaction(
              (tx) => insertCorpusEventRows(tx, batch),
              { behavior: "immediate" },
            );
            for (const build of REPLAY_BUILDS) {
              const args = {
                ...build,
                page: latestTimelinePage(),
                registry,
                thread,
              };
              const warm = buildRouteTimelinePage({ ...args, db: loaded.db });
              clearCrossBuildTimelineCaches(coldDb);
              clearTimelineOrderingContextCache(coldDb);
              const cold = buildRouteTimelinePage({ ...args, db: coldDb });
              expect(
                JSON.stringify(warm.response),
                `${entry.id} batch ${index} ${JSON.stringify(build)}`,
              ).toBe(JSON.stringify(cold.response));
            }
          }
        } finally {
          coldDb.$client.close();
          loaded.close();
        }
      }
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
    process.stdout.write(`Heavy turn replay: ${replayedThreads} threads\n`);
  }, PER_THREAD_TIMEOUT_MS * HEAVY_TURN_THREAD_LIMIT);
});
