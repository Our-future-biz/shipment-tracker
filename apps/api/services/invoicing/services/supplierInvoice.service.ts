import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, shipments, trucking } from "~encore/clients";
import { addDays, businessDay, isRealYmd } from "../../../lib/businessDate";
import { companyUsersWithRoles, userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import { toDecimal } from "../lib/amounts";
import { INVOICED } from "../lib/shipmentStatus";
import { CANCELLED_STATUS, seesTruckingConcept } from "../lib/supplierCosts";
import {
  approvalProblem,
  claimsOf,
  daysOverdue,
  dueDayOf,
  holdsPayment,
  lineAmount,
  marksOf,
  invoiceNumberKey,
  paymentProblem,
  sumByCurrency,
  supplierKeyOf,
  type SupplierFactsLike,
} from "../lib/supplierInvoices";
import { supplierInvoiceRepository as repo, type SyncScope } from "../repositories/supplierInvoice.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import type { InvoiceCostRecord } from "../schemas/invoiceCost.schema";
import type { MasterJobCostRecord } from "../schemas/masterJobCost.schema";
import type { SupplierInvoiceRecord, SupplierInvoiceSource } from "../schemas/supplierInvoice.schema";
import type {
  PayableClaimItem,
  PayableDetailResponse,
  PayableDocumentFile,
  PayableExpectedItem,
  PayableHaulierItem,
  PayableInvoiceItem,
  PayableLineItem,
  PayableNoticeItem,
  PayablesForMeResponse,
  PayablesResponse,
} from "../interfaces/interfaces";

// Finance → Accounts Payable (Council Outlay 9, D1–D20 as the chair recommended, 17 Nov 2026). One row per
// supplier invoice (schemas/supplierInvoice): booked when its first line is, approved or refused by a manager,
// paid as a note of what the accounting system paid. Everyone reads it; managers act (D5). The job's lines stay
// the truth for cost and profit; the record holds what belongs to the invoice as a whole.

const LIST_LIMIT = 2000;
const EXPECTED_LIMIT = 1000;
const PER_CALL = 500;
const CLAIM_IDS_PER_CALL = 2000;
const BELL_DAYS = 7;
const MIN_REASON = 3;
const DAY = 86_400_000;

const notThere = () => APIError.notFound("This supplier invoice is not there");
const changedMeanwhile = () => APIError.aborted("This invoice changed meanwhile: open it again to see how it is now");
const managersOnly = () => APIError.permissionDenied("Only a manager approves, refuses and marks supplier invoices paid");

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
const sameEmail = (a: string, b: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

interface JobFacts {
  jobNumber: string;
  customer: string;
  status: string;
  invoicingStatus: string;
  personInCharge: string;
  holidayCover: string;
  createdOn?: string;
}

type SupplierFacts = SupplierFactsLike & { id: string; companyName: string };

/** What the rows need from the other services, read for a set of invoices and estimates at once. */
interface Context {
  jobs: Map<string, JobFacts>;
  masters: Map<string, { mczNumber: string; personInCharge: string }>;
  facts: Map<string, SupplierFacts>;
  claims: PayableClaimFact[];
  /** Whether the supplier facts could be read (an approval needs them) */
  factsRead: boolean;
  /** The day each job was first invoiced to the customer (an invoice that stands) */
  billedOn: Map<string, string>;
}

type PayableClaimFact = Awaited<ReturnType<typeof shipments._internalCostClaims>>["claims"][number];

async function jobsOf(ids: string[]): Promise<Map<string, JobFacts>> {
  if (!ids.length) return new Map();
  const answers = await Promise.all(chunks(ids, PER_CALL).map((batch) => shipments._internalShipmentBasics({ ids: batch })));
  return new Map(answers.flatMap((a) => a.shipments.map((j) => [j.id, j] as const)));
}

async function mastersOf(ids: string[]): Promise<Context["masters"]> {
  if (!ids.length) return new Map();
  const answers = await Promise.all(chunks(ids, PER_CALL).map((batch) => shipments._internalMasterJobBasics({ ids: batch })));
  return new Map(answers.flatMap((a) => a.masterJobs.map((j) => [j.id, j] as const)));
}

async function factsOf(ids: string[]): Promise<Map<string, SupplierFacts>> {
  if (!ids.length) return new Map();
  const answers = await Promise.all(chunks(ids, PER_CALL).map((batch) => customers._internalSupplierFacts({ ids: batch })));
  return new Map(answers.flatMap((a) => a.suppliers.map((f) => [f.id, f as SupplierFacts] as const)));
}

async function claimsFor(companyId: string, shipmentIds: string[], invoiceIds: string[]): Promise<PayableClaimFact[]> {
  if (!shipmentIds.length && !invoiceIds.length) return [];
  const calls = [
    ...chunks(shipmentIds, CLAIM_IDS_PER_CALL).map((ids) => shipments._internalCostClaims({ shipmentIds: ids })),
    ...chunks(invoiceIds, CLAIM_IDS_PER_CALL).map((ids) => shipments._internalCostClaims({ supplierInvoiceIds: ids })),
  ];
  const seen = new Map<string, PayableClaimFact>();
  for (const answer of await Promise.all(calls)) for (const c of answer.claims) seen.set(c.id, c);
  const claims = [...seen.values()];
  // A claim tied to an invoice record that is gone (merged into the supplier's own when the supplier was linked)
  // disputes the invoice by its number on the job, as one typed before it could be tied: it still holds the payment.
  const tied = [...new Set(claims.map((c) => c.supplierInvoiceId).filter((id): id is string => !!id))];
  const live = tied.length ? await repo.liveIds(companyId, tied) : new Set<string>();
  return claims.map((c) => (c.supplierInvoiceId && !live.has(c.supplierInvoiceId) ? { ...c, supplierInvoiceId: null } : c));
}

const supplierIdOf = (h: Pick<SupplierInvoiceRecord, "supplierCustomerId" | "haulierId">) => h.supplierCustomerId ?? h.haulierId;

/**
 * The earliest day the invoice may be noted paid: the day it was received. Never stamped (gathered from older lines,
 * a master job's), it was paid before Accounts Payable existed, so any past day may be noted (null).
 */
const paidNotBefore = (h: Pick<SupplierInvoiceRecord, "receivedAt">) => (h.receivedAt ? businessDay(h.receivedAt) : null);

const costLineItem = (l: InvoiceCostRecord, jobs: Map<string, JobFacts>): PayableLineItem => {
  const job = jobs.get(l.shipmentId);
  const estimate = l.estAmount !== null ? lineAmount(l.estAmount, l.estQty) : null;
  const amount = l.realAmount !== null ? lineAmount(l.realAmount, l.realQty) : null;
  return {
    lineId: l.id,
    kind: "job",
    shipmentId: l.shipmentId,
    masterJobId: null,
    jobNumber: job?.jobNumber ?? "",
    customer: job?.customer ?? "",
    category: l.category,
    description: l.description,
    estimate,
    estCurrency: l.estCurrency,
    amount,
    currency: l.realCurrency,
    difference: estimate !== null && amount !== null && l.estCurrency === l.realCurrency ? Math.round((amount - estimate) * 100) / 100 : null,
    jobInvoicingStatus: job?.invoicingStatus ?? "",
  };
};

const masterLineItem = (l: MasterJobCostRecord, masters: Context["masters"]): PayableLineItem => {
  const estimate = l.estAmount !== null ? lineAmount(l.estAmount, l.estQty) : null;
  const amount = l.realAmount !== null ? lineAmount(l.realAmount, l.realQty) : null;
  return {
    lineId: l.id,
    kind: "master_job",
    shipmentId: null,
    masterJobId: l.masterJobId,
    jobNumber: masters.get(l.masterJobId)?.mczNumber ?? "",
    customer: "",
    category: l.category,
    description: l.description,
    estimate,
    estCurrency: l.estCurrency,
    amount,
    currency: l.realCurrency,
    difference: estimate !== null && amount !== null && l.estCurrency === l.realCurrency ? Math.round((amount - estimate) * 100) / 100 : null,
    jobInvoicingStatus: "",
  };
};

const claimItem = (c: PayableClaimFact, invoiceId: string): PayableClaimItem => ({
  id: c.id,
  shipmentId: c.shipmentId,
  status: c.status,
  reason: c.reason,
  claimAmount: c.claimAmount,
  claimCurrency: c.claimCurrency,
  amountText: c.amount,
  linked: c.supplierInvoiceId === invoiceId,
});

const isOpen = (h: Pick<PayableInvoiceItem, "status" | "paidOn">) => h.status !== "refused" && !h.paidOn;

// What a line bills: a change of any of these is a change of the invoice.
const BILLING_FIELDS = ["realAmount", "realQty", "realCurrency", "invoiceNumber", "vendor", "supplierCustomerId", "haulierId"];
const NUMERIC_FIELDS = new Set(["realAmount", "realQty"]);
/** Whether a field keeps its value: amounts as numbers ("1000" is "1000.00"), the rest as text, null as "". */
function sameValue(field: string, a: unknown, b: unknown): boolean {
  const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  if (NUMERIC_FIELDS.has(field)) return Number(a) === Number(b);
  return String(a) === String(b);
}

class SupplierInvoiceService {
  canDecide = (actor: Actor) => canDecideQuoteInquiry(actor.role);

  private requireManager(actor: Actor) {
    if (!this.canDecide(actor)) throw managersOnly();
  }

  /** Reads what the rows of these invoices (and estimates) need from the other services, at once. */
  private async context(
    companyId: string,
    costLines: InvoiceCostRecord[],
    masterLines: MasterJobCostRecord[],
    headers: SupplierInvoiceRecord[],
    extraShipmentIds: string[] = [],
  ): Promise<Context> {
    const shipmentIds = [...new Set([...costLines.map((l) => l.shipmentId), ...extraShipmentIds])];
    const masterIds = [...new Set(masterLines.map((l) => l.masterJobId))];
    const supplierIds = [...new Set(headers.map(supplierIdOf).filter((id): id is string => !!id))];
    const claimShipments = [...new Set(costLines.map((l) => l.shipmentId))];
    const [jobs, masters, factsAnswer, claims, billedOn] = await Promise.all([
      jobsOf(shipmentIds),
      mastersOf(masterIds),
      factsOf(supplierIds).then(
        (facts) => ({ facts, read: true }),
        (err) => {
          log.warn(err, "supplier facts could not be read for Accounts Payable");
          return { facts: new Map<string, SupplierFacts>(), read: false };
        },
      ),
      claimsFor(companyId, claimShipments, headers.map((h) => h.id)).catch((err) => {
        log.warn(err, "cost claims could not be read for Accounts Payable");
        return [] as PayableClaimFact[];
      }),
      invoiceRepository.firstBilledOn(costLines[0]?.companyId ?? headers[0]?.companyId ?? "", claimShipments),
    ]);
    return { jobs, masters, facts: factsAnswer.facts, factsRead: factsAnswer.read, claims, billedOn };
  }

  /** The rows of these invoices as Accounts Payable shows them. */
  private async rows(actor: Actor, headers: SupplierInvoiceRecord[], today: string, email: string): Promise<PayableInvoiceItem[]> {
    const ids = headers.map((h) => h.id);
    const [costLines, masterLines] = await Promise.all([repo.costLinesOf(actor.companyID, ids), repo.masterLinesOf(actor.companyID, ids)]);
    const ctx = await this.context(actor.companyID, costLines, masterLines, headers);
    return this.build(headers, costLines, masterLines, ctx, today, email);
  }

  private build(
    headers: SupplierInvoiceRecord[],
    costLines: InvoiceCostRecord[],
    masterLines: MasterJobCostRecord[],
    ctx: Context,
    today: string,
    email: string,
  ): PayableInvoiceItem[] {
    const costBy = new Map<string, InvoiceCostRecord[]>();
    for (const l of costLines) if (l.supplierInvoiceId) costBy.set(l.supplierInvoiceId, [...(costBy.get(l.supplierInvoiceId) ?? []), l]);
    const masterBy = new Map<string, MasterJobCostRecord[]>();
    for (const l of masterLines) if (l.supplierInvoiceId) masterBy.set(l.supplierInvoiceId, [...(masterBy.get(l.supplierInvoiceId) ?? []), l]);
    // The same number from more than one supplier among the live invoices: maybe one invoice booked twice.
    const suppliersByNumber = new Map<string, Set<string>>();
    for (const h of headers) {
      if (h.status === "refused") continue;
      suppliersByNumber.set(h.numberKey, (suppliersByNumber.get(h.numberKey) ?? new Set()).add(h.supplierKey));
    }
    const now = new Date();
    return headers.map((h) => {
      const own = costBy.get(h.id) ?? [];
      const masters = masterBy.get(h.id) ?? [];
      const lines = [...own.map((l) => costLineItem(l, ctx.jobs)), ...masters.map((l) => masterLineItem(l, ctx.masters))];
      const amounts =
        h.status === "refused"
          ? sumByCurrency(h.refusedLines.map((l) => ({ amount: lineAmount(l.realAmount, l.realQty), currency: l.realCurrency })))
          : sumByCurrency(lines.filter((l) => l.amount !== null).map((l) => ({ amount: l.amount!, currency: l.currency })));
      const supplierId = supplierIdOf(h);
      const facts = supplierId ? (ctx.facts.get(supplierId) ?? null) : null;
      const bookedAt = h.receivedAt ?? h.createdAt;
      const { due, source } = dueDayOf({ dueDate: h.dueDate, receivedAt: bookedAt, kind: h.kind }, facts?.paymentDays ?? null);
      const shipmentIds = [...new Set(own.map((l) => l.shipmentId))];
      const claims = claimsOf({ id: h.id, numberKey: h.numberKey, shipmentIds }, ctx.claims);
      const jobs = [...new Set(lines.map((l) => l.jobNumber).filter(Boolean))].sort();
      const jobFacts = shipmentIds.map((id) => ctx.jobs.get(id)).filter((j): j is JobFacts => !!j);
      const mine =
        !!email &&
        (jobFacts.some((j) => sameEmail(j.personInCharge, email) || sameEmail(j.holidayCover, email)) ||
          masters.some((l) => sameEmail(ctx.masters.get(l.masterJobId)?.personInCharge ?? "", email)));
      return {
        id: h.id,
        supplierCustomerId: h.supplierCustomerId,
        haulierId: h.haulierId,
        supplier: facts?.companyName || h.vendor,
        vendor: h.vendor,
        invoiceNumber: h.invoiceNumber,
        kind: h.kind,
        issueDate: h.issueDate,
        due,
        dueSource: source,
        daysOverdue: h.status === "refused" || h.paidOn ? 0 : daysOverdue(due, today),
        bookedOn: businessDay(bookedAt),
        paidNotBefore: paidNotBefore(h),
        amounts,
        totalNet: h.totalNet,
        vatAmount: h.vatAmount,
        totalGross: h.totalGross,
        currency: h.currency,
        status: h.status,
        paidOn: h.paidOn,
        paidBy: h.paidBy,
        decidedBy: h.decidedBy,
        decidedAt: h.decidedAt?.toISOString() ?? null,
        decisionReason: h.decisionReason,
        selfDecision: h.selfDecision,
        source: h.source,
        enteredBy: h.enteredBy,
        document:
          h.documentShipmentId && h.documentAttachmentId ? { shipmentId: h.documentShipmentId, attachmentId: h.documentAttachmentId, name: h.documentName } : null,
        lines,
        jobs,
        marks: marksOf(h, facts, (suppliersByNumber.get(h.numberKey)?.size ?? 0) > 1, now),
        claims: claims.map((c) => claimItem(c, h.id)),
        claimed: holdsPayment(claims),
        mine,
        aboveEstimate: lines.some((l) => l.difference !== null && l.difference > 0.005),
        jobBilled: jobFacts.some((j) => j.invoicingStatus === INVOICED),
        arrivedAfterBilling: shipmentIds.some((id) => {
          const billed = ctx.billedOn.get(id);
          return !!billed && businessDay(bookedAt) >= billed;
        }),
        version: h.version,
      };
    });
  }

  /** The e-mail of the signed-in user, or "" when it can't be read (only "mine" depends on it). */
  private async emailOrNothing(actor: Actor): Promise<string> {
    try {
      return await userEmailOf(actor.userID);
    } catch {
      return "";
    }
  }

  /**
   * The Accounts Payable page: every supplier invoice, the estimates still waiting for one, and for superadmins
   * Trucking's haulier invoices (D17). Lines entered before the record existed are gathered first (D7): the same
   * sync each cost write runs, over the whole company, so a line a write missed is caught here.
   */
  async payables(actor: Actor): Promise<PayablesResponse> {
    try {
      await repo.sync(actor.companyID, { all: true }, { source: "backfill" });
    } catch (err) {
      log.error(err, "supplier invoices could not be gathered from the lines");
    }
    const today = businessDay(new Date());
    const [headers, expectedLines, email] = await Promise.all([
      repo.list(actor.companyID, LIST_LIMIT + 1),
      repo.expectedLines(actor.companyID, EXPECTED_LIMIT),
      this.emailOrNothing(actor),
    ]);
    const truncated = headers.length > LIST_LIMIT;
    const shown = headers.slice(0, LIST_LIMIT);
    const ids = shown.map((h) => h.id);
    const [costLines, masterLines] = await Promise.all([repo.costLinesOf(actor.companyID, ids), repo.masterLinesOf(actor.companyID, ids)]);
    const ctx = await this.context(actor.companyID, costLines, masterLines, shown, expectedLines.map((l) => l.shipmentId));
    const invoices = this.build(shown, costLines, masterLines, ctx, today, email);
    const expected = this.expected(expectedLines, ctx.jobs, email);
    const haulier = await this.haulier(actor, today);

    const open = invoices.filter(isOpen);
    const toPay = open.filter((i) => i.status === "approved" && i.kind === "invoice");
    const overdue = open.filter((i) => i.daysOverdue > 0);
    const weekEnd = addDays(today, 7);
    const flat = (rows: PayableInvoiceItem[]) => sumByCurrency(rows.flatMap((r) => r.amounts));
    return {
      invoices,
      expected,
      truncated,
      haulier,
      counts: {
        all: invoices.length,
        toPay: toPay.length,
        overdue: overdue.length,
        toApprove: invoices.filter((i) => i.status === "booked").length,
        refused: invoices.filter((i) => i.status === "refused").length,
        claimed: invoices.filter((i) => i.claimed).length,
        paid: invoices.filter((i) => !!i.paidOn).length,
        expected: expected.length,
      },
      totals: {
        toPay: flat(toPay),
        overdue: flat(overdue),
        expected: sumByCurrency(expected.map((e) => ({ amount: e.estimate, currency: e.currency }))),
      },
      dueThisWeek: open.filter((i) => i.kind === "invoice" && i.due !== null && i.due >= today && i.due <= weekEnd).length,
      canDecide: this.canDecide(actor),
      today,
    };
  }

  /** Estimates no invoice came for yet, on jobs that are not cancelled (what to accrue at month-end). */
  private expected(lines: InvoiceCostRecord[], jobs: Map<string, JobFacts>, email: string): PayableExpectedItem[] {
    return lines.flatMap((l) => {
      const job = jobs.get(l.shipmentId);
      if (!job || job.status === CANCELLED_STATUS) return [];
      return [
        {
          lineId: l.id,
          shipmentId: l.shipmentId,
          jobNumber: job.jobNumber,
          customer: job.customer,
          category: l.category,
          description: l.description,
          vendor: l.vendor,
          supplierCustomerId: l.supplierCustomerId ?? l.haulierId,
          estimate: lineAmount(l.estAmount, l.estQty),
          currency: l.estCurrency,
          jobStatus: job.status,
          createdOn: businessDay(l.createdAt),
          mine: sameEmail(job.personInCharge, email) || sameEmail(job.holidayCover, email),
          jobBilled: job.invoicingStatus === INVOICED,
        },
      ];
    });
  }

  /** Trucking's haulier invoices, for superadmins only (D17): shown with a Trucking mark, acted on in Trucking. */
  private async haulier(actor: Actor, today: string): Promise<PayablesResponse["haulier"]> {
    if (!seesTruckingConcept(actor.role)) return { status: "hidden", invoices: [], truncated: false };
    try {
      const { invoices, truncated } = await trucking._internalHaulierInvoiceList({});
      return {
        status: "included",
        truncated,
        invoices: invoices.map(
          (i): PayableHaulierItem => ({
            id: i.id,
            haulierCustomerId: i.haulierCustomerId,
            haulierName: i.haulierName,
            invoiceNumber: i.invoiceNumber,
            issueDate: i.issueDate,
            dueDate: i.dueDate,
            currency: i.currency,
            net: i.net,
            vat: i.vat,
            gross: i.gross,
            status: i.status,
            paidOn: i.paidOn,
            claimed: i.claimed,
            refs: i.refs,
            daysOverdue: i.paidOn || i.status === "REJECTED" ? 0 : daysOverdue(i.dueDate, today),
          }),
        ),
      };
    } catch (err) {
      log.warn(err, "haulier invoices could not be read for Accounts Payable");
      return { status: "unavailable", invoices: [], truncated: false };
    }
  }

  private async header(actor: Actor, id: string): Promise<SupplierInvoiceRecord> {
    if (!isUuid(id)) throw notThere();
    const h = await repo.byId(actor.companyID, id);
    if (!h) throw notThere();
    return h;
  }

  private assertVersion(h: SupplierInvoiceRecord, version: number) {
    if (h.version !== version) throw changedMeanwhile();
  }

  /** One invoice with what happened to it. */
  async detail(actor: Actor, id: string): Promise<PayableDetailResponse> {
    const h = await this.header(actor, id);
    const [[invoice], events, document] = await Promise.all([
      this.rows(actor, [h], businessDay(new Date()), await this.emailOrNothing(actor)),
      repo.events(actor.companyID, h.id),
      this.documentFile(h),
    ]);
    return {
      invoice: invoice!,
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        by: e.by,
        reason: e.reason,
        payload: e.payload,
        at: e.createdAt.toISOString(),
      })),
      refusedLines: h.refusedLines.map((l) => ({
        kind: l.table === "invoice_cost" ? ("job" as const) : ("master_job" as const),
        ownerId: l.ownerId,
        category: l.category,
        description: l.description,
        amount: l.realAmount !== null ? lineAmount(l.realAmount, l.realQty) : null,
        currency: l.realCurrency,
      })),
      canDecide: this.canDecide(actor),
      documentFile: document.file,
      documentGone: document.gone,
    };
  }

  /**
   * The read document's file with its link, from the shipment that keeps it, so the drawer opens it without asking for
   * the job's documents itself. A lookup that fails leaves the link out (the drawer says so), not the invoice.
   */
  private async documentFile(h: SupplierInvoiceRecord): Promise<{ file: PayableDocumentFile | null; gone: boolean }> {
    if (!h.documentShipmentId || !h.documentAttachmentId) return { file: null, gone: false };
    try {
      const { file } = await shipments._internalAttachmentLink({ shipmentId: h.documentShipmentId, attachmentId: h.documentAttachmentId });
      return { file, gone: !file };
    } catch (err) {
      log.warn(err, "a supplier invoice's document could not be looked up", { invoiceId: h.id, shipmentId: h.documentShipmentId });
      return { file: null, gone: false };
    }
  }

  /**
   * A manager approves it (D8, D9, D13, D14): its supplier linked, a Czech VAT payer neither unreliable nor with an
   * unpublished account, and not the manager who entered it while another manager can approve it.
   */
  async approve(actor: Actor, id: string, version: number): Promise<PayableDetailResponse> {
    this.requireManager(actor);
    const h = await this.header(actor, id);
    this.assertVersion(h, version);
    const supplierId = supplierIdOf(h);
    let facts: SupplierFacts | null = null;
    if (supplierId) {
      try {
        facts = (await factsOf([supplierId])).get(supplierId) ?? null;
      } catch (err) {
        log.warn(err, "supplier facts could not be read for an approval");
        throw APIError.unavailable("The supplier's VAT checks could not be read just now: try again in a moment");
      }
    }
    const users = await companyUsersWithRoles();
    const anotherManager = users.some((u) => canDecideQuoteInquiry(u.role) && u.id !== actor.userID);
    const { problem, selfDecision } = approvalProblem({
      status: h.status,
      // Linked: to a company the Customer Database still has.
      linked: !!supplierId && facts !== null,
      facts,
      enteredByUserId: h.enteredByUserId,
      approverUserId: actor.userID,
      anotherManager,
    });
    if (problem) throw APIError.failedPrecondition(problem);
    const by = await userEmailOf(actor.userID);
    const row = await repo.decide(
      actor.companyID,
      h,
      { status: "approved", decidedByUserId: actor.userID, decidedBy: by, decidedAt: new Date(), decisionReason: "", selfDecision },
      { action: "approved", fromStatus: h.status, toStatus: "approved", byUserId: actor.userID, by, payload: selfDecision ? { selfDecision: true } : {} },
    );
    if (!row) throw changedMeanwhile();
    return this.detail(actor, id);
  }

  /**
   * A manager refuses it with a reason (D8, D12): its lines are taken off the jobs - an estimate goes back to
   * what it was, any other line goes - and kept on the invoice; its number is free for the corrected invoice.
   */
  async refuse(actor: Actor, id: string, version: number, reason: string): Promise<PayableDetailResponse> {
    this.requireManager(actor);
    const why = reason.trim();
    if (why.length < MIN_REASON) throw APIError.invalidArgument("Say why it is refused: the supplier is told so");
    const h = await this.header(actor, id);
    this.assertVersion(h, version);
    if (h.status === "refused") throw APIError.failedPrecondition("This invoice is refused already");
    if (h.paidOn) throw APIError.failedPrecondition(`This invoice is marked paid (${h.paidOn}): take the payment back first`);
    const by = await userEmailOf(actor.userID);
    const row = await repo.decide(
      actor.companyID,
      h,
      { status: "refused", decidedByUserId: actor.userID, decidedBy: by, decidedAt: new Date(), decisionReason: why, selfDecision: false },
      { action: "refused", fromStatus: h.status, toStatus: "refused", byUserId: actor.userID, by, reason: why },
      async (tx) => {
        const lines = await repo.takeLinesOff(tx, actor.companyID, h.id);
        await repo.storeRefusedLines(tx, actor.companyID, h.id, lines);
      },
    );
    if (!row) throw changedMeanwhile();
    return this.detail(actor, id);
  }

  /** A manager takes an approval back while it is not paid: it waits for approval again. */
  async takeBackApproval(actor: Actor, id: string, version: number, reason: string): Promise<PayableDetailResponse> {
    this.requireManager(actor);
    const why = reason.trim();
    if (why.length < MIN_REASON) throw APIError.invalidArgument("Say why the approval is taken back");
    const h = await this.header(actor, id);
    this.assertVersion(h, version);
    if (h.status !== "approved") throw APIError.failedPrecondition("This invoice is not approved");
    if (h.paidOn) throw APIError.failedPrecondition(`This invoice is marked paid (${h.paidOn}): take the payment back first`);
    const by = await userEmailOf(actor.userID);
    const row = await repo.decide(
      actor.companyID,
      h,
      { status: "booked", decidedByUserId: null, decidedBy: "", decidedAt: null, decisionReason: "", selfDecision: false },
      { action: "approval_taken_back", fromStatus: "approved", toStatus: "booked", byUserId: actor.userID, by, reason: why },
    );
    if (!row) throw changedMeanwhile();
    return this.detail(actor, id);
  }

  /**
   * A manager notes the day it was paid (D11), once for the whole invoice, only once approved and with no claim
   * open on it (D15). Its job lines say the same, so the job's Costs and the supplier's What we owe follow.
   */
  async markPaid(actor: Actor, id: string, version: number, day: string): Promise<PayableDetailResponse> {
    this.requireManager(actor);
    const paidOn = day.trim();
    if (!isRealYmd(paidOn)) throw APIError.invalidArgument("The day it was paid must be a date (yyyy-mm-dd)");
    const h = await this.header(actor, id);
    this.assertVersion(h, version);
    const costLines = await repo.costLinesOf(actor.companyID, [h.id]);
    let claims: PayableClaimFact[];
    try {
      claims = await claimsFor(actor.companyID, [...new Set(costLines.map((l) => l.shipmentId))], [h.id]);
    } catch (err) {
      log.warn(err, "cost claims could not be read before a payment");
      throw APIError.unavailable("Whether a claim holds this invoice could not be read just now: try again in a moment");
    }
    const open = holdsPayment(claimsOf({ id: h.id, numberKey: h.numberKey, shipmentIds: costLines.map((l) => l.shipmentId) }, claims));
    const problem = paymentProblem({
      status: h.status,
      paidOn: h.paidOn,
      day: paidOn,
      today: businessDay(new Date()),
      bookedOn: paidNotBefore(h),
      openClaim: open,
    });
    if (problem) throw APIError.failedPrecondition(problem);
    const by = await userEmailOf(actor.userID);
    const paidAt = new Date();
    const row = await repo.decide(
      actor.companyID,
      h,
      { paidOn, paidAt, paidByUserId: actor.userID, paidBy: by },
      { action: "paid", fromStatus: h.status, toStatus: h.status, byUserId: actor.userID, by, payload: { paidOn } },
      (tx) => repo.setLinesPaid(tx, actor.companyID, h.id, { pay: { paidOn, paidAt, paidByUserId: actor.userID, paidBy: by } }),
    );
    if (!row) throw changedMeanwhile();
    return this.detail(actor, id);
  }

  /** A manager takes a payment back with a reason (noted by mistake): the lines are unpaid again. */
  async takeBackPayment(actor: Actor, id: string, version: number, reason: string): Promise<PayableDetailResponse> {
    this.requireManager(actor);
    const why = reason.trim();
    if (why.length < MIN_REASON) throw APIError.invalidArgument("Say why the payment is taken back");
    const h = await this.header(actor, id);
    this.assertVersion(h, version);
    if (!h.paidOn) throw APIError.failedPrecondition("This invoice is not marked paid");
    const paidOn = h.paidOn;
    const by = await userEmailOf(actor.userID);
    const row = await repo.decide(
      actor.companyID,
      h,
      { paidOn: null, paidAt: null, paidByUserId: null, paidBy: "" },
      { action: "payment_taken_back", fromStatus: h.status, toStatus: h.status, byUserId: actor.userID, by, reason: why, payload: { paidOn: h.paidOn } },
      // Its lines as they were before it: a manager's payment unstamps what it stamped; one taken from the lines
      // (paid before Accounts Payable existed, no manager noted it) was theirs, so all of them.
      (tx) => repo.setLinesPaid(tx, actor.companyID, h.id, { takeBack: { paidOn, paidAt: h.paidAt, fromLines: !h.paidByUserId } }),
    );
    if (!row) throw changedMeanwhile();
    return this.detail(actor, id);
  }

  /** A manager links the supplier of a booked invoice to a company of the Customer Database (D13). */
  async linkSupplier(actor: Actor, id: string, version: number, supplierCustomerId: string, assertSupplier: (id: string) => Promise<void>): Promise<PayableDetailResponse> {
    this.requireManager(actor);
    if (!isUuid(supplierCustomerId)) throw APIError.invalidArgument("Pick the supplier from the Customer Database");
    const h = await this.header(actor, id);
    this.assertVersion(h, version);
    if (h.status !== "booked") throw APIError.failedPrecondition("Only an invoice waiting for approval is linked to its supplier");
    await assertSupplier(supplierCustomerId);
    const name = (await factsOf([supplierCustomerId])).get(supplierCustomerId)?.companyName ?? "";
    const by = await userEmailOf(actor.userID);
    const row = await repo.linkSupplier(
      actor.companyID,
      h,
      { id: supplierCustomerId, name },
      { action: "details_changed", fromStatus: h.status, toStatus: h.status, byUserId: actor.userID, by, payload: { supplierCustomerId, from: supplierIdOf(h) ?? h.vendor } },
    );
    if (row === "paid") throw APIError.failedPrecondition("The supplier's invoice of this number is marked paid already: these lines can't join it");
    if (!row) throw changedMeanwhile();
    return this.detail(actor, row.id);
  }

  /**
   * The invoice's own details as on the document (dates, totals, credit note): anyone while it waits for approval,
   * a manager once approved too; never once paid or refused.
   */
  async setDetails(
    actor: Actor,
    id: string,
    version: number,
    input: { issueDate?: string; dueDate?: string; totalNet?: string; vatAmount?: string; totalGross?: string; currency?: string; kind?: "invoice" | "credit_note" },
  ): Promise<PayableDetailResponse> {
    const h = await this.header(actor, id);
    this.assertVersion(h, version);
    if (h.status === "refused") throw APIError.failedPrecondition("This invoice was refused: it stays as it was");
    if (h.paidOn) throw APIError.failedPrecondition(`This invoice is marked paid (${h.paidOn}): it stays as it was paid`);
    if (h.status === "approved" && !this.canDecide(actor)) throw APIError.permissionDenied("This invoice is approved: only a manager changes it now");
    const day = (v: string | undefined, label: string) => {
      if (v === undefined) return undefined;
      const s = v.trim();
      if (!s) return null;
      if (!isRealYmd(s)) throw APIError.invalidArgument(`${label} must be a date (yyyy-mm-dd)`);
      return s;
    };
    const money = (v: string | undefined, label: string) => (v === undefined ? undefined : v.trim() ? toDecimal(v.trim(), label) : null);
    const values = {
      issueDate: day(input.issueDate, "The issue day"),
      dueDate: day(input.dueDate, "The due day"),
      totalNet: money(input.totalNet, "The total without VAT"),
      vatAmount: money(input.vatAmount, "The VAT"),
      totalGross: money(input.totalGross, "The total with VAT"),
      currency: input.currency === undefined ? undefined : input.currency.trim().toUpperCase(),
      kind: input.kind,
    };
    if (values.currency !== undefined && values.currency !== "" && !/^[A-Z]{3}$/.test(values.currency)) throw APIError.invalidArgument("The currency must be 3 letters");
    const set = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
    if (!Object.keys(set).length) return this.detail(actor, id);
    const by = await userEmailOf(actor.userID);
    const row = await repo.decide(actor.companyID, h, set, {
      action: "details_changed",
      fromStatus: h.status,
      toStatus: h.status,
      byUserId: actor.userID,
      by,
      payload: Object.fromEntries(Object.keys(set).map((k) => [k, { from: (h as unknown as Record<string, unknown>)[k] ?? null, to: set[k] }])),
    });
    if (!row) throw changedMeanwhile();
    return this.detail(actor, id);
  }

  /** The read document, kept as an attachment of a shipment (D18). */
  async attachDocument(actor: Actor, id: string, doc: { shipmentId: string; attachmentId: string; name: string }): Promise<void> {
    if (!isUuid(doc.shipmentId) || !isUuid(doc.attachmentId)) throw APIError.invalidArgument("The document must be given by its shipment and attachment ids");
    const h = await this.header(actor, id);
    // As its details: never once paid or refused, it stays as it was decided.
    if (h.paidOn) throw APIError.failedPrecondition(`This invoice is marked paid (${h.paidOn}): it stays as it was paid`);
    if (h.status === "refused") throw APIError.failedPrecondition("This invoice was refused: the corrected invoice is booked as a new one");
    await repo.setDetails(actor.companyID, h.id, { documentShipmentId: doc.shipmentId, documentAttachmentId: doc.attachmentId, documentName: doc.name.trim().slice(0, 300) });
  }

  /**
   * The bell (D10): a manager is told how many invoices wait for approval; anyone, of an invoice booked in the
   * last week on a job they are Person in Charge or Holiday Cover of, by someone else, until they open it.
   */
  async forMe(actor: Actor): Promise<PayablesForMeResponse> {
    const toApprove = this.canDecide(actor) ? await repo.countByStatus(actor.companyID, "booked") : 0;
    const email = await this.emailOrNothing(actor);
    if (!email) return { toApprove, booked: [] };
    const recent = (await repo.bookedSince(actor.companyID, new Date(Date.now() - BELL_DAYS * DAY))).filter(
      (h) => h.source !== "backfill" && h.status !== "refused" && h.enteredByUserId !== actor.userID,
    );
    if (!recent.length) return { toApprove, booked: [] };
    const seen = await repo.seenIds(actor.companyID, actor.userID, recent.map((h) => h.id));
    const unseen = recent.filter((h) => !seen.has(h.id));
    if (!unseen.length) return { toApprove, booked: [] };
    const rows = await this.rows(actor, unseen, businessDay(new Date()), email);
    const createdAt = new Map(unseen.map((h) => [h.id, h.createdAt]));
    const booked = rows
      .filter((r) => r.mine)
      .map(
        (r): PayableNoticeItem => ({
          invoiceId: r.id,
          supplier: r.supplier,
          invoiceNumber: r.invoiceNumber,
          jobs: r.jobs,
          amounts: r.amounts,
          aboveEstimate: r.aboveEstimate,
          jobBilled: r.jobBilled,
          bookedAt: createdAt.get(r.id)!.toISOString(),
        }),
      );
    return { toApprove, booked };
  }

  async seen(actor: Actor, ids: string[]): Promise<void> {
    await repo.markSeen(actor.companyID, actor.userID, [...new Set(ids.filter(isUuid))]);
  }

  // ── Hooks of the cost writes (invoicing service, master job costs) ──

  /**
   * Before a line of an invoice changes or goes: a paid invoice's lines stay as paid; Paid itself is noted on
   * Accounts Payable for the whole invoice (D11); a change of what an approved invoice bills sends it back to be
   * approved again - before the write, so a write that then fails leaves it waiting, never approved unseen.
   */
  async beforeLineChange(
    actor: Pick<Actor, "userID" | "companyID">,
    line: { supplierInvoiceId: string | null } & Record<string, unknown>,
    changes: Record<string, unknown> | "delete",
  ): Promise<void> {
    if (line.supplierInvoiceId) await this.beforeLeaving(actor, line as { supplierInvoiceId: string } & Record<string, unknown>, changes);
    if (changes !== "delete") await this.beforeJoining(actor, line, changes);
  }

  /** The invoice the line is on: kept as paid once paid, approved again when what it bills changes. */
  private async beforeLeaving(actor: Pick<Actor, "userID" | "companyID">, line: { supplierInvoiceId: string } & Record<string, unknown>, changes: Record<string, unknown> | "delete") {
    if (changes !== "delete" && changes.paidOn !== undefined && (changes.paidOn ?? null) !== (line.paidOn ?? null)) {
      throw APIError.failedPrecondition("This line is on a supplier invoice: its payment is noted for the whole invoice on Finance → Accounts Payable");
    }
    const changed = changes === "delete" ? ["deleted"] : BILLING_FIELDS.filter((k) => changes[k] !== undefined && !sameValue(k, changes[k], line[k]));
    // Unticking Received takes a payment back with it: not on a paid invoice either.
    const unreceived = changes !== "delete" && changes.received === false && line.received === true;
    if (!changed.length && !unreceived) return;
    const h = await repo.byId(actor.companyID, line.supplierInvoiceId);
    if (!h || h.status === "refused") return;
    if (h.paidOn) {
      throw APIError.failedPrecondition(`Supplier invoice ${h.invoiceNumber} is marked paid (${h.paidOn}): its lines stay as paid. Take the payment back on Finance → Accounts Payable first`);
    }
    if (h.status !== "approved" || !changed.length) return;
    await this.backToBooked(actor, h, { line: (line as { id?: string }).id ?? null, changed });
  }

  /**
   * The invoice a new or renumbered line comes to: a paid one takes no more lines (it would bill more than was
   * paid), an approved one is approved again before the line joins it (D8, D11).
   */
  private async beforeJoining(actor: Pick<Actor, "userID" | "companyID">, line: { supplierInvoiceId: string | null } & Record<string, unknown>, changes: Record<string, unknown>) {
    const next = { ...line, ...changes } as Record<string, unknown>;
    const numberKey = invoiceNumberKey(String(next.invoiceNumber ?? ""));
    if (!numberKey) return;
    const isCost = "shipmentId" in next;
    const keyOf = (l: Record<string, unknown>) =>
      supplierKeyOf({ supplierCustomerId: isCost ? ((l.supplierCustomerId as string | null) ?? null) : null, haulierId: isCost ? ((l.haulierId as string | null) ?? null) : null, vendor: String(l.vendor ?? "") });
    const sameNumber = invoiceNumberKey(String(line.invoiceNumber ?? "")) === numberKey;
    // A line keeps its invoice while its number (and, on a job, its supplier) stay: nothing joins anything then.
    if (line.supplierInvoiceId && sameNumber && (!isCost || keyOf(line) === keyOf(next))) return;
    // A master job's line joins the linked invoice its siblings are on first, as the sync matches it.
    const masterJobId = !isCost && typeof next.masterJobId === "string" ? next.masterJobId : "";
    const id =
      (masterJobId ? await repo.idOfMasterSibling(actor.companyID, masterJobId, String(next.vendor ?? ""), numberKey) : null) ??
      (await repo.idOf(actor.companyID, keyOf(next), numberKey));
    if (!id || id === line.supplierInvoiceId) return;
    const h = await repo.byId(actor.companyID, id);
    if (!h || h.status === "refused") return;
    if (h.paidOn) {
      throw APIError.failedPrecondition(`Supplier invoice ${h.invoiceNumber} is marked paid already (${h.paidOn}): a line can't join it. Take the payment back on Finance → Accounts Payable first`);
    }
    if (h.status === "approved") await this.backToBooked(actor, h, { line: (line as { id?: string }).id ?? null, changed: ["line added"] });
  }

  /** The live supplier invoices (not refused) that bill a line of this job. */
  private async invoicesOfShipment(companyId: string, shipmentId: string): Promise<SupplierInvoiceRecord[]> {
    const lines = await invoiceCostRepository.listByShipmentId(shipmentId, companyId);
    const ids = [...new Set(lines.map((l) => l.supplierInvoiceId).filter((id): id is string => !!id))];
    const headers = await Promise.all(ids.map((id) => repo.byId(companyId, id)));
    return headers.filter((h): h is SupplierInvoiceRecord => !!h && h.status !== "refused");
  }

  /**
   * The numbers of the supplier invoices marked paid that bill a line of this job. The job can't be deleted while
   * one does: a paid invoice's lines stay as paid (shipments asks before a delete).
   */
  async paidInvoicesOfShipment(companyId: string, shipmentId: string): Promise<string[]> {
    if (!isUuid(shipmentId)) return [];
    return (await this.invoicesOfShipment(companyId, shipmentId)).filter((h) => !!h.paidOn).map((h) => h.invoiceNumber);
  }

  /**
   * Before a deleted job's lines go (the shipment-deleted subscription): they leave their invoices as deleted lines
   * do, so an approved invoice that now bills less waits to be approved again. One paid meanwhile keeps its state
   * (the delete is refused while one is paid), said in the log. A failure throws, so the subscription tries again.
   */
  async beforeShipmentRetired(companyId: string, shipmentId: string): Promise<void> {
    const actor = { companyID: companyId, userID: "" };
    for (const h of await this.invoicesOfShipment(companyId, shipmentId)) {
      if (h.paidOn) {
        log.warn("a deleted job's lines leave a supplier invoice marked paid", { companyId, shipmentId, invoiceId: h.id });
        continue;
      }
      if (h.status === "approved") await this.backToBooked(actor, h, { changed: ["job deleted"], shipmentId });
    }
  }

  /** Sends an approved invoice back to be approved; refused (to be tried again) when it changed meanwhile and still is approved. */
  private async backToBooked(actor: Pick<Actor, "userID" | "companyID">, h: SupplierInvoiceRecord, payload: Record<string, unknown>): Promise<void> {
    let by = "";
    try {
      by = await userEmailOf(actor.userID);
    } catch {
      by = "";
    }
    const values = { status: "booked" as const, decidedByUserId: null, decidedBy: "", decidedAt: null, decisionReason: "", selfDecision: false };
    const event = { action: "line_changed" as const, fromStatus: "approved", toStatus: "booked", byUserId: actor.userID || null, by, reason: "A line changed after approval", payload };
    if (await repo.decide(actor.companyID, h, values, event)) return;
    // Changed meanwhile: as it is now.
    const now = await repo.byId(actor.companyID, h.id);
    if (!now || now.status !== "approved") return;
    if (now.paidOn) throw APIError.failedPrecondition(`Supplier invoice ${now.invoiceNumber} was marked paid meanwhile: its lines stay as paid`);
    if (!(await repo.decide(actor.companyID, now, values, event))) throw changedMeanwhile();
  }

  /**
   * After a cost write: its lines are matched to their invoices again (a new one booked for a new number). A line
   * that came onto an approved, unpaid invoice sends it back to be approved. Never fails the write: what it
   * misses is gathered when Accounts Payable is opened.
   */
  async afterLineWrite(actor: Pick<Actor, "userID" | "companyID">, scope: SyncScope, source: SupplierInvoiceSource): Promise<string[]> {
    try {
      let email = "";
      try {
        email = actor.userID ? await userEmailOf(actor.userID) : "";
      } catch {
        email = "";
      }
      const { touched, gained } = await repo.sync(actor.companyID, scope, { source, userId: actor.userID || null, userEmail: email });
      for (const id of gained) {
        const h = await repo.byId(actor.companyID, id);
        if (h && h.status === "approved" && !h.paidOn) {
          await this.backToBooked(actor, h, { changed: ["line added"] });
        }
      }
      return touched;
    } catch (err) {
      log.error(err, "supplier invoices could not be matched after a cost write");
      return [];
    }
  }
}

export const supplierInvoiceService = new SupplierInvoiceService();
