import { isDeepStrictEqual } from "node:util";
import {
  buildThreadTimelineFromEvents,
  createEventProjectionCheckpoint,
} from "../src/index.js";

type BuildThreadTimelineArgs = Parameters<
  typeof buildThreadTimelineFromEvents
>[0];

export function assertTimelineResumesFromEveryCheckpoint(
  args: BuildThreadTimelineArgs,
  expected: ReturnType<typeof buildThreadTimelineFromEvents>,
): void {
  const ordered = [...args.events].sort(
    (left, right) => left.meta.seq - right.meta.seq,
  );
  for (let folded = 0; folded < ordered.length; folded += 1) {
    const checkpoint = createEventProjectionCheckpoint();
    try {
      buildThreadTimelineFromEvents({
        ...args,
        checkpoint,
        events: ordered.slice(0, folded),
      });
    } catch {
      if (checkpoint.folded === null) {
        throw new Error(`No checkpoint after folding ${folded} events`);
      }
    }
    const resumed = buildThreadTimelineFromEvents({ ...args, checkpoint });
    if (!isDeepStrictEqual(resumed, expected)) {
      throw new Error(
        `Timeline resumed after ${folded} of ${ordered.length} events differs from a full projection`,
      );
    }
    const again = buildThreadTimelineFromEvents({ ...args, checkpoint });
    if (!isDeepStrictEqual(again, expected)) {
      throw new Error(
        `Timeline rebuilt from a checkpoint at all ${ordered.length} events differs from a full projection`,
      );
    }
  }
}
