import { APIError } from "encore.dev/api";
import { shipmentClaimRepository } from "../repositories/shipmentClaim.repository";
import type { ShipmentClaimRecord } from "../schemas/shipmentClaim.schema";
import { isRealYmd } from "../../../lib/businessDate";
import { iso } from "../../../lib/db/serialize";
import type { ClaimInput, ClaimItem, ClaimKind } from "../interfaces/interfaces";
import { shipmentService } from "./shipment.service";

const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];

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
});

function check(input: ClaimInput): void {
  if (input.cargoState && !CARGO_STATES.includes(input.cargoState)) {
    throw APIError.invalidArgument(`Cargo state must be one of: ${CARGO_STATES.join(", ")}`);
  }
  if (input.noticeDate && !isRealYmd(input.noticeDate)) throw APIError.invalidArgument("The notice date must be a day as YYYY-MM-DD");
}

/** As stored: a date column takes no empty text. */
const fields = ({ noticeDate, ...rest }: ClaimInput) => (noticeDate === undefined ? rest : { ...rest, noticeDate: noticeDate || null });

class ClaimService {
  async list(shipmentId: string, companyId: string): Promise<ClaimItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    return (await shipmentClaimRepository.listByShipmentId(shipmentId, companyId)).map(item);
  }

  async create(shipmentId: string, companyId: string, kind: ClaimKind, input: ClaimInput): Promise<ClaimItem> {
    check(input);
    // A claim can only be raised on one of the company's own shipments.
    await shipmentService.requireLive(shipmentId, companyId);
    const row = await shipmentClaimRepository.createForCompany(companyId, { shipmentId, kind, ...fields(input) });
    await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
    return item(row);
  }

  async update(shipmentId: string, id: string, companyId: string, input: ClaimInput): Promise<ClaimItem> {
    check(input);
    // A deleted shipment's claims are not shown, so they are not changed either (nor its Claim field).
    await shipmentService.requireLive(shipmentId, companyId);
    const row = await shipmentClaimRepository.updateClaim(id, shipmentId, companyId, fields(input));
    if (!row) throw APIError.notFound("Claim not found");
    await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
    return item(row);
  }

  async delete(shipmentId: string, id: string, companyId: string): Promise<void> {
    await shipmentService.requireLive(shipmentId, companyId);
    if (!(await shipmentClaimRepository.deleteClaim(id, shipmentId, companyId))) throw APIError.notFound("Claim not found");
    await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
  }
}

export const claimService = new ClaimService();
