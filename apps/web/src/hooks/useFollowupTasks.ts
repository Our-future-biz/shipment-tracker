"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { fetchAllPages } from "@/lib/fetchAllPages";

export type FollowupTask = interfaces.FollowupTaskItem;

/** Whose tasks a list holds: those of whoever is signed in, everybody's, or the ones assigned to nobody. */
export type TaskAssignee = "me" | "all" | "none";

// Which tasks a screen shows. The page and its size count for the done tasks only.
interface FollowupTaskView {
  assignee: TaskAssignee;
  state: "open" | "done";
  page: number;
  pageSize: number;
}

// One shared empty list, so screens memoising on `tasks` do not recompute while loading.
const NO_TASKS: FollowupTask[] = [];

// The order open tasks are worked through: the one due soonest first, those without a due day
// after the dated ones, then the order they were created in - for the tasks carried over from the
// old shared list, which were all created in one moment, the order of that list. The same order
// the server pages by (IN_ORDER in the API's followupTask.repository.ts). Days and moments are
// ISO texts of one form, which compare as what they name.
function inWorkOrder(a: FollowupTask, b: FollowupTask): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.legacyIndex !== b.legacyIndex) {
    if (a.legacyIndex === null) return 1;
    if (b.legacyIndex === null) return -1;
    return a.legacyIndex - b.legacyIndex;
  }
  return a.id < b.id ? -1 : 1;
}

// The company's manual follow-up tasks. Each task is a row of its own on the server, so a change
// is one request about one task: two people working on two tasks never touch each other's.
//
// The open tasks are loaded completely - page after page by key, so none is skipped or repeated -
// and sorted here: the screen says how many there are and shows all of them. The done ones only
// pile up, so they come one page at a time, as the server orders them (the one done last first),
// with the number there are in all.
export const useFollowupTasks = ({ assignee, state, page, pageSize }: FollowupTaskView) => {
  const queryClient = useQueryClient();

  const open = useQuery({
    queryKey: ["followup-tasks", "open", assignee],
    queryFn: async () => {
      const tasks = await fetchAllPages((afterId, limit) => api.sales.followupTaskList({ state: "open", assignee, afterId, limit }));
      return tasks.sort(inWorkOrder);
    },
    // Colleagues work on the same tasks, and a task turns overdue by the calendar: the list is
    // read again when the viewer comes back to it, and never on a timer.
    refetchOnWindowFocus: true,
    enabled: state === "open",
  });

  const done = useQuery({
    queryKey: ["followup-tasks", "done", assignee, page, pageSize],
    queryFn: () => api.sales.followupTaskList({ state: "done", assignee, limit: pageSize, offset: (page - 1) * pageSize }),
    // The rows of the page before stay on screen until the new ones are there - of the same list:
    // somebody else's tasks, and how many of them there are, are not shown under another choice.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === assignee ? prev : undefined),
    refetchOnWindowFocus: true,
    enabled: state === "done",
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["followup-tasks"] });

  const createMutation = useMutation({
    mutationFn: (fields: controllers.FollowupTaskCreateRequest) => api.sales.followupTaskCreate(fields),
    onSuccess: invalidate,
  });

  // The lists are read again after a refusal too: it says that the task is no longer what the
  // screen shows - a colleague deleted it meanwhile.
  const updateMutation = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: controllers.FollowupTaskUpdateRequest }) => api.sales.followupTaskUpdate(id, changes),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.sales.followupTaskDelete(id),
    onSettled: invalidate,
  });

  const query = state === "open" ? open : done;

  return {
    tasks: (state === "open" ? open.data : done.data?.data) ?? NO_TASKS,
    // How many tasks the view holds in all. Undefined until the server has answered about this
    // list: a request that failed or is still out found no "0 tasks".
    total: state === "open" ? open.data?.length : done.data?.pagination.total,
    // The tasks asked for are not on screen yet - nothing is, or the page before. Their request is
    // on its way or, while the browser is offline, waits for the connection.
    isLoading: query.isPending || query.isPlaceholderData,
    // The last request failed. Tasks read earlier may still be shown, and may be out of date.
    isError: query.isError && !query.isFetching,
    reload: query.refetch,
    createTask: createMutation.mutateAsync,
    updateTask: updateMutation.mutateAsync,
    deleteTask: deleteMutation.mutateAsync,
  };
};
