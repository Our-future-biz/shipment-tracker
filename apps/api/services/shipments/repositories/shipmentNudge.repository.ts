import { and, eq, isNull } from "drizzle-orm";
import { shipmentCommentTable } from "../schemas/shipmentComment.schema";
import { shipmentNoteTable, type ShipmentNoteRecord } from "../schemas/shipmentNote.schema";
import { shipmentAuditRepository } from "./shipmentAudit.repository";
import { shipmentRepository } from "./shipment.repository";

/** What a nudge writes: the to-do, the chat line that tags the job's people, and the line in the job's history. */
export interface NudgeWrite {
  companyId: string;
  shipmentId: string;
  authorId: string;
  text: string;
  dueDate: string;
  message: string;
  mentionedUserIds: string[];
  history: { field: string; newValue: string };
}

// A manager's nudge (lib/nudge) is three rows - a to-do, a chat line, a history line - that belong together:
// written in the shipment's write turn, all or none, so a failure leaves no to-do nobody was told about and a
// retry makes no second one.
class ShipmentNudgeRepository {
  /**
   * The new to-do; null when the job already has this very to-do open (the same title and due
   * date): a second click then writes nothing. The turn's lock keeps two clicks from both finding none.
   */
  async create(nudge: NudgeWrite): Promise<ShipmentNoteRecord | null> {
    const { companyId, shipmentId, authorId } = nudge;
    return shipmentRepository.writeTurn(shipmentId, companyId, async (tx) => {
      const [same] = await tx
        .select({ id: shipmentNoteTable.id })
        .from(shipmentNoteTable)
        .where(
          and(
            eq(shipmentNoteTable.companyId, companyId),
            eq(shipmentNoteTable.shipmentId, shipmentId),
            eq(shipmentNoteTable.text, nudge.text),
            eq(shipmentNoteTable.dueDate, nudge.dueDate),
            isNull(shipmentNoteTable.doneAt),
            isNull(shipmentNoteTable.deletedAt),
          ),
        )
        .limit(1);
      if (same) return null;
      const [note] = await tx.insert(shipmentNoteTable).values({ companyId, shipmentId, text: nudge.text, dueDate: nudge.dueDate, authorId }).returning();
      await tx.insert(shipmentCommentTable).values({ companyId, shipmentId, authorId, message: nudge.message, mentionedUserIds: nudge.mentionedUserIds });
      await shipmentAuditRepository.create({ companyId, shipmentId, userId: authorId, field: nudge.history.field, oldValue: null, newValue: nudge.history.newValue }, tx);
      return note!;
    });
  }
}

export const shipmentNudgeRepository = new ShipmentNudgeRepository();
