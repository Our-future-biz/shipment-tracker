import { APIError } from "encore.dev/api";
import { isRealYmd } from "../../../lib/businessDate";
import { companyUsers, userEmailOf } from "../../../lib/companyUsers";
import { iso } from "../../../lib/db/serialize";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import type { Tx } from "../db/db";
import type { AnyClaimStatus, ClaimChangeInput, ClaimKind, CostClaimFact, ShipmentClaimView, ShipmentClaimsAnswer } from "../interfaces/interfaces";
import {
  ANY_CLAIM_STATUSES,
  CLAIM_HISTORY,
  CLAIM_STATUS_WORDS,
  cargoClaimColumns,
  cargoStateProblem,
  claimSummary,
  claimWords,
  fillsCargoFields,
  isOpenClaim,
  statusProblem,
  type CargoClaimInput,
} from "../lib/cargoClaim";
import { claimDeadlines, NO_DEADLINES, TIME_LIMITS_OFF, type ClaimTimeLimits } from "../lib/claimTimeLimits";
import { closingStamps, costClaimColumns, isClosedStatus, type CostClaimInput } from "../lib/costClaim";
import { isDetailsManager } from "../lib/shipmentEditRule";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentClaimRepository, type ClaimFields } from "../repositories/shipmentClaim.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import type { ShipmentClaimRecord } from "../schemas/shipmentClaim.schema";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import { claimTimeLimitsService } from "./claimTimeLimits.service";
import { shipmentService } from "./shipment.service";

// A shipment's claims (Council Outlay 11, D20, D21): on the shipment itself (cargo) - with a life of
// its own, an owner, amounts and the days the carrier and the insurer were told - and on a
// supplier's costs, tied to the supplier invoice Accounts Payable holds while the claim is open.
//
// Doors (D20): a claim on the shipment (cargo) is added and changed by the job's Handled By, its
// Holiday Cover or a manager (as the job's details are: a job nobody is named on is open to anyone -
// lib/shipmentEditRule). A claim on costs stays open to every user of the company (D15: Accounts
// Payable's "Raise claim" calls this same endpoint as the clerk). Either kind is deleted by a manager only. Its creation, every change of its status or owner and its
// deletion are written into the job's history, in the same turn as the claim and the job's Claim
// field (Yes while an OPEN claim stands), which is written into the history too when it changes.

const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];

/** At most this many ids of each kind in one ask for cost claims (the endpoint caps it too). */
export const COST_CLAIMS_MAX_IDS = 2000;

export const CLAIM_EDIT_REFUSAL = "Only the user in this shipment's Handled By or Holiday Cover, or a manager, can add or change its claims";
export const CLAIM_DELETE_REFUSAL = "Only a manager can delete a claim";
export const COST_ONLY_REFUSAL = "Only a claim on costs has a supplier invoice";
export const CARGO_ONLY_REFUSAL = "Only a claim on the shipment has an owner, an insurer's notice or a settled amount";
export const OWNER_NOT_A_USER = "The owner must be an active user of the company";
export const OWNERS_NOT_KNOWN = "The company's users could not be read just now, so the owner can't be checked: try again in a moment";
export const CLAIM_CHANGED_MEANWHILE = "This claim was changed meanwhile: open it again and save once more";

/** A claim as the Claims tab shows it, with its deadlines (cargo, while the time limits are on). */
export function claimView(r: ShipmentClaimRecord, deadlines = NO_DEADLINES): ShipmentClaimView {
  const cargo = r.kind === "cargo";
  return {
    id: r.id,
    shipmentId: r.shipmentId,
    kind: r.kind,
    cargoState: r.cargoState,
    note: r.note,
    supplier: r.supplier,
    invoiceNumber: r.invoiceNumber,
    reason: r.reason,
    amount: r.amount,
    noticeDate: r.noticeDate,
    createdAt: iso(r.createdAt),
    supplierInvoiceId: r.supplierInvoiceId,
    claimAmount: r.claimAmount,
    claimCurrency: r.claimCurrency,
    status: r.status,
    isOpen: isOpenClaim(r.kind, r.status),
    closedAt: r.closedAt ? iso(r.closedAt) : null,
    closedBy: r.closedBy,
    ownerUserId: r.ownerUserId,
    ownerName: r.ownerName,
    insurerNotifiedOn: r.insurerNotifiedOn,
    settledAmount: r.settledAmount,
    settledCurrency: r.settledCurrency,
    deadlineFrom: cargo ? deadlines.from : null,
    noticeDeadline: cargo ? deadlines.noticeBy : null,
    suitDeadline: cargo ? deadlines.suitBy : null,
  };
}

const fact = (r: ShipmentClaimRecord): CostClaimFact => ({
  id: r.id,
  shipmentId: r.shipmentId,
  supplierInvoiceId: r.supplierInvoiceId,
  supplier: r.supplier,
  invoiceNumber: r.invoiceNumber,
  reason: r.reason,
  amount: r.amount,
  claimAmount: r.claimAmount,
  claimCurrency: r.claimCurrency,
  status: r.status,
  noticeDate: r.noticeDate,
  createdAt: iso(r.createdAt),
});

/** The input in its four parts: the free text (as stored: a date column takes no empty text), the cost fields, the cargo fields, the owner. */
function split({ supplierInvoiceId, claimAmount, claimCurrency, status, noticeDate, ownerUserId, insurerNotifiedOn, settledAmount, settledCurrency, ...text }: ClaimChangeInput) {
  return {
    text: (noticeDate === undefined ? text : { ...text, noticeDate: noticeDate || null }) as ClaimFields,
    cost: { supplierInvoiceId, claimAmount, claimCurrency } satisfies CostClaimInput,
    cargo: { insurerNotifiedOn, settledAmount, settledCurrency } satisfies CargoClaimInput,
    status,
    ownerUserId,
  };
}

const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** What a claim of any kind may be sent, checked before anything is read: bad values are refused whatever the claim is. */
function checked(input: ClaimChangeInput): ReturnType<typeof split> & { columns: ClaimFields } {
  if (input.cargoState && !CARGO_STATES.includes(input.cargoState)) {
    throw APIError.invalidArgument(`Cargo state must be one of: ${CARGO_STATES.join(", ")}`);
  }
  if (input.noticeDate && !isRealYmd(input.noticeDate)) throw APIError.invalidArgument("The notice date must be a day as YYYY-MM-DD");
  const parts = split(input);
  if (parts.status !== undefined && !(ANY_CLAIM_STATUSES as readonly string[]).includes(parts.status)) {
    throw APIError.invalidArgument(`The claim status must be one of: ${ANY_CLAIM_STATUSES.join(", ")}`);
  }
  if (parts.ownerUserId && !isUuid(parts.ownerUserId)) throw APIError.invalidArgument("The owner must be given by their user id");
  const cost = costClaimColumns(parts.cost);
  if ("problem" in cost) throw APIError.invalidArgument(cost.problem);
  const cargo = cargoClaimColumns(parts.cargo);
  if ("problem" in cargo) throw APIError.invalidArgument(cargo.problem);
  return { ...parts, columns: { ...defined(cost.columns), ...defined(cargo.columns) } };
}

/** The fields of the one kind refused on the other, and the status checked against the kind's own. */
function checkKind(kind: ClaimKind, parts: ReturnType<typeof split>): void {
  if (parts.status !== undefined) {
    const problem = statusProblem(kind, parts.status);
    if (problem) throw APIError.invalidArgument(problem);
  }
  if (kind === "cargo" && (parts.cost.supplierInvoiceId ?? "").trim()) throw APIError.invalidArgument(COST_ONLY_REFUSAL);
  if (kind === "cost" && fillsCargoFields({ ...parts.cargo, ownerUserId: parts.ownerUserId })) throw APIError.invalidArgument(CARGO_ONLY_REFUSAL);
}

/** The owner a cargo claim is given: an active user of the company by id ("" for nobody), kept with their e-mail. */
async function ownerOf(ownerUserId: string): Promise<Pick<ClaimFields, "ownerUserId" | "ownerName">> {
  const id = ownerUserId.trim().toLowerCase();
  if (!id) return { ownerUserId: null, ownerName: "" };
  let users: Awaited<ReturnType<typeof companyUsers>>;
  try {
    users = await companyUsers();
  } catch {
    throw APIError.unavailable(OWNERS_NOT_KNOWN);
  }
  const user = users.find((u) => u.id.toLowerCase() === id);
  if (!user) throw APIError.invalidArgument(OWNER_NOT_A_USER);
  return { ownerUserId: user.id, ownerName: user.email };
}

/** The closing stamps for a move from `previous` to `next`; who closes is looked up only when it closes. */
async function stampsFor(next: AnyClaimStatus | undefined, previous: AnyClaimStatus, userId: string): Promise<ClaimFields> {
  if (next === undefined) return {};
  const by = isClosedStatus(next) && next !== previous ? await userEmailOf(userId) : "";
  return closingStamps(next, previous, by, new Date()) ?? {};
}

/** A live shipment of the company, or not found. */
async function liveShipment(shipmentId: string, companyId: string): Promise<ShipmentRecord> {
  const shipment = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, companyId) : null;
  if (!shipment) throw APIError.notFound("Shipment not found");
  return shipment;
}

/** The door of a claim of this kind: a cargo claim the job's people's or a manager's, a claim on costs anyone's (D15). */
async function assertMayEdit(kind: ClaimKind, shipment: ShipmentRecord, actor: Actor): Promise<void> {
  if (kind !== "cargo") return;
  if (!(await shipmentService.mayChangeDetails(shipment, actor.userID, actor.role))) throw APIError.permissionDenied(CLAIM_EDIT_REFUSAL);
}

/**
 * The company's time limits for the answer of a write, read before its turn: a claim that is saved
 * never answers an error. A read that fails gives the answer no deadlines (as if they were off);
 * the Claims tab reads them again with the list.
 */
const limitsForAnswer = (companyId: string): Promise<ClaimTimeLimits> => claimTimeLimitsService.of(companyId).catch(() => TIME_LIMITS_OFF);

/** A cargo claim's state after a write: what its status asks for is checked on it. */
function checkCargoState(after: Pick<ShipmentClaimRecord, "status" | "noticeDate" | "insurerNotifiedOn" | "settledAmount" | "settledCurrency">): void {
  const problem = cargoStateProblem(after);
  if (problem) throw APIError.invalidArgument(problem);
}

/** The job's history lines of one write. */
type Line = { field: string; oldValue: string | null; newValue: string | null };

/** Writes the lines, keeps the job's Claim field in step and writes its change too - all in the turn `tx`. */
async function recordAndSync(tx: Tx, actor: Actor, shipmentId: string, lines: readonly Line[]): Promise<void> {
  const flag = await shipmentClaimRepository.syncShipmentFlag(shipmentId, actor.companyID, tx);
  const all = flag && flag.before !== flag.after ? [...lines, { field: CLAIM_HISTORY.flag, oldValue: flag.before, newValue: flag.after }] : lines;
  for (const line of all) await shipmentAuditRepository.create({ companyId: actor.companyID, shipmentId, userId: actor.userID, ...line }, tx);
}

const statusLine = (claim: Parameters<typeof claimWords>[0], before: AnyClaimStatus, after: AnyClaimStatus): Line => ({
  field: CLAIM_HISTORY.status,
  oldValue: `${claimWords(claim)}: ${CLAIM_STATUS_WORDS[before]}`,
  newValue: `${claimWords(claim)}: ${CLAIM_STATUS_WORDS[after]}`,
});

class ClaimService {
  /** The job's deadlines for its cargo claims, while the time limits are on. */
  private deadlines(shipment: ShipmentRecord, limits: ClaimTimeLimits) {
    return claimDeadlines(shipment, limits);
  }

  async list(actor: Actor, shipmentId: string): Promise<ShipmentClaimsAnswer> {
    const shipment = await liveShipment(shipmentId, actor.companyID);
    const [rows, limits, mayEdit] = await Promise.all([
      shipmentClaimRepository.listByShipmentId(shipmentId, actor.companyID),
      claimTimeLimitsService.of(actor.companyID),
      shipmentService.mayChangeDetails(shipment, actor.userID, actor.role),
    ]);
    const deadlines = this.deadlines(shipment, limits);
    return { claims: rows.map((r) => claimView(r, deadlines)), timeLimitsOn: limits.enabled, mayEdit, mayEditCost: true, mayDelete: isDetailsManager(actor.role) };
  }

  async create(actor: Actor, shipmentId: string, kind: ClaimKind, input: ClaimChangeInput): Promise<ShipmentClaimView> {
    const parts = checked(input);
    checkKind(kind, parts);
    // A claim can only be raised on one of the company's own live shipments; a cargo claim by the job's people or a manager.
    const shipment = await liveShipment(shipmentId, actor.companyID);
    await assertMayEdit(kind, shipment, actor);
    const status = (parts.status ?? "open") as AnyClaimStatus;
    // A new cargo claim is looked after by whoever raised it, unless somebody is named. When who
    // raised it can't be read it is nobody's: an owner can be named afterwards.
    const owner =
      kind !== "cargo"
        ? {}
        : parts.ownerUserId !== undefined
          ? await ownerOf(parts.ownerUserId)
          : { ownerUserId: actor.userID, ownerName: await userEmailOf(actor.userID).catch(() => "") };
    const values = { shipmentId, kind, ...parts.text, ...parts.columns, ...owner, ...(parts.status !== undefined ? { status } : {}) };
    if (kind === "cargo") {
      checkCargoState({ status, noticeDate: values.noticeDate ?? null, insurerNotifiedOn: values.insurerNotifiedOn ?? null, settledAmount: values.settledAmount ?? null, settledCurrency: values.settledCurrency ?? "" });
    }
    // A new claim starts open; one created closed is stamped as closed now.
    const stamps = await stampsFor(parts.status as AnyClaimStatus | undefined, "open", actor.userID);
    const limits = await limitsForAnswer(actor.companyID);
    const row = await shipmentClaimRepository.inTransaction(async (tx) => {
      const created = await shipmentClaimRepository.insertClaim(actor.companyID, { ...values, ...stamps }, tx);
      await recordAndSync(tx, actor, shipmentId, [{ field: CLAIM_HISTORY.created, oldValue: null, newValue: claimSummary(created) }]);
      return created;
    });
    return claimView(row, this.deadlines(shipment, limits));
  }

  async update(actor: Actor, shipmentId: string, id: string, input: ClaimChangeInput): Promise<ShipmentClaimView> {
    const parts = checked(input);
    // A deleted shipment's claims are not shown, so they are not changed either (nor its Claim field).
    const shipment = await liveShipment(shipmentId, actor.companyID);
    const existing = isUuid(id) ? await shipmentClaimRepository.findClaim(id, shipmentId, actor.companyID) : null;
    if (!existing) throw APIError.notFound("Claim not found");
    // The stored claim's kind decides the door.
    await assertMayEdit(existing.kind, shipment, actor);
    checkKind(existing.kind, parts);
    const owner = existing.kind === "cargo" && parts.ownerUserId !== undefined ? await ownerOf(parts.ownerUserId) : {};
    const status = parts.status as AnyClaimStatus | undefined;
    const data: ClaimFields = { ...parts.text, ...parts.columns, ...owner, ...(status !== undefined ? { status } : {}) };
    const after = { ...existing, ...data } as ShipmentClaimRecord;
    if (existing.kind === "cargo") checkCargoState(after);
    // The status decides whether the stamps move.
    Object.assign(data, await stampsFor(status, existing.status, actor.userID));
    const limits = await limitsForAnswer(actor.companyID);
    const row = await shipmentClaimRepository.inTransaction(async (tx) => {
      // What the history says it was is what it was: a change saved meanwhile is not written over unseen.
      const locked = await shipmentClaimRepository.findClaim(existing.id, shipmentId, actor.companyID, tx, true);
      if (!locked) throw APIError.notFound("Claim not found");
      if (locked.status !== existing.status || locked.ownerUserId !== existing.ownerUserId) throw APIError.aborted(CLAIM_CHANGED_MEANWHILE);
      const saved = await shipmentClaimRepository.updateClaim(existing.id, shipmentId, actor.companyID, data, tx);
      if (!saved) throw APIError.notFound("Claim not found");
      const lines: Line[] = [];
      if (saved.status !== existing.status) lines.push(statusLine(saved, existing.status, saved.status));
      if (saved.ownerUserId !== existing.ownerUserId) {
        lines.push({ field: CLAIM_HISTORY.owner, oldValue: `${claimWords(saved)}: ${existing.ownerName || "nobody"}`, newValue: `${claimWords(saved)}: ${saved.ownerName || "nobody"}` });
      }
      await recordAndSync(tx, actor, shipmentId, lines);
      return saved;
    });
    return claimView(row, this.deadlines(shipment, limits));
  }

  /** A manager only; what was deleted is kept in the job's history. */
  async delete(actor: Actor, shipmentId: string, id: string): Promise<void> {
    if (!isDetailsManager(actor.role)) throw APIError.permissionDenied(CLAIM_DELETE_REFUSAL);
    await liveShipment(shipmentId, actor.companyID);
    if (!isUuid(id)) throw APIError.notFound("Claim not found");
    await shipmentClaimRepository.inTransaction(async (tx) => {
      const deleted = await shipmentClaimRepository.deleteClaim(id, shipmentId, actor.companyID, tx);
      if (!deleted) throw APIError.notFound("Claim not found");
      await recordAndSync(tx, actor, shipmentId, [{ field: CLAIM_HISTORY.deleted, oldValue: claimSummary(deleted), newValue: null }]);
    });
  }

  /**
   * The company's live claims on costs on any of the shipments or against any of the supplier
   * invoices (for Accounts Payable: an open one holds the invoice's payment). Ids that are no ids
   * match nothing; with none of either, nothing is read.
   */
  async costClaims(companyId: string, shipmentIds: string[] = [], supplierInvoiceIds: string[] = []): Promise<CostClaimFact[]> {
    const ids = (list: string[]) => [...new Set(list.filter(isUuid).map((v) => v.toLowerCase()))];
    const shipments = ids(shipmentIds);
    const invoices = ids(supplierInvoiceIds);
    if (shipments.length > COST_CLAIMS_MAX_IDS || invoices.length > COST_CLAIMS_MAX_IDS) {
      throw APIError.invalidArgument(`At most ${COST_CLAIMS_MAX_IDS} shipments and ${COST_CLAIMS_MAX_IDS} supplier invoices at once`);
    }
    if (!shipments.length && !invoices.length) return [];
    return (await shipmentClaimRepository.listCostClaims(companyId, shipments, invoices)).map(fact);
  }
}

export const claimService = new ClaimService();
