import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskSummary } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { useTasksRpc } from "../../shell/data.js";
import {
  beginEdit,
  pendingIds,
  reconcileEntries,
  settleFailure,
  settleSuccess,
  type TaskEdit,
  type TaskEntries,
} from "./optimistic.js";

interface ListTaskEditController {
  entries: TaskEntries;
  pending: ReadonlySet<string>;
  edit: (task: TaskSummary, patch: TaskEdit) => void;
}

export function useListTaskEdits(
  serverTasks: readonly TaskSummary[] | undefined,
  onError: (message: string) => void,
): ListTaskEditController {
  const rpc = useTasksRpc();
  const [entries, setEntries] = useState<TaskEntries>(() => new Map());
  const genRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (serverTasks === undefined) return;
    setEntries((prev) => reconcileEntries(prev, serverTasks));
  }, [serverTasks]);

  const edit = useCallback(
    (task: TaskSummary, patch: TaskEdit) => {
      const gen = (genRef.current += 1);
      setEntries((prev) => beginEdit(prev, task.id, patch, gen));

      void rpc.call("updateTask", { taskId: task.id, ...patch }).then(
        (result) => {
          if (result.ok) {
            setEntries((prev) =>
              settleSuccess(prev, task.id, patch, gen, result.task),
            );
          } else {
            setEntries((prev) => settleFailure(prev, task.id, patch, gen));
            onErrorRef.current(result.error.message);
          }
        },
        (error: unknown) => {
          setEntries((prev) => settleFailure(prev, task.id, patch, gen));
          onErrorRef.current(errorMessage(error));
        },
      );
    },
    [rpc],
  );

  const pending = useMemo(() => pendingIds(entries), [entries]);

  return { entries, pending, edit };
}
