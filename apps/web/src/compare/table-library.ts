import { BB_ROWS } from "./compare-content";
import type { CompareGroup } from "./compare-types";
import type { ComparisonRowKey, CompetitorCells } from "./competitor-cells";

const TABLE_GROUPS: { title: string; rows: ComparisonRowKey[] }[] = [
  { title: "Price and license", rows: ["pricing", "license"] },
  { title: "Workspace", rows: ["worktrees", "diffReview"] },
];

export function comparisonTable(cells: CompetitorCells): CompareGroup[] {
  return TABLE_GROUPS.map((group) => ({
    title: group.title,
    rows: group.rows.map((key) => ({
      ...BB_ROWS[key],
      competitor: cells[key],
    })),
  }));
}
