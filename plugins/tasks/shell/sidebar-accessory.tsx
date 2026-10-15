import { useTaskRead } from "./data.js";
export function TasksSidebarAccessory() {
  const query = useTaskRead(
    "sidebarOpenTaskCount",
    null,
    (value) => value.openTaskCount,
  );
  const count = query.data;
  return count === undefined || count === 0 ? null : (
    <span className="text-muted-foreground tabular-nums">{count}</span>
  );
}
