import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { followupTaskService } from "../services/followupTask.service";
import type { FollowupTaskItem } from "../interfaces/interfaces";

interface FollowupTaskCreateRequest {
  type: "Call" | "Email" | "Visit";
  note?: string;
  /** YYYY-MM-DD; null or left out = no due day. */
  dueDate?: string | null;
  /** A user of the company. Left out = the signed-in user; null = nobody. */
  assigneeUserId?: string | null;
  /** The customer the task is about, when it is one from the Customer Database. */
  customerId?: string | null;
  /** The company as typed, or the name of that customer. */
  customerLabel?: string;
  contact?: string;
  /** The reference of the sales quote the task is about. */
  quoteNumber?: string | null;
}

interface FollowupTaskCreateResponse {
  task: FollowupTaskItem;
}

/**
 * Adds one follow-up task. Refused (invalid argument) for a due date that is not a real day, an
 * assignee who is not a user of the company, a customer id that is no id, or a quote that does
 * not exist.
 */
export const followupTaskCreate = api(
  { expose: true, auth: true, method: "POST", path: "/sales/followup-tasks" },
  async (req: FollowupTaskCreateRequest): Promise<FollowupTaskCreateResponse> => {
    const task = await followupTaskService.create(getAuthData()!, req);
    return { task };
  },
);
