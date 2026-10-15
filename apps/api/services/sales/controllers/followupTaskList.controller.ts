import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { followupTaskService } from "../services/followupTask.service";
import type { FollowupTaskItem } from "../interfaces/interfaces";

interface FollowupTaskListRequest {
  /**
   * Whose tasks: "me" (the signed-in user), "none" (tasks assigned to nobody), the id of a user,
   * or "all" - which is also what leaving it out means.
   */
  assignee?: string;
  /** open (the default), done, or all. */
  state?: "open" | "done" | "all";
  /** Rows per page: 50 when left out, at most 200. */
  limit?: number;
  /** How many rows of the sorted list to skip. */
  offset?: number;
  /**
   * For loading everything: the id of the last task already loaded - for the first page the nil
   * id 00000000-0000-0000-0000-000000000000. The rows are then those with a greater id, in the
   * order of their ids, and offset is ignored: no task is skipped or repeated when tasks are
   * created or deleted meanwhile. A page shorter than the limit is the last one.
   */
  afterId?: string;
}

interface FollowupTaskListResponse {
  pagination: {
    /** How many tasks match the filters in all - also with afterId. */
    total: number;
    offset: number;
    limit: number;
  };
  data: FollowupTaskItem[];
}

/**
 * The company's manual follow-up tasks, one page at a time, with the real number of matches.
 * Without afterId the open tasks come by due day - those without one last - and the done tasks
 * by when they were done, the latest first. A screen that needs all of them loads them with
 * afterId and sorts them itself.
 */
export const followupTaskList = api(
  { expose: true, auth: true, method: "GET", path: "/sales/followup-tasks" },
  async (req: FollowupTaskListRequest): Promise<FollowupTaskListResponse> => {
    return followupTaskService.list(getAuthData()!, req);
  },
);
