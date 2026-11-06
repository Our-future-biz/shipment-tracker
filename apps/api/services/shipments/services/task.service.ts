import { APIError } from "encore.dev/api";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";
import type { ShipmentTaskRecord } from "../schemas/shipmentTask.schema";
import { isoOrNull } from "../../../lib/db/serialize";
import type { TaskItem } from "../interfaces/interfaces";
import { isDetailsManager } from "../lib/shipmentEditRule";
import { plainTickRefusal } from "../lib/trackingEvents";
import { shipmentService } from "./shipment.service";

const toItem = (r: ShipmentTaskRecord): TaskItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  taskKey: r.taskKey,
  completed: r.completed,
  completedAt: isoOrNull(r.completedAt),
  completedById: r.completedById,
});

class TaskService {
  async list(shipmentId: string, companyId: string): Promise<TaskItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    return (await shipmentTaskRepository.listByShipmentId(shipmentId, companyId)).map(toItem);
  }

  // A plain tick, for what is no dated fact, no notice and no tick the app writes itself: those
  // come with their event (record()), the notice (Tell the customer) or the write that makes them true.
  async upsert(shipmentId: string, companyId: string, taskKey: string, completed: boolean, completedById: string): Promise<TaskItem> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound("Shipment not found");
    const refusal = plainTickRefusal(taskKey, shipment);
    if (refusal) throw APIError.failedPrecondition(refusal);
    return toItem(await shipmentTaskRepository.upsert(shipmentId, companyId, taskKey, completed, completedById));
  }

  /** A manager takes a wrong tick back, with a reason kept in the audit log (Council Outlay 8, D8). */
  async reopen(shipmentId: string, companyId: string, taskKey: string, reason: string, actor: { userID: string; role: string }): Promise<TaskItem> {
    if (!isDetailsManager(actor.role)) throw APIError.permissionDenied("Only a manager can take a tick back");
    const why = reason.trim();
    if (!why) throw APIError.invalidArgument("Say why the tick is taken back");
    await shipmentService.requireLive(shipmentId, companyId);
    const row = await shipmentTaskRepository.reopen(shipmentId, companyId, taskKey);
    if (!row) throw APIError.failedPrecondition("That task isn't ticked");
    await shipmentAuditRepository.create({ companyId, shipmentId, userId: actor.userID, field: `task:${taskKey}`, oldValue: "ticked", newValue: `taken back: ${why}` });
    return toItem(row);
  }
}

export const taskService = new TaskService();
