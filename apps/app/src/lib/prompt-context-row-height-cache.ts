import { z } from "zod";
import { createLastKnownCache } from "@/lib/last-known-cache";

const promptContextRowHeightCache = createLastKnownCache({
  prefix: "bb.prompt-context-row-height",
  version: "1",
  schema: z.number().nonnegative(),
  maxEntries: 200,
});

const writtenHeights = new Map<string, number>();

export function readPromptContextRowHeight(threadId: string): number {
  return (
    promptContextRowHeightCache.read(
      promptContextRowHeightCache.key(threadId),
    ) ?? 0
  );
}

export function writePromptContextRowHeight(
  threadId: string,
  height: number,
): void {
  if (writtenHeights.get(threadId) === height) return;
  writtenHeights.set(threadId, height);
  promptContextRowHeightCache.write(
    promptContextRowHeightCache.key(threadId),
    height,
  );
}
