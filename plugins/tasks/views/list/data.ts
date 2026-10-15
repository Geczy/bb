import { experimental_useRpcKeyedQuery } from "@get-bb/plugin-sdk/app";
import { useTaskRows, type TasksQuery } from "../../shell/data.js";
import type {
  Label,
  TaskPriority,
  TaskStatus,
  TaskThread,
} from "../../shared/contract.js";
import { isActiveThread } from "../detail/meta.js";
interface ListTaskFilters {
  statuses: readonly TaskStatus[];
  priorities: readonly TaskPriority[];
  labelIds: readonly string[] | null;
}

export function listTasksQuery(
  projectId: string | null,
  activeOnly: boolean,
  filters: ListTaskFilters,
) {
  return {
    ...(projectId === null ? {} : { projectId }),
    ...(filters.statuses.length > 0 ? { statuses: [...filters.statuses] } : {}),
    ...(filters.priorities.length > 0
      ? { priorities: [...filters.priorities] }
      : {}),
    ...(filters.labelIds !== null ? { labelIds: [...filters.labelIds] } : {}),
    activeOnly,
    parentTaskId: null,
  };
}

export function useListTasks(
  projectId: string | null,
  activeOnly: boolean,
  filters: ListTaskFilters,
) {
  return useTaskRows(listTasksQuery(projectId, activeOnly, filters));
}
export function useLabels(projectIds: readonly string[]): TasksQuery<Label[]> {
  const query = experimental_useRpcKeyedQuery<Label[]>({
    method: "getLabelsKeyed",
    keys: projectIds,
  });
  return {
    data: query.isLoading ? undefined : Object.values(query.data ?? {}).flat(),
    error: query.error?.message ?? null,
    isLoading: query.isLoading,
    refresh: query.refetch,
  };
}
export interface TaskRowMeta {
  activeThreads: TaskThread[];
}
export function useTaskListMeta(projectId: string | null) {
  const tasks = useTaskRows({
    ...(projectId === null ? {} : { projectId }),
    activeOnly: true,
    parentTaskId: null,
  });
  const query = experimental_useRpcKeyedQuery<TaskThread[]>({
    method: "getTaskThreadsKeyed",
    keys: tasks.data?.map((task) => task.id) ?? [],
  });
  return {
    data:
      query.data === undefined
        ? undefined
        : new Map(
            Object.entries(query.data).map(([id, threads]) => [
              id,
              { activeThreads: threads.filter(isActiveThread) },
            ]),
          ),
    error: query.error?.message ?? tasks.error ?? null,
    isLoading: tasks.isLoading || query.isLoading,
    refresh: () => {
      tasks.refresh();
      void query.refetch();
    },
  };
}
