import { cell, price } from "./compare-content";
import type { CompareCell } from "./compare-types";

export type ComparisonRowKey =
  | "pricing"
  | "license"
  | "worktrees"
  | "diffReview";
export type CompetitorCells = Record<ComparisonRowKey, CompareCell>;

export const COMPETITOR_CELLS = {
  conductor: {
    pricing: price("$0", "Teams at $60 per person a month"),
    license: cell("no", "Closed source"),
    worktrees: cell("yes", "Setup and archive scripts"),
    diffReview: cell("yes", "Diff comments, checks, merge"),
  },
  cursor: {
    pricing: {
      ...price(
        "$0 Free",
        "Plus $8, Premium $30, Super $100, Ultra $200 / mo; Teams from $30 per user / month",
      ),
      href: "https://cursor.com/pricing",
    },
    license: cell("no", "Closed source"),
    worktrees: cell("yes"),
    diffReview: cell("yes"),
  },
  superset: {
    pricing: {
      ...price("$0 solo", "Pro $20 per user / month, or $15 billed yearly"),
      href: "https://superset.sh/pricing",
    },
    license: cell("no", "Elastic License 2.0"),
    worktrees: cell("yes", "Setup, teardown, run"),
    diffReview: cell("yes"),
  },
  "t3-code": {
    pricing: price("$0", "Any team size"),
    license: cell("yes", "MIT"),
    worktrees: cell("yes"),
    diffReview: cell("yes"),
  },
  "vibe-kanban": {
    pricing: price("$0", "Open source"),
    license: cell("yes", "Apache 2.0"),
    worktrees: cell("yes"),
    diffReview: cell("yes"),
  },
} satisfies Record<string, CompetitorCells>;
