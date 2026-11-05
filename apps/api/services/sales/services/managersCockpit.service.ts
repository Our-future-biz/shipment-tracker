import { quotes } from "~encore/clients";
import { addDays, businessDay } from "../../../lib/businessDate";
import { companyUsers } from "../../../lib/companyUsers";
import type { SalesCockpitMode, SalesManagersCockpit } from "../interfaces/interfaces";
import { followupTaskRepository } from "../repositories/followupTask.repository";
import { TASK_OVERDUE_DAYS } from "../utils/cockpitThresholds";
import { buildSalesCockpit } from "../utils/managersCockpit.utils";

/** Open tasks the cockpit reads at most. */
const TASKS_LIMIT = 500;

// Sales → Managers: the quotes service's facts about its quotes and this service's open follow-up
// tasks, judged by the pure rules of utils/managersCockpit.utils. Like the pipeline, Sales asks
// the quotes service; the quotes service never asks Sales.
class ManagersCockpitService {
  async cockpit(companyId: string, mode: SalesCockpitMode): Promise<SalesManagersCockpit> {
    const now = new Date();
    const dueBy = addDays(businessDay(now), -TASK_OVERDUE_DAYS);
    const [facts, tasks, users] = await Promise.all([
      quotes._internalSalesManagersFacts(),
      // One more than shown, so "capped" means some were left out.
      followupTaskRepository.cockpitTasks(companyId, dueBy, TASKS_LIMIT + 1),
      companyUsers(),
    ]);
    const emails = new Map(users.map((u) => [u.id, u.email]));
    return buildSalesCockpit({
      quotes: facts.quotes,
      tasks: tasks.slice(0, TASKS_LIMIT).map((t) => ({
        id: t.id,
        type: t.type,
        note: t.note,
        dueDate: t.dueDate,
        assigneeUserId: t.assigneeUserId,
        assigneeName: (t.assigneeUserId && emails.get(t.assigneeUserId)) || "",
        customerLabel: t.customerLabel,
        quoteNumber: t.quoteNumber,
      })),
      capped: facts.capped || tasks.length > TASKS_LIMIT,
      mode,
      now,
      lines: facts,
    });
  }
}

export const managersCockpitService = new ManagersCockpitService();
