import { TASK_PRIORITIES, type TaskSummary } from "./contract.js";
import type { TaskSort } from "./pagination.js";

const PRIORITY_RANK = new Map<TaskSummary["priority"], number>(
  TASK_PRIORITIES.map((priority, index) => [priority, index]),
);

function compareText(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function byManual(a: TaskSummary, b: TaskSummary): number {
  return (
    compareText(a.projectId, b.projectId) ||
    compareText(a.status, b.status) ||
    a.position - b.position ||
    compareText(a.id, b.id)
  );
}

function byPriority(a: TaskSummary, b: TaskSummary): number {
  return (
    (PRIORITY_RANK.get(a.priority) ?? TASK_PRIORITIES.length) -
    (PRIORITY_RANK.get(b.priority) ?? TASK_PRIORITIES.length)
  );
}

function byDueDate(a: TaskSummary, b: TaskSummary): number {
  if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
}

export function sortTasks<T extends TaskSummary>(
  tasks: readonly T[],
  sort: TaskSort,
): T[] {
  if (sort === "manual") return [...tasks].sort(byManual);
  const [primary, secondary] =
    sort === "priority" ? [byPriority, byDueDate] : [byDueDate, byPriority];
  return [...tasks].sort((a, b) => primary(a, b) || secondary(a, b));
}
