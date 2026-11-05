import { APIError } from "encore.dev/api";
import { auth } from "~encore/clients";
import { iso } from "../../../lib/db/serialize";
import { storedEmail } from "../../../lib/personPick";
import { canManageSales } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import type { SupplierApprovalItem, SupplierApprovalState } from "../interfaces/interfaces";
import { supplierApprovalRepository, type SupplierApprovalRow } from "../repositories/supplierApproval.repository";
import { customerService } from "./customer.service";

// A new supplier a user who is no manager adds from a quote's Pricing waits for a manager on Sales →
// Managers → Company approval. Approved it is a supplier like any other; declined it is deleted and the
// user is told why - a manager can take a decline back there, and it waits again. A quote linked to a
// supplier that waits or was declined is not sent (the quotes service asks here: states).

/** How long an answer stays on the list, and in the bell of the one who asked. */
export const ANSWERED_SHOWN_DAYS = 30;
/** A decline says why: the one who asked is told. */
export const MIN_DECLINE_REASON = 3;

export const toApprovalItem = (r: SupplierApprovalRow): SupplierApprovalItem => ({
  customerId: r.id,
  companyName: r.companyName,
  ico: r.ico,
  dic: r.dic,
  registeredAddress: r.registeredAddress,
  city: r.city,
  country: r.country,
  dataSource: r.dataSource,
  roles: r.roles,
  status: r.approvalStatus,
  contactName: r.contactName,
  contactEmail: r.contactEmail,
  contactPhone: r.contactPhone,
  requestedBy: r.approvalRequestedBy,
  requestedByUserId: r.approvalRequestedByUserId,
  requestedAt: r.approvalRequestedAt ? iso(r.approvalRequestedAt) : "",
  quoteNumber: r.approvalQuoteNumber,
  decision: r.approvalDecision,
  decidedBy: r.approvalDecidedBy,
  decidedAt: r.approvalDecidedAt ? iso(r.approvalDecidedAt) : null,
  comment: r.approvalComment,
  answerSeen: r.approvalAnswerSeenAt !== null,
});

interface Actor {
  companyID: string;
  userID: string;
  role: string;
}

class SupplierApprovalService {
  /** What waits, and what was answered in the last 30 days: the managers' list and everybody's bell. */
  async list(companyId: string, now = new Date()): Promise<SupplierApprovalItem[]> {
    const since = new Date(now.getTime() - ANSWERED_SHOWN_DAYS * 24 * 60 * 60 * 1000);
    return (await supplierApprovalRepository.list(companyId, since)).map(toApprovalItem);
  }

  /** A manager approves or declines a supplier that waits; a decline says why, and deletes the company. */
  async decide(actor: Actor, id: string, decision: "approve" | "decline", comment = ""): Promise<SupplierApprovalItem> {
    if (!canManageSales(actor.role)) throw APIError.permissionDenied("Only a manager can approve or decline a new supplier");
    if (!isUuid(id)) throw APIError.invalidArgument("Not a company of the Customer Database");
    const reason = comment.trim();
    if (decision === "decline" && reason.length < MIN_DECLINE_REASON) {
      throw APIError.invalidArgument("Say why the supplier is declined: the one who added it is told");
    }
    const { users } = await auth.userLookup({ ids: [actor.userID] });
    const by = storedEmail(users.find((u) => u.id === actor.userID)?.email ?? "");
    const row = await supplierApprovalRepository.decide(actor.companyID, id, {
      decision: decision === "approve" ? "approved" : "declined",
      by,
      byUserId: actor.userID,
      comment: reason,
    });
    if (!row) throw APIError.failedPrecondition("This supplier no longer waits for approval: another manager answered, or it was deleted");
    // Declined, it left the Customer Database with what was filed under it, in the answer's own
    // transaction; the copies elsewhere are told now.
    if (decision === "decline") await customerService.announceDeleted(actor.companyID, row);
    return this.itemOf(actor.companyID, id);
  }

  /**
   * A manager takes back a decline (one given by mistake): the company comes back with what was deleted
   * with it and waits for a manager again, so Approve or Decline answers it as before; its quote stays
   * held until then. Only a supplier declined here and still deleted; a second click is refused.
   */
  async undoDecline(actor: Actor, id: string): Promise<SupplierApprovalItem> {
    if (!canManageSales(actor.role)) throw APIError.permissionDenied("Only a manager can take back the decline of a new supplier");
    if (!isUuid(id)) throw APIError.invalidArgument("Not a company of the Customer Database");
    await customerService.undoDecline(id, actor.companyID);
    return this.itemOf(actor.companyID, id);
  }

  private async itemOf(companyId: string, id: string): Promise<SupplierApprovalItem> {
    const item = (await this.list(companyId)).find((i) => i.customerId === id);
    if (!item) throw APIError.internal("the answered supplier is not on the list");
    return item;
  }

  /** The user has opened these answers to their requests in the bell. */
  async seen(actor: Actor, ids: string[]): Promise<void> {
    await supplierApprovalRepository.markSeen(actor.companyID, actor.userID, ids.filter(isUuid));
  }

  /** Where the suppliers of `ids` stand: the quotes service sends no quote linked to one that waits or was declined. */
  async states(companyId: string, ids: string[]): Promise<SupplierApprovalState[]> {
    const wanted = [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))];
    const rows = await supplierApprovalRepository.states(companyId, wanted);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return wanted.map((id) => {
      const r = byId.get(id);
      if (!r) return { id, companyName: "", status: "missing", comment: "" };
      // A supplier deleted for another reason is not held: only a manager's decline is.
      const status = r.approvalStatus === "declined" ? "declined" : r.deletedAt ? "" : r.approvalStatus;
      return { id, companyName: r.companyName, status, comment: status === "declined" ? r.approvalComment : "" };
    });
  }
}

export const supplierApprovalService = new SupplierApprovalService();
