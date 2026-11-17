import { APIError } from "encore.dev/api";
import { shipmentClaimRepository, type ClaimFields } from "../repositories/shipmentClaim.repository";
import type { ShipmentClaimRecord } from "../schemas/shipmentClaim.schema";
import { isRealYmd } from "../../../lib/businessDate";
import { userEmailOf } from "../../../lib/companyUsers";
import { isUuid } from "../../../lib/uuid";
import { iso } from "../../../lib/db/serialize";
import { closingStamps, costClaimColumns, fillsCostFields, isClosedStatus, type CostClaimInput } from "../lib/costClaim";
import type { ClaimInput, ClaimItem, ClaimKind, ClaimStatus, CostClaimFact } from "../interfaces/interfaces";
import { shipmentService } from "./shipment.service";

const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];

/** At most this many ids of each kind in one ask for cost claims (the endpoint caps it too). */
export const COST_CLAIMS_MAX_IDS = 2000;

const item = (r: ShipmentClaimRecord): ClaimItem => ({
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
  closedAt: r.closedAt ? iso(r.closedAt) : null,
  closedBy: r.closedBy,
});

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

function check(input: ClaimInput): void {
  if (input.cargoState && !CARGO_STATES.includes(input.cargoState)) {
    throw APIError.invalidArgument(`Cargo state must be one of: ${CARGO_STATES.join(", ")}`);
  }
  if (input.noticeDate && !isRealYmd(input.noticeDate)) throw APIError.invalidArgument("The notice date must be a day as YYYY-MM-DD");
}

/** The input split into the free-text fields (as stored: a date column takes no empty text) and the cost fields. */
function split({ supplierInvoiceId, claimAmount, claimCurrency, status, noticeDate, ...text }: ClaimInput): { text: ClaimFields; cost: CostClaimInput } {
  return {
    text: noticeDate === undefined ? text : { ...text, noticeDate: noticeDate || null },
    cost: { supplierInvoiceId, claimAmount, claimCurrency, status },
  };
}

/**
 * The cost fields as stored, checked. Only a claim on costs is tied to a supplier invoice and
 * has a status: a claim on the shipment refuses them (empty ones only clear, so they pass).
 */
function costColumns(kind: ClaimKind, cost: CostClaimInput): ClaimFields {
  if (kind !== "cost" && fillsCostFields(cost)) {
    throw APIError.invalidArgument("Only a claim on costs has a supplier invoice, a claimed amount, a currency or a status");
  }
  const checked = costClaimColumns(cost);
  if ("problem" in checked) throw APIError.invalidArgument(checked.problem);
  return Object.fromEntries(Object.entries(checked.columns).filter(([, v]) => v !== undefined));
}

/** The closing stamps for a move from `previous` to `next`; who closes is looked up only when it closes. */
async function stampsFor(next: ClaimStatus | undefined, previous: ClaimStatus, userId: string): Promise<ClaimFields> {
  if (next === undefined) return {};
  const by = isClosedStatus(next) && next !== previous ? await userEmailOf(userId) : "";
  return closingStamps(next, previous, by, new Date()) ?? {};
}

class ClaimService {
  async list(shipmentId: string, companyId: string): Promise<ClaimItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    return (await shipmentClaimRepository.listByShipmentId(shipmentId, companyId)).map(item);
  }

  async create(shipmentId: string, companyId: string, kind: ClaimKind, input: ClaimInput, userId = ""): Promise<ClaimItem> {
    check(input);
    const { text, cost } = split(input);
    const columns = costColumns(kind, cost);
    // A claim can only be raised on one of the company's own shipments.
    await shipmentService.requireLive(shipmentId, companyId);
    // A new claim starts open; one created closed is stamped as closed now.
    const stamps = await stampsFor(columns.status, "open", userId);
    const row = await shipmentClaimRepository.createForCompany(companyId, { shipmentId, kind, ...text, ...columns, ...stamps });
    await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
    return item(row);
  }

  async update(shipmentId: string, id: string, companyId: string, input: ClaimInput, userId = ""): Promise<ClaimItem> {
    check(input);
    const { text, cost } = split(input);
    // Checked before anything is read: a bad value is refused whatever the claim is.
    costColumns("cost", cost);
    // A deleted shipment's claims are not shown, so they are not changed either (nor its Claim field).
    await shipmentService.requireLive(shipmentId, companyId);
    let columns: ClaimFields = {};
    if (Object.values(cost).some((v) => v !== undefined)) {
      // The claim's kind decides whether it takes cost fields, and its status whether the stamps move.
      const existing = await shipmentClaimRepository.findClaim(id, shipmentId, companyId);
      if (!existing) throw APIError.notFound("Claim not found");
      columns = costColumns(existing.kind, cost);
      columns = { ...columns, ...(await stampsFor(columns.status, existing.status, userId)) };
    }
    const row = await shipmentClaimRepository.updateClaim(id, shipmentId, companyId, { ...text, ...columns });
    if (!row) throw APIError.notFound("Claim not found");
    await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
    return item(row);
  }

  async delete(shipmentId: string, id: string, companyId: string): Promise<void> {
    await shipmentService.requireLive(shipmentId, companyId);
    if (!(await shipmentClaimRepository.deleteClaim(id, shipmentId, companyId))) throw APIError.notFound("Claim not found");
    await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
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
