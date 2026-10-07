import { APIError } from "encore.dev/api";
import { shipmentClaimRepository } from "../repositories/shipmentClaim.repository";
import type { ClaimInput, ClaimItem } from "../interfaces/interfaces";

export const CLAIM_KINDS = ["cargo", "cost"];
export const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];

const item = (r: Awaited<ReturnType<typeof shipmentClaimRepository.listByShipmentId>>[number]): ClaimItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  kind: r.kind,
  cargoState: r.cargoState,
  note: r.note,
  supplier: r.supplier,
  invoiceNumber: r.invoiceNumber,
  reason: r.reason,
  amount: r.amount,
  createdAt: r.createdAt.toISOString(),
});

function check(input: ClaimInput) {
  if (input.cargoState && !CARGO_STATES.includes(input.cargoState)) {
    throw APIError.invalidArgument(`Cargo state must be one of: ${CARGO_STATES.join(", ")}`);
  }
}

class ClaimService {
  async list(shipmentId: string, companyId: string) {
    return (await shipmentClaimRepository.listByShipmentId(shipmentId, companyId)).map(item);
  }

  async create(shipmentId: string, companyId: string, kind: string, input: ClaimInput) {
    if (!CLAIM_KINDS.includes(kind)) throw APIError.invalidArgument(`Claim kind must be one of: ${CLAIM_KINDS.join(", ")}`);
    check(input);
    const row = await shipmentClaimRepository.create({ companyId, shipmentId, kind, ...input });
    await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
    return item(row);
  }

  async update(id: string, companyId: string, input: ClaimInput) {
    check(input);
    const row = await shipmentClaimRepository.update(id, companyId, input);
    if (!row) throw APIError.notFound("Claim not found");
    await shipmentClaimRepository.syncShipmentFlag(row.shipmentId, companyId);
    return item(row);
  }

  async delete(id: string, companyId: string) {
    const shipmentId = await shipmentClaimRepository.delete(id, companyId);
    if (shipmentId) await shipmentClaimRepository.syncShipmentFlag(shipmentId, companyId);
  }
}

export const claimService = new ClaimService();
