import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { followupTaskService } from "../services/followupTask.service";

interface FollowupTaskDeleteRequest {
  id: string;
}

interface FollowupTaskDeleteResponse {
  ok: boolean;
}

/**
 * Deletes one follow-up task: it is gone from the lists for everybody, its row is kept. Not found
 * for a task that is already deleted or belongs to another company.
 */
export const followupTaskDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/sales/followup-tasks/:id" },
  async (req: FollowupTaskDeleteRequest): Promise<FollowupTaskDeleteResponse> => {
    await followupTaskService.softDelete(req.id, getAuthData()!);
    return { ok: true };
  },
);
