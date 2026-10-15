import { useMemo } from "react";
import type { Label, TaskSummary, TaskThread } from "../../shared/contract.js";
import { useTaskRows, useTaskRead } from "../../shell/data.js";
import { experimental_useRpcKeyedQuery } from "@get-bb/plugin-sdk/app";
import type { Attachment } from "../../shared/contract.js";
import { isActiveThread } from "../detail/meta.js";

export interface BoardCardMeta {
  workingThreads: TaskThread[];
  attachmentCount: number;
  subDone: number;
  subTotal: number;
}

export interface BoardData {
  tasks: TaskSummary[];
  subtasks: TaskSummary[];
  labelsById: Map<string, Label>;
  metaByTaskId: Map<string, BoardCardMeta>;
}

export const EMPTY_META: BoardCardMeta = {
  workingThreads: [],
  attachmentCount: 0,
  subDone: 0,
  subTotal: 0,
};

export function useBoardData(projectId: string) {
  const rows = useTaskRows({ projectId });
  const labels = useTaskRead(
    "listLabels",
    { projectId },
    (value) => value.labels,
  );
  const keys =
    rows.data
      ?.filter((task) => task.parentTaskId === null)
      .map((task) => task.id) ?? [];
  const threads = experimental_useRpcKeyedQuery<TaskThread[]>({
    method: "getTaskThreadsKeyed",
    keys,
  });
  const attachments = experimental_useRpcKeyedQuery<Attachment[]>({
    method: "getTaskAttachmentsKeyed",
    keys,
  });
  const labelsById = useMemo(
    () => new Map(labels.data?.map((label) => [label.id, label]) ?? []),
    [labels.data],
  );
  const data = useMemo<BoardData | undefined>(() => {
    const tasks = rows.data?.filter((task) => task.parentTaskId === null);
    const subtasks =
      rows.data?.filter((task) => task.parentTaskId !== null) ?? [];
    const subProgress = new Map<string, { done: number; total: number }>();
    for (const task of subtasks) {
      if (task.parentTaskId === null) continue;
      const entry = subProgress.get(task.parentTaskId) ?? { done: 0, total: 0 };
      entry.total++;
      if (task.status === "done") entry.done++;
      subProgress.set(task.parentTaskId, entry);
    }
    return tasks === undefined
      ? undefined
      : {
          tasks,
          subtasks,
          labelsById,
          metaByTaskId: new Map(
            tasks.map((task) => {
              const workingThreads =
                threads.data?.[task.id]?.filter(isActiveThread) ?? [];
              const attachmentCount = attachments.data?.[task.id]?.length ?? 0;
              const progress = subProgress.get(task.id);
              return [
                task.id,
                workingThreads.length === 0 && attachmentCount === 0 && !progress
                  ? EMPTY_META
                  : {
                      workingThreads,
                      attachmentCount,
                      subDone: progress?.done ?? 0,
                      subTotal: progress?.total ?? 0,
                    },
              ];
            }),
          ),
        };
  }, [rows.data, labelsById, threads.data, attachments.data]);
  return {
    data,
    error: rows.error ?? labels.error,
    isLoading: rows.isLoading,
    refresh: rows.refresh,
  };
}
