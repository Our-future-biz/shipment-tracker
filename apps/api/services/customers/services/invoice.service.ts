import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { invoicing } from "~encore/clients";
import { customerInvoiceRepository, type TypedInvoicePatch } from "../repositories/customerInvoice.repository";
import type { CustomerInvoiceRecord, NewCustomerInvoiceRecord } from "../schemas/customerInvoice.schema";
import type { CustomerInvoiceStatusItem, InvoiceItem, InvoiceStatus } from "../interfaces/interfaces";
import { dateInput, isoDateOrNull } from "../lib/dates";
import { toInvoiceItem } from "../lib/mappers";
import { INVOICING_STATUSES, POSTED_INVOICE_REFUSAL, type InvoicingStatus } from "../lib/receivable";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import { customerService } from "./customer.service";

export interface InvoiceInput {
  invoiceNumber: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  status?: InvoiceStatus;
  issuedAt?: string;
}

/** Accounts Receivable's word on an issued invoice (the receivable_state follow-up of the invoicing service). */
export interface ReceivableWordInput {
  customerId: string;
  invoiceId: string;
  invoiceNumber: string;
  leftToPay: number;
  lastPaidOn: string | null;
  settled: boolean;
  /** The invoice's own status in Invoicing (absent: issued). */
  invoiceStatus?: InvoicingStatus;
  creditNoteNumbers: string[];
}

/** Only managers add, change or delete an invoice typed into the customer's list (D9): invoices are issued in Invoicing. */
const TYPED_ONLY_MANAGERS = "Only a manager may add, change or delete an invoice in the customer's list: invoices are issued in Invoicing";

class InvoiceService {
  async listByCustomer(customerId: string, companyId: string): Promise<InvoiceItem[]> {
    return (await customerInvoiceRepository.findByCustomer(customerId, companyId)).map(toInvoiceItem);
  }

  /** A manager types an invoice into the customer's list: never one whose number Invoicing issued (D9, as an edit). */
  async create(actor: Actor, customerId: string, input: InvoiceInput): Promise<InvoiceItem> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied(TYPED_ONLY_MANAGERS);
    const customer = await customerService.requireLive(customerId, actor.companyID);
    await this.refuseIssued([input.invoiceNumber], input.invoiceNumber, "added");
    const values: Omit<NewCustomerInvoiceRecord, "companyId"> = {
      customerId,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount ?? 0,
      // An invoice entered by hand is in the customer's currency (the one its credit limit is
      // in); Invoicing always sends the currency of the issued invoice.
      currency: (input.currency || customer.currency || "CZK").toUpperCase(),
      dueDate: dateInput(input.dueDate, "dueDate") ?? null,
      status: input.status ?? "Open",
      issuedAt: dateInput(input.issuedAt, "issuedAt") ?? null,
      source: "typed",
    };
    const row = await customerInvoiceRepository.createForCompany(actor.companyID, values);
    return toInvoiceItem(row);
  }

  /**
   * An invoice Invoicing issued, in the customer's list (the outbox after issuing): added once, and
   * only brought up to date when it is sent again. Posted by Invoicing from then on, with the
   * document's id when the delivery names it.
   */
  async postIssued(companyId: string, customerId: string, input: InvoiceInput & { invoiceId?: string }): Promise<InvoiceItem> {
    if (input.invoiceId !== undefined && !isUuid(input.invoiceId)) throw APIError.invalidArgument("invoiceId must be the id of the issued document");
    await customerService.requireLive(customerId, companyId);
    const row = await customerInvoiceRepository.upsertIssued(companyId, {
      customerId,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount ?? 0,
      currency: (input.currency || "CZK").toUpperCase(),
      dueDate: dateInput(input.dueDate, "dueDate") ?? null,
      status: input.status ?? "Open",
      issuedAt: dateInput(input.issuedAt, "issuedAt") ?? null,
      ...(input.invoiceId ? { invoiceId: input.invoiceId.toLowerCase() } : {}),
    });
    return toInvoiceItem(row);
  }

  async update(id: string, actor: Actor, input: Partial<InvoiceInput>): Promise<InvoiceItem> {
    const patch: TypedInvoicePatch = {};
    if (input.invoiceNumber !== undefined) patch.invoiceNumber = input.invoiceNumber;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.status !== undefined) patch.status = input.status;
    const dueDate = dateInput(input.dueDate, "dueDate");
    if (dueDate !== undefined) patch.dueDate = dueDate;
    const issuedAt = dateInput(input.issuedAt, "issuedAt");
    if (issuedAt !== undefined) patch.issuedAt = issuedAt;
    const entry = await this.requireChangeable(id, actor, "changed", patch.invoiceNumber);
    const row = await customerInvoiceRepository.updateTyped(entry.id, actor.companyID, patch);
    if (!row) throw await this.goneOrPosted(id, actor.companyID);
    return toInvoiceItem(row);
  }

  /**
   * An invoice reversed by a credit note: the invoice and the credit note both stop counting
   * as owed (aging / credit) — they cancel each other out.
   */
  async markCredited(companyId: string, invoiceNumbers: string[], status: "Credited" | "Cancelled" = "Credited"): Promise<number> {
    return customerInvoiceRepository.setStatusByNumbers(companyId, invoiceNumbers, status);
  }

  async softDelete(id: string, actor: Actor): Promise<void> {
    const entry = await this.requireChangeable(id, actor, "deleted");
    if (!(await customerInvoiceRepository.softDeleteTyped(entry.id, actor.companyID))) throw await this.goneOrPosted(id, actor.companyID);
  }

  /**
   * Accounts Receivable's word on an issued invoice, on its entry and on those of its partial credit notes
   * (repositories/customerInvoice applyReceivable). Safe to send again. False when the invoice has no live entry.
   */
  async applyReceivable(companyId: string, input: ReceivableWordInput): Promise<boolean> {
    if (!isUuid(input.invoiceId) || !isUuid(input.customerId)) throw APIError.invalidArgument("invoiceId and customerId must be ids");
    if (!Number.isFinite(input.leftToPay)) throw APIError.invalidArgument("leftToPay must be a number");
    const lastPaidOn = input.lastPaidOn === null ? null : isoDateOrNull(input.lastPaidOn);
    if (input.lastPaidOn !== null && !lastPaidOn) throw APIError.invalidArgument("lastPaidOn must be a date (yyyy-mm-dd) or null");
    if (input.invoiceStatus !== undefined && !INVOICING_STATUSES.includes(input.invoiceStatus)) throw APIError.invalidArgument("invoiceStatus must be issued, credited or cancelled");
    return customerInvoiceRepository.applyReceivable(companyId, {
      ...input,
      invoiceStatus: input.invoiceStatus ?? "issued",
      invoiceId: input.invoiceId.toLowerCase(),
      customerId: input.customerId.toLowerCase(),
      lastPaidOn,
      creditNoteNumbers: [...new Set(input.creditNoteNumbers.filter((n) => n.trim() !== ""))],
    });
  }

  /**
   * How the customer's list has these issued documents (null when it has no live entry of one), each entry found
   * marked as posted by Invoicing with the document's id - unless `readOnly` (m4: the bell's poll), which marks nothing.
   */
  async statusesOfIssued(
    companyId: string,
    items: { invoiceId: string; number: string; customerId: string }[],
    opts: { readOnly?: boolean } = {},
  ): Promise<CustomerInvoiceStatusItem[]> {
    // Anything but an id matches nothing, as an unknown id does: Postgres would refuse it in a uuid column.
    const refs = items
      .filter((i) => isUuid(i.invoiceId) && isUuid(i.customerId))
      .map((i) => ({ invoiceId: i.invoiceId.toLowerCase(), customerId: i.customerId.toLowerCase(), number: i.number }));
    const found = await customerInvoiceRepository.entriesOfIssued(companyId, refs, { readOnly: opts.readOnly === true });
    return items.map((i) => {
      const row = isUuid(i.invoiceId) ? found.get(i.invoiceId.toLowerCase()) : undefined;
      return { invoiceId: i.invoiceId, status: row?.status ?? null, paidOn: row?.paidOn ? String(row.paidOn).slice(0, 10) : null };
    });
  }

  /**
   * The live entry, if this user may change or delete it (D9): never one Invoicing posted - marked so, or its number
   * (or the new one) issued there - and a typed one only by a manager. When Invoicing can't be asked, nothing is
   * changed on a guess.
   */
  private async requireChangeable(id: string, actor: Actor, what: "changed" | "deleted", newNumber?: string): Promise<CustomerInvoiceRecord> {
    const entry = isUuid(id) ? await customerInvoiceRepository.getByIdForCompany(id, actor.companyID) : null;
    if (!entry) throw APIError.notFound("Invoice not found");
    if (entry.source === "invoicing") throw APIError.failedPrecondition(POSTED_INVOICE_REFUSAL);
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied(TYPED_ONLY_MANAGERS);
    await this.refuseIssued([entry.invoiceNumber, newNumber], entry.invoiceNumber, what);
    return entry;
  }

  /**
   * Refused (D9) when one of these numbers is an invoice or credit note issued in Invoicing: such an entry is posted by
   * Invoicing, never typed or changed here. When Invoicing can't be asked, nothing is done on a guess.
   */
  private async refuseIssued(candidates: (string | undefined)[], label: string, what: "added" | "changed" | "deleted"): Promise<void> {
    const numbers = [...new Set(candidates.filter((n): n is string => !!n && n.trim() !== ""))];
    if (!numbers.length) return;
    let issued: string[];
    try {
      issued = (await invoicing._internalIssuedInvoiceNumbers({ numbers })).numbers;
    } catch (err) {
      log.warn(err, `whether a customer's invoice was issued in Invoicing could not be checked; it is not ${what}`, { invoiceNumber: label });
      throw APIError.unavailable(`Could not check whether invoice ${label} was issued in Invoicing, so it was not ${what}: try again in a moment`);
    }
    if (issued.length > 0) throw APIError.failedPrecondition(POSTED_INVOICE_REFUSAL);
  }

  /** Why a conditional write of a typed entry found nothing: Invoicing posted it meanwhile, or it is gone. */
  private async goneOrPosted(id: string, companyId: string): Promise<APIError> {
    const entry = await customerInvoiceRepository.getByIdForCompany(id, companyId);
    return entry ? APIError.failedPrecondition(POSTED_INVOICE_REFUSAL) : APIError.notFound("Invoice not found");
  }
}

export const invoiceService = new InvoiceService();
