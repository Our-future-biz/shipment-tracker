import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { customers, shipments } from "~encore/clients";
import { inTx, type Tx } from "../db/db";
import { haulierInvoiceRepository, type LineValues, type StoredInvoice } from "../repositories/haulierInvoice.repository";
import { haulierRepository } from "../repositories/haulier.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { consignmentRepository } from "../repositories/consignment.repository";
import { truckingOutboxRepository, type TruckingOutboxInput } from "../repositories/truckingOutbox.repository";
import { appendEvent } from "../repositories/event.repository";
import { truckingDocumentBucket } from "../storage/documentBucket";
import type { TruckingHaulierInvoiceRecord, TruckingHaulierInvoiceLineRecord } from "../schemas/haulierInvoice.schema";
import type { TruckingEventKind } from "../schemas/truckingEvent.schema";
import type { FileDownload, HaulierProfile, PriceSnapshot } from "../interfaces/interfaces";
import type {
  HaulierInvoice,
  HaulierInvoiceCandidate,
  HaulierInvoiceInput,
  HaulierInvoiceLineInput,
  HaulierInvoiceStatus,
  HaulierInvoiceTargetKind,
} from "../interfaces/haulierInvoice.interfaces";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import { businessDay } from "../../../lib/businessDate";
import { isUniqueViolation } from "../../../lib/db/errors";
import { servedFileType } from "../../warehouse/services/fileType";
import { bankAccountCheck, cleanInvoiceInput, cleanReason, invoiceBlockReasons, matchInvoice, type CleanInvoice } from "../lib/haulierInvoiceRules";
import { realCosts, type RealTarget, type TargetJob } from "../lib/haulierInvoiceReal";
import { haulierClaims } from "../lib/haulierClaims";
import { isInternalDepartment } from "../lib/internalRules";
import { checkUpload, type CheckedFile } from "../lib/truckingFiles";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";
import { toProfile } from "./haulier.service";
import { deliverDue } from "./truckingOutbox.service";

// Haulier invoices (Phase 6 B): entered against the haulier's done trips and partner deliveries,
// matched EXACTLY against what we expect to pay (the target's cost less claims) - an exact match
// is approved automatically, any difference waits for a manager's approval or rejection with a
// reason. Payment is never approved while the haulier fails the VAT bank-account check (ručení
// za DPH): BLOCKED, for everyone. On approval the real cost reaches the jobs: Road Department
// jobs' Trucking buying rows get it (outbox "real_costs"), internal jobs keep it in Trucking's
// ledger (the line's allocations).

export const INVOICE_CONFLICT = "The invoice was changed by someone else. Reload and try again.";
const EDITABLE: HaulierInvoiceStatus[] = ["DRAFT", "NEEDS_APPROVAL", "BLOCKED"];
const APPROVABLE: HaulierInvoiceStatus[] = ["NEEDS_APPROVAL", "BLOCKED"];
const AUTO_APPROVER = "Exact match (automatic)";
const AUTO_REASON = "Every line and the net total match the expected cost exactly";

const bad = (message: string) => APIError.invalidArgument(message);

/** A line's target as resolved against the trips and legs. */
interface ResolvedLine {
  input: HaulierInvoiceLineInput;
  ref: string;
  cost: number;
  claimed: number;
  expected: number;
  currency: "CZK" | "EUR";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const targetKey = (kind: HaulierInvoiceTargetKind, id: string) => `${kind}:${id}`;

function toInvoice({ invoice: r, lines }: StoredInvoice, profile: HaulierProfile | null): HaulierInvoice {
  return {
    id: r.id,
    haulierCustomerId: r.haulierCustomerId,
    haulierName: r.haulierName,
    invoiceNumber: r.invoiceNumber,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    duzp: r.duzp,
    currency: r.currency,
    totalNet: r.totalNet,
    vatAmount: r.vatAmount,
    totalGross: r.totalGross,
    bankAccount: r.bankAccount,
    bankAccountCheck: bankAccountCheck(profile, r.bankAccount),
    lines: lines.map((l) => ({
      id: l.id,
      target: { kind: l.targetKind, id: l.targetId, ref: l.targetRef },
      expected: l.expected,
      claimed: l.claimed,
      invoiced: l.invoiced,
      difference: round2(l.invoiced - l.expected),
      currency: l.currency,
      note: l.note,
    })),
    difference: r.difference,
    status: r.status,
    blockReasons: r.blockReasons,
    approval: r.approvedAt ? { byName: r.approvedBy ?? "", at: r.approvedAt.toISOString(), reason: r.approvalReason ?? "" } : null,
    fileName: r.fileName,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    version: r.version,
  };
}

class HaulierInvoiceService {
  /** The haulier's name in the Customer Database; not found when it is not a live haulier there. */
  private async haulierName(customerId: string): Promise<string> {
    if (typeof customerId !== "string" || !isUuid(customerId)) throw APIError.notFound("Haulier not found");
    const { hauliers } = await customers._internalHaulierList({ ids: [customerId] });
    const found = hauliers.find((h) => h.id === customerId);
    if (!found) throw APIError.notFound("Haulier not found");
    return found.companyName;
  }

  private async profile(companyId: string, customerId: string): Promise<HaulierProfile | null> {
    const stored = await haulierRepository.find(companyId, customerId);
    return stored ? toProfile(stored) : null;
  }

  async load(companyId: string, id: string): Promise<StoredInvoice> {
    const found = typeof id === "string" && isUuid(id) ? await haulierInvoiceRepository.find(companyId, id) : null;
    if (!found) throw APIError.notFound("Haulier invoice not found");
    return found;
  }

  // ---- targets ----------------------------------------------------------------------------------

  /** Each line's trip or partner delivery: the haulier's, done, priced in the invoice's currency; expected = cost − claims. */
  private async resolve(companyId: string, haulierId: string, currency: "CZK" | "EUR", lines: HaulierInvoiceLineInput[]): Promise<ResolvedLine[]> {
    const tripIds = lines.filter((l) => l.targetKind === "TRIP").map((l) => l.targetId);
    const legIds = lines.filter((l) => l.targetKind === "PARTNER_LEG").map((l) => l.targetId);
    const [trips, legs] = await Promise.all([tripRepository.findMany(companyId, tripIds), legRepository.findMany(companyId, legIds)]);
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    const tripOf = new Map(trips.map((t) => [t.id, t]));
    const legOf = new Map(legs.map((l) => [l.id, l]));
    const consignmentOf = new Map(consignments.map((c) => [c.id, c]));
    const claims = await haulierClaims.claimedFor(lines.map((l) => ({ kind: l.targetKind, id: l.targetId })));

    return lines.map((input, i) => {
      const n = i + 1;
      let ref: string;
      let buy: PriceSnapshot | null;
      if (input.targetKind === "TRIP") {
        const t = tripOf.get(input.targetId);
        if (!t) throw bad(`Line ${n}: trip not found`);
        ref = t.ref;
        if (t.haulierCustomerId !== haulierId) throw bad(`Line ${n}: trip ${ref} was run by another haulier`);
        if (t.cancelledAt || t.status !== "DONE") throw bad(`Line ${n}: trip ${ref} is not done`);
        buy = t.buy;
      } else {
        const l = legOf.get(input.targetId);
        const c = l ? consignmentOf.get(l.consignmentId) : undefined;
        if (!l || !c || l.kind !== "DELIVERY" || l.tripId) throw bad(`Line ${n}: partner delivery not found`);
        ref = `${c.ref} partner delivery`;
        if (l.haulierCustomerId !== haulierId) throw bad(`Line ${n}: ${ref} was made by another haulier`);
        if (c.cancelledAt || l.status !== "DONE") throw bad(`Line ${n}: ${ref} is not delivered`);
        buy = l.buy;
      }
      if (!buy) throw bad(`Line ${n}: ${ref} has no price to match against`);
      if (buy.currency !== currency) throw bad(`Line ${n}: ${ref} is priced in ${buy.currency}; enter it on a ${buy.currency} invoice`);
      const claimed = round2(claims.get(input.targetId) ?? 0);
      return { input, ref, cost: buy.total, claimed, expected: round2(buy.total - claimed), currency: buy.currency };
    });
  }

  /** The jobs sharing a target's cost and its price (for the real cost on approval). */
  private async realTarget(companyId: string, kind: HaulierInvoiceTargetKind, id: string): Promise<RealTarget | null> {
    if (kind === "PARTNER_LEG") {
      const leg = await legRepository.find(companyId, id);
      if (!leg?.buy) return null;
      const [c] = await consignmentRepository.findMany(companyId, [leg.consignmentId]);
      return { kind, id, tripKind: null, buy: leg.buy, jobs: c ? [{ shipmentId: c.shipmentId, consignmentId: c.id, weight: 1 }] : [] };
    }
    const trip = await tripRepository.find(companyId, id);
    if (!trip?.buy) return null;
    if (trip.kind === "FTL") {
      const c = await consignmentRepository.findByTrip(companyId, trip.id);
      return { kind, id, tripKind: "FTL", buy: trip.buy, jobs: c ? [{ shipmentId: c.shipmentId, consignmentId: c.id, weight: 1 }] : [] };
    }
    // LTL: each job weighs its part of the estimate (Σ its legs' cost shares).
    const legs = await legRepository.forTrips(companyId, [trip.id]);
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    const byId = new Map(consignments.filter((c) => !c.cancelledAt).map((c) => [c.id, c]));
    const jobs = new Map<string, TargetJob>();
    for (const l of legs) {
      const c = byId.get(l.consignmentId);
      if (!c) continue;
      const job = jobs.get(c.shipmentId) ?? { shipmentId: c.shipmentId, consignmentId: c.id, weight: 0 };
      job.weight = round2(job.weight + (l.costShareCzk ?? 0));
      jobs.set(c.shipmentId, job);
    }
    return { kind, id, tripKind: trip.kind, buy: trip.buy, jobs: [...jobs.values()] };
  }

  /**
   * The real cost of an approved invoice's lines: per line, the allocations (written on the line)
   * and the outbox rows owed to Road Department jobs. The jobs' departments are read first.
   */
  private async planReal(companyId: string, invoice: Pick<TruckingHaulierInvoiceRecord, "currency" | "invoiceNumber">, lines: Pick<TruckingHaulierInvoiceLineRecord, "id" | "targetKind" | "targetId" | "invoiced">[], actor: Actor) {
    const targets = await Promise.all(lines.map((l) => this.realTarget(companyId, l.targetKind, l.targetId)));
    const shipmentIds = [...new Set(targets.flatMap((t) => t?.jobs.map((j) => j.shipmentId) ?? []))];
    const { shipments: jobs } = shipmentIds.length ? await shipments._internalShipmentBasics({ ids: shipmentIds }) : { shipments: [] };
    const departmentOf = new Map(jobs.map((j) => [j.id, j.department]));
    const plans = lines.map((line, n) => {
      const t = targets[n];
      if (!t) return { lineId: line.id, allocations: [], owed: [] as TruckingOutboxInput[] };
      const { allocations, pushes } = realCosts(
        t,
        line.invoiced,
        invoice.currency,
        invoice.invoiceNumber,
        (shipmentId) => isInternalDepartment(departmentOf.get(shipmentId)),
        (shipmentId) => departmentOf.has(shipmentId),
      );
      const owed = pushes.map(
        (p): TruckingOutboxInput => ({
          consignmentId: p.consignmentId,
          shipmentId: p.shipmentId,
          kind: "real_costs",
          payload: p.payload as unknown as Record<string, unknown>,
          actingUserId: actor.userID,
          actingRole: actor.role,
        }),
      );
      return { lineId: line.id, allocations, owed };
    });
    return plans;
  }

  /** Writes the real cost of an approved invoice in its transaction; answers the consignments owed a delivery. */
  private async writeReal(tx: Tx, companyId: string, plans: Awaited<ReturnType<HaulierInvoiceService["planReal"]>>, lines: TruckingHaulierInvoiceLineRecord[]): Promise<string[]> {
    const owed: TruckingOutboxInput[] = [];
    for (const [n, plan] of plans.entries()) {
      const line = lines[n];
      if (!line) continue;
      await haulierInvoiceRepository.setAllocations(tx, companyId, line.id, plan.allocations);
      owed.push(...plan.owed);
    }
    await truckingOutboxRepository.enqueue(tx, companyId, owed);
    return [...new Set(owed.map((o) => o.consignmentId))];
  }

  private async deliver(consignmentIds: string[]): Promise<void> {
    for (const id of consignmentIds) await deliverDue(id);
  }

  // ---- saving -----------------------------------------------------------------------------------

  /** The checks a save must pass in its transaction (haulier locked): no duplicate number, no target on another live invoice. */
  private async assertFree(tx: Tx, companyId: string, haulierId: string, clean: CleanInvoice, resolved: ResolvedLine[], exceptId?: string): Promise<void> {
    await haulierInvoiceRepository.lockHaulier(tx, companyId, haulierId);
    const dup = await haulierInvoiceRepository.findByNumber(tx, companyId, haulierId, clean.invoiceNumberKey, exceptId);
    if (dup) throw APIError.alreadyExists(`Invoice ${dup.invoiceNumber} of this haulier is already entered`);
    const uses = await haulierInvoiceRepository.targetUses(
      companyId,
      clean.lines.map((l) => ({ kind: l.targetKind, id: l.targetId })),
      exceptId,
      tx,
    );
    if (uses.length) {
      const refOf = new Map(resolved.map((r) => [targetKey(r.input.targetKind, r.input.targetId), r.ref]));
      const u = uses[0]!;
      throw APIError.alreadyExists(`${refOf.get(targetKey(u.targetKind, u.targetId)) ?? "A trip"} is already on invoice ${u.invoiceNumber}`);
    }
  }

  private lineValues(resolved: ResolvedLine[]): LineValues[] {
    return resolved.map((r) => ({
      targetKind: r.input.targetKind,
      targetId: r.input.targetId,
      targetRef: r.ref,
      expected: r.expected,
      claimed: r.claimed,
      invoiced: r.input.invoiced,
      currency: r.currency,
      note: r.input.note,
      live: true,
      allocations: [],
    }));
  }

  /** Stores an uploaded copy of the invoice (PDF or photo, 10 MB) in the trucking documents bucket. */
  private async storeFile(companyId: string, fileName: unknown, fileBase64: unknown): Promise<{ file: CheckedFile; key: string } | null> {
    if (fileBase64 === undefined || fileBase64 === null || fileBase64 === "") return null;
    const file = checkUpload(fileName, fileBase64, true);
    const key = `${companyId}/haulier-invoices/${randomUUID()}`;
    await truckingDocumentBucket.upload(key, file.bytes, { contentType: file.contentType });
    return { file, key };
  }

  private fileValues(stored: { file: CheckedFile; key: string } | null) {
    if (!stored) return {};
    return {
      fileName: stored.file.fileName,
      fileContentType: stored.file.contentType,
      fileSizeBytes: stored.file.bytes.length,
      fileSha256: stored.file.sha256,
      fileStorageKey: stored.key,
    };
  }

  private async event(tx: Tx, companyId: string, actor: Actor, by: string, kind: TruckingEventKind, invoice: TruckingHaulierInvoiceRecord, summary: string, reason?: string) {
    await appendEvent(tx, companyId, {
      kind,
      customerId: invoice.haulierCustomerId,
      byUserId: actor.userID || null,
      byName: by,
      payload: {
        changes: {},
        reason,
        summary,
        facts: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status, difference: invoice.difference },
      },
    });
  }

  /** The status and figures of a save, worked out against the haulier's profile now. */
  private assess(profile: HaulierProfile | null, clean: CleanInvoice, resolved: ResolvedLine[]) {
    const blockReasons = invoiceBlockReasons(profile, clean.bankAccount);
    const match = matchInvoice(
      clean.totalNet,
      resolved.map((r) => ({ expected: r.expected, invoiced: r.input.invoiced })),
      blockReasons,
    );
    return { blockReasons, match, published: profile ? bankAccountCheck(profile, clean.bankAccount).published : null };
  }

  private autoApproval(status: HaulierInvoiceStatus, actor: Actor) {
    if (status !== "APPROVED") return { approvedAt: null, approvedByUserId: null, approvedBy: null, approvalReason: null };
    return { approvedAt: new Date(), approvedByUserId: actor.userID || null, approvedBy: AUTO_APPROVER, approvalReason: AUTO_REASON };
  }

  /** Any user. Enters a haulier invoice; an exact match not blocked is approved at once. */
  async create(actor: Actor, input: HaulierInvoiceInput): Promise<HaulierInvoice> {
    const companyId = actor.companyID;
    const haulierId = input.haulierCustomerId;
    const haulierName = await this.haulierName(haulierId);
    const clean = cleanInvoiceInput(input);
    const profile = await this.profile(companyId, haulierId);
    const resolved = await this.resolve(companyId, haulierId, clean.currency, clean.lines);
    const { blockReasons, match, published } = this.assess(profile, clean, resolved);
    const by = await userName(actor.userID);
    const file = await this.storeFile(companyId, input.fileName, input.fileBase64);
    const approved = match.status === "APPROVED";
    const plans = approved
      ? await this.planReal(companyId, clean, resolved.map((r, n) => ({ id: String(n), targetKind: r.input.targetKind, targetId: r.input.targetId, invoiced: r.input.invoiced })), actor)
      : [];

    const { saved, owed } = await this.guardUnique(() =>
      inTx(async (tx) => {
        await this.assertFree(tx, companyId, haulierId, clean, resolved);
        const { lines: _lines, ...header } = clean;
        const saved = await haulierInvoiceRepository.insert(
          tx,
          {
            companyId,
            haulierCustomerId: haulierId,
            haulierName,
            ...header,
            bankAccountPublished: published,
            status: match.status,
            blockReasons,
            difference: match.difference,
            ...this.autoApproval(match.status, actor),
            ...this.fileValues(file),
            createdByUserId: actor.userID || null,
            createdBy: by,
            version: 1,
          },
          this.lineValues(resolved),
        );
        await this.event(tx, companyId, actor, by, "haulier_invoice_entered", saved.invoice, `Haulier invoice ${saved.invoice.invoiceNumber} entered: ${statusText(saved.invoice)}`);
        const owed = approved ? await this.writeReal(tx, companyId, plans, saved.lines) : [];
        if (approved) await this.event(tx, companyId, actor, by, "haulier_invoice_approved", saved.invoice, `Haulier invoice ${saved.invoice.invoiceNumber} approved automatically (exact match)`, AUTO_REASON);
        return { saved, owed };
      }),
    );
    await this.deliver(owed);
    return toInvoice(await this.load(companyId, saved.invoice.id), profile);
  }

  /** Any user. Saves the whole invoice again (DRAFT, NEEDS_APPROVAL or BLOCKED) with the version read; the status is worked out again. */
  async update(actor: Actor, id: string, input: HaulierInvoiceInput & { version: number }): Promise<HaulierInvoice> {
    const companyId = actor.companyID;
    const cur = await this.load(companyId, id);
    if (!Number.isInteger(input.version) || input.version < 1) throw bad("version must be the version you read");
    if (input.haulierCustomerId !== cur.invoice.haulierCustomerId) throw bad("The haulier of an invoice cannot be changed: reject it and enter a new one");
    if (!EDITABLE.includes(cur.invoice.status)) throw APIError.failedPrecondition(`An invoice that is ${cur.invoice.status.toLowerCase().replace("_", " ")} cannot be changed`);
    if (cur.invoice.version !== input.version) throw APIError.aborted(INVOICE_CONFLICT);
    const haulierId = cur.invoice.haulierCustomerId;
    const clean = cleanInvoiceInput(input);
    const profile = await this.profile(companyId, haulierId);
    const resolved = await this.resolve(companyId, haulierId, clean.currency, clean.lines);
    const { blockReasons, match, published } = this.assess(profile, clean, resolved);
    const by = await userName(actor.userID);
    const file = await this.storeFile(companyId, input.fileName, input.fileBase64);
    const approved = match.status === "APPROVED";
    const plans = approved
      ? await this.planReal(companyId, clean, resolved.map((r, n) => ({ id: String(n), targetKind: r.input.targetKind, targetId: r.input.targetId, invoiced: r.input.invoiced })), actor)
      : [];

    const owed = await this.guardUnique(() =>
      inTx(async (tx) => {
        await this.assertFree(tx, companyId, haulierId, clean, resolved, cur.invoice.id);
        const { lines: _lines, ...header } = clean;
        const row = await haulierInvoiceRepository.update(tx, companyId, cur.invoice.id, input.version, EDITABLE, {
          ...header,
          bankAccountPublished: published,
          status: match.status,
          blockReasons,
          difference: match.difference,
          ...this.autoApproval(match.status, actor),
          ...this.fileValues(file),
        });
        if (!row) throw APIError.aborted(INVOICE_CONFLICT);
        const lines = await haulierInvoiceRepository.replaceLines(tx, companyId, row.id, this.lineValues(resolved));
        await this.event(tx, companyId, actor, by, "haulier_invoice_updated", row, `Haulier invoice ${row.invoiceNumber} changed: ${statusText(row)}`);
        if (!approved) return [];
        const owed = await this.writeReal(tx, companyId, plans, lines);
        await this.event(tx, companyId, actor, by, "haulier_invoice_approved", row, `Haulier invoice ${row.invoiceNumber} approved automatically (exact match)`, AUTO_REASON);
        return owed;
      }),
    );
    await this.deliver(owed);
    return toInvoice(await this.load(companyId, cur.invoice.id), profile);
  }

  /**
   * Manager only, with a reason. Approves payment of an invoice with a difference. Refused - for
   * everyone - while the haulier fails the VAT bank-account check (worked out again now).
   */
  async approve(actor: Actor, id: string, reason: unknown): Promise<HaulierInvoice> {
    if (!isManager(actor.role)) throw APIError.permissionDenied("Only a manager can approve a haulier invoice");
    const why = cleanReason(reason, "approval");
    const companyId = actor.companyID;
    const cur = await this.load(companyId, id);
    if (cur.invoice.status === "APPROVED") throw APIError.failedPrecondition("The invoice is already approved");
    if (!APPROVABLE.includes(cur.invoice.status)) throw APIError.failedPrecondition(`An invoice that is ${cur.invoice.status.toLowerCase().replace("_", " ")} cannot be approved`);
    const profile = await this.profile(companyId, cur.invoice.haulierCustomerId);
    const blockReasons = invoiceBlockReasons(profile, cur.invoice.bankAccount);
    if (blockReasons.length) {
      throw APIError.failedPrecondition(`Payment cannot be approved (Czech VAT joint liability): ${blockReasons.join("; ")}`).withDetails({ blockReasons });
    }
    if (!cur.lines.length) throw APIError.failedPrecondition("The invoice has no lines");
    const by = await userName(actor.userID);
    const plans = await this.planReal(companyId, cur.invoice, cur.lines, actor);
    const owed = await inTx(async (tx) => {
      await haulierInvoiceRepository.lockHaulier(tx, companyId, cur.invoice.haulierCustomerId);
      const row = await haulierInvoiceRepository.update(tx, companyId, cur.invoice.id, cur.invoice.version, APPROVABLE, {
        status: "APPROVED",
        blockReasons: [],
        bankAccountPublished: bankAccountCheck(profile, cur.invoice.bankAccount).published,
        approvedAt: new Date(),
        approvedByUserId: actor.userID || null,
        approvedBy: by,
        approvalReason: why,
      });
      if (!row) throw APIError.aborted(INVOICE_CONFLICT);
      const owed = await this.writeReal(tx, companyId, plans, cur.lines);
      await this.event(tx, companyId, actor, by, "haulier_invoice_approved", row, `Haulier invoice ${row.invoiceNumber} approved with a difference of ${row.difference.toFixed(2)} ${row.currency}`, why);
      return owed;
    });
    await this.deliver(owed);
    return toInvoice(await this.load(companyId, cur.invoice.id), profile);
  }

  /** Manager only, with a reason. The invoice is not paid; its trips and deliveries may go on another invoice. */
  async reject(actor: Actor, id: string, reason: unknown): Promise<HaulierInvoice> {
    if (!isManager(actor.role)) throw APIError.permissionDenied("Only a manager can reject a haulier invoice");
    const why = cleanReason(reason, "rejection");
    const companyId = actor.companyID;
    const cur = await this.load(companyId, id);
    if (cur.invoice.status === "REJECTED") throw APIError.failedPrecondition("The invoice is already rejected");
    if (!EDITABLE.includes(cur.invoice.status)) throw APIError.failedPrecondition("An approved invoice cannot be rejected");
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      const row = await haulierInvoiceRepository.update(tx, companyId, cur.invoice.id, cur.invoice.version, EDITABLE, {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectedByUserId: actor.userID || null,
        rejectedBy: by,
        rejectReason: why,
      });
      if (!row) throw APIError.aborted(INVOICE_CONFLICT);
      await haulierInvoiceRepository.releaseLines(tx, companyId, row.id);
      await this.event(tx, companyId, actor, by, "haulier_invoice_rejected", row, `Haulier invoice ${row.invoiceNumber} rejected`, why);
    });
    const profile = await this.profile(companyId, cur.invoice.haulierCustomerId);
    return toInvoice(await this.load(companyId, cur.invoice.id), profile);
  }

  // A unique index refused the write (a save at the same moment got there first).
  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (isUniqueViolation(err)) throw APIError.alreadyExists("This invoice number or one of its trips is already on another invoice of the haulier");
      throw err;
    }
  }

  // ---- reading ----------------------------------------------------------------------------------

  async get(actor: Actor, id: string): Promise<HaulierInvoice> {
    const stored = await this.load(actor.companyID, id);
    return toInvoice(stored, await this.profile(actor.companyID, stored.invoice.haulierCustomerId));
  }

  async list(actor: Actor, filter: { status?: HaulierInvoiceStatus; haulierCustomerId?: string }): Promise<HaulierInvoice[]> {
    const status = filter.status || undefined;
    if (status && !["DRAFT", "MATCHED", "NEEDS_APPROVAL", "APPROVED", "BLOCKED", "REJECTED"].includes(status)) throw bad("Unknown status");
    const haulierCustomerId = filter.haulierCustomerId || undefined;
    if (haulierCustomerId && !isUuid(haulierCustomerId)) throw bad("Unknown haulier");
    const stored = await haulierInvoiceRepository.list(actor.companyID, { status, haulierCustomerId });
    const profiles = await haulierRepository.findMany(actor.companyID, [...new Set(stored.map((s) => s.invoice.haulierCustomerId))]);
    const profileOf = new Map(profiles.map((p) => [p.profile.customerId, toProfile(p)]));
    return stored.map((s) => toInvoice(s, profileOf.get(s.invoice.haulierCustomerId) ?? null));
  }

  /**
   * The haulier's done trips and partner deliveries not yet on an approved invoice (those on an
   * invoice still open are marked alreadyInvoiced), oldest first; expected = cost − claims.
   */
  async candidates(actor: Actor, haulierCustomerId: string): Promise<HaulierInvoiceCandidate[]> {
    const companyId = actor.companyID;
    if (typeof haulierCustomerId !== "string" || !isUuid(haulierCustomerId)) throw bad("Choose a haulier");
    const [trips, legs] = await Promise.all([
      haulierInvoiceRepository.doneTrips(companyId, haulierCustomerId),
      haulierInvoiceRepository.donePartnerLegs(companyId, haulierCustomerId),
    ]);
    const all: (Omit<HaulierInvoiceCandidate, "claimed" | "expected" | "alreadyInvoiced"> & { cost: number })[] = [
      ...trips.map((t) => ({ kind: "TRIP" as const, id: t.id, ref: t.ref, date: t.plannedPickupDate, cost: t.buy!.total, currency: t.buy!.currency })),
      ...legs.map(({ leg, consignment: c }) => ({
        kind: "PARTNER_LEG" as const,
        id: leg.id,
        ref: `${c.ref} partner delivery`,
        date: c.deliveredAt ? businessDay(c.deliveredAt) : c.pickupDate,
        cost: leg.buy!.total,
        currency: leg.buy!.currency,
      })),
    ];
    if (!all.length) return [];
    const targets = all.map((x) => ({ kind: x.kind, id: x.id }));
    const [uses, claims] = await Promise.all([haulierInvoiceRepository.targetUses(companyId, targets), haulierClaims.claimedFor(targets)]);
    const approved = new Set(uses.filter((u) => u.status === "APPROVED").map((u) => targetKey(u.targetKind, u.targetId)));
    const open = new Set(uses.filter((u) => u.status !== "APPROVED").map((u) => targetKey(u.targetKind, u.targetId)));
    return all
      .filter((x) => !approved.has(targetKey(x.kind, x.id)))
      .map(({ cost, ...x }) => {
        const claimed = round2(claims.get(x.id) ?? 0);
        return { ...x, expected: round2(cost - claimed), claimed, alreadyInvoiced: open.has(targetKey(x.kind, x.id)) };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  }

  /** The uploaded copy of the invoice. */
  async file(actor: Actor, id: string): Promise<FileDownload> {
    const { invoice } = await this.load(actor.companyID, id);
    if (!invoice.fileStorageKey || !invoice.fileName) throw APIError.notFound("No file was uploaded with this invoice");
    const bytes = await truckingDocumentBucket.download(invoice.fileStorageKey);
    return { fileName: invoice.fileName, fileBase64: bytes.toString("base64"), contentType: servedFileType(invoice.fileContentType ?? "") };
  }
}

/** The status in words for the history. */
function statusText(r: Pick<TruckingHaulierInvoiceRecord, "status" | "difference" | "currency" | "blockReasons">): string {
  switch (r.status) {
    case "APPROVED":
      return "exact match";
    case "BLOCKED":
      return `blocked - ${r.blockReasons.join("; ")}`;
    case "NEEDS_APPROVAL":
      return `difference ${r.difference.toFixed(2)} ${r.currency}, needs a manager's approval`;
    default:
      return r.status.toLowerCase();
  }
}

export const haulierInvoiceService = new HaulierInvoiceService();
