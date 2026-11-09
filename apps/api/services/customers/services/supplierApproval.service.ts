import { APIError } from "encore.dev/api";
import { auth } from "~encore/clients";
import { iso } from "../../../lib/db/serialize";
import { storedEmail } from "../../../lib/personPick";
import { canManageSales } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import type { SupplierApprovalItem, SupplierApprovalState } from "../interfaces/interfaces";
import { termsNote } from "../lib/registrationLink";
import { companyRegistrationRepository, type RegistrationAnswer } from "../repositories/companyRegistration.repository";
import { supplierApprovalRepository, type SupplierApprovalRow } from "../repositories/supplierApproval.repository";
import type { CompanyRegistrationRecord } from "../schemas/companyRegistration.schema";
import { contactService } from "./contact.service";
import { customerService } from "./customer.service";
import { noteService } from "./note.service";

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
  threadId: r.id,
  registered: false,
  alreadyInDatabase: false,
  matchedCompanyName: "",
  termsName: "",
  termsUrl: "",
  termsAcceptedAt: null,
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

// A registration of a company already in the Customer Database: it is answered on its own, the company stays as it is.
// `matchedCompanyName` is that company's own name: what was typed on the form may name another.
const duplicateItem = (r: CompanyRegistrationRecord, matchedCompanyName: string): SupplierApprovalItem => ({
  customerId: r.customerId ?? "",
  threadId: r.id,
  registered: true,
  alreadyInDatabase: true,
  matchedCompanyName,
  termsName: r.termsName,
  termsUrl: r.termsUrl,
  termsAcceptedAt: iso(r.termsAcceptedAt),
  companyName: r.companyName,
  ico: r.ico,
  dic: r.dic,
  registeredAddress: r.registeredAddress,
  city: r.city,
  country: r.country,
  dataSource: r.dataSource,
  roles: r.roles,
  status: r.status === "pending" ? "pending" : r.status === "declined" ? "declined" : "",
  contactName: `${r.contactFirstName} ${r.contactLastName}`.trim(),
  contactEmail: r.contactEmail,
  contactPhone: r.contactPhone,
  requestedBy: r.requestedBy,
  requestedByUserId: r.requestedByUserId,
  requestedAt: iso(r.createdAt),
  quoteNumber: "",
  decision: r.status === "pending" ? "" : r.status,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt ? iso(r.decidedAt) : null,
  comment: r.comment,
  answerSeen: r.answerSeenAt !== null,
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
    const [rows, registrations] = await Promise.all([supplierApprovalRepository.list(companyId, since), companyRegistrationRepository.forApprovals(companyId, since)]);
    const registrationOf = new Map(registrations.filter((r) => !r.alreadyInDatabase).map((r) => [r.customerId, r]));
    const items = rows.map((row) => {
      const registration = registrationOf.get(row.id);
      if (!registration) return toApprovalItem(row);
      return { ...toApprovalItem(row), registered: true, termsName: registration.termsName, termsUrl: registration.termsUrl, termsAcceptedAt: iso(registration.termsAcceptedAt) };
    });
    const duplicates = registrations.filter((r) => r.alreadyInDatabase);
    const matchedIds = [...new Set(duplicates.flatMap((r) => (r.customerId ? [r.customerId] : [])))];
    const matched = matchedIds.length ? await supplierApprovalRepository.states(companyId, matchedIds) : [];
    const nameOf = new Map(matched.map((m) => [m.id, m.companyName]));
    const duplicateItems = duplicates.map((r) => duplicateItem(r, nameOf.get(r.customerId ?? "") ?? ""));
    return [...items, ...duplicateItems].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
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
    const answer: RegistrationAnswer = { status: decision === "approve" ? "approved" : "declined", by, byUserId: actor.userID, comment: reason };
    const duplicate = await companyRegistrationRepository.duplicateById(actor.companyID, id);
    if (duplicate) return this.decideDuplicate(actor, duplicate, answer);
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
    const registration = await companyRegistrationRepository.ofCustomer(actor.companyID, id);
    if (registration) {
      await companyRegistrationRepository.answer(actor.companyID, registration.id, answer, new Date());
      if (decision === "approve") await noteService.create(actor.companyID, id, actor.userID, { content: termsNote(registration) });
    }
    return this.itemOf(actor.companyID, id);
  }

  /**
   * Approved, the existing company gets the roles the link was made for (added to its own), the record of the
   * terms and the contact person; declined, it stays as it was. Anything that fails sends the registration
   * back to waiting, to be answered again: the roles are added only once whatever happens, and the contact -
   * the one write a second answer must not repeat - is written last.
   */
  private async decideDuplicate(actor: Actor, duplicate: CompanyRegistrationRecord, answer: RegistrationAnswer): Promise<SupplierApprovalItem> {
    const answered = await companyRegistrationRepository.answer(actor.companyID, duplicate.id, answer, new Date());
    if (!answered) throw APIError.failedPrecondition("This registration no longer waits for approval: another manager answered it");
    if (answer.status === "approved") {
      const customerId = duplicate.customerId!;
      try {
        await customerService.addRoles(customerId, actor.companyID, actor.role, duplicate.roles, actor.userID);
        await noteService.create(actor.companyID, customerId, actor.userID, { content: termsNote(duplicate) });
        await contactService.create(actor.companyID, customerId, {
          firstName: duplicate.contactFirstName,
          lastName: duplicate.contactLastName,
          email: duplicate.contactEmail,
          phone: duplicate.contactPhone,
          role: duplicate.contactRole ?? undefined,
        });
      } catch (err) {
        await companyRegistrationRepository.reopen(actor.companyID, duplicate.id);
        throw err;
      }
    }
    return this.itemOf(actor.companyID, duplicate.id);
  }

  /**
   * A manager takes back a decline (one given by mistake): the company comes back with what was deleted
   * with it and waits for a manager again, so Approve or Decline answers it as before; its quote stays
   * held until then. Only a supplier declined here and still deleted; a second click is refused.
   */
  async undoDecline(actor: Actor, id: string): Promise<SupplierApprovalItem> {
    if (!canManageSales(actor.role)) throw APIError.permissionDenied("Only a manager can take back the decline of a new supplier");
    if (!isUuid(id)) throw APIError.invalidArgument("Not a company of the Customer Database");
    const duplicate = await companyRegistrationRepository.duplicateById(actor.companyID, id);
    if (duplicate) {
      if (duplicate.status !== "declined" || !(await companyRegistrationRepository.reopen(actor.companyID, duplicate.id))) throw APIError.failedPrecondition("This registration is no longer declined");
      return this.itemOf(actor.companyID, id);
    }
    await customerService.undoDecline(id, actor.companyID);
    const registration = await companyRegistrationRepository.ofCustomer(actor.companyID, id);
    if (registration) await companyRegistrationRepository.reopen(actor.companyID, registration.id);
    return this.itemOf(actor.companyID, id);
  }

  private async itemOf(companyId: string, id: string): Promise<SupplierApprovalItem> {
    const item = (await this.list(companyId)).find((i) => i.threadId === id);
    if (!item) throw APIError.internal("the answered supplier is not on the list");
    return item;
  }

  /** The user has opened these answers to their requests in the bell. */
  async seen(actor: Actor, ids: string[]): Promise<void> {
    const wanted = ids.filter(isUuid);
    await Promise.all([supplierApprovalRepository.markSeen(actor.companyID, actor.userID, wanted), companyRegistrationRepository.markSeen(actor.companyID, actor.userID, wanted)]);
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
