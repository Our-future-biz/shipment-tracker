import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { followupTaskService } from "../services/followupTask.service";
import type { FollowupTaskItem } from "../interfaces/interfaces";

interface FollowupTaskUpdateRequest {
  id: string;
  type?: "Call" | "Email" | "Visit";
  note?: string;
  /** YYYY-MM-DD; null = no due day. */
  dueDate?: string | null;
  /** A user of the company; null = nobody. */
  assigneeUserId?: string | null;
  /** The customer of the Customer Database the task links to; null = none. One value with customerLabel: sent together or not at all. */
  customerId?: string | null;
  /** The company as typed, or the name of that customer. */
  customerLabel?: string;
  contact?: string;
  quoteNumber?: string | null;
  /** true ticks the task off - who did it and when is recorded; false opens it again. */
  done?: boolean;
}

interface FollowupTaskUpdateResponse {
  task: FollowupTaskItem;
}

/**
 * Changes one follow-up task: only the fields that are sent, and only this task - two people
 * changing two tasks at the same moment do not touch each other's. Refused for the same reasons
 * as a new task, and for a customer link sent without its name or the other way round; not found
 * for a task that is deleted or belongs to another company.
 */
export const followupTaskUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/sales/followup-tasks/:id" },
  async (req: FollowupTaskUpdateRequest): Promise<FollowupTaskUpdateResponse> => {
    const { id, ...changes } = req;
    const task = await followupTaskService.update(id, getAuthData()!, changes);
    return { task };
  },
);
