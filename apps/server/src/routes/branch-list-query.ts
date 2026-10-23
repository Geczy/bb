
import { parseBoundedPositiveOptionalInteger } from "../services/lib/validation.js";
import { BRANCH_LIST_LIMIT_MAX } from "bb-git-contract";

const BRANCH_LIST_LIMIT_DEFAULT = 50;

export function normalizeBranchQuery(
  query: string | undefined,
): string | undefined {
  const trimmed = query?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseBranchListLimit(limit: string | undefined): number {
  return parseBoundedPositiveOptionalInteger({
    defaultValue: BRANCH_LIST_LIMIT_DEFAULT,
    max: BRANCH_LIST_LIMIT_MAX,
    name: "limit",
    value: limit,
  });
}
