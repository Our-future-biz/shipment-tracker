import { APIError } from "encore.dev/api";
import { shipmentClaimRepository } from "../repositories/shipmentClaim.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import type { ClaimInput, ClaimItem, ClaimKind } from "../interfaces/interfaces";

const CLAIM_KINDS: ClaimKind[] = ["cargo", "cost"];
const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];

const item = (r: Awaited<ReturnType<typeof shipmentClaimRepository.listByShipmentId>>[number]): ClaimItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  kind: r.kind as ClaimKind,
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

  async create(shipmentId: string, companyId: string, kind: ClaimKind, input: ClaimInput) {
    if (!CLAIM_KINDS.includes(kind)) throw APIError.invalidArgument(`Claim kind must be one of: ${CLAIM_KINDS.join(", ")}`);
    check(input);
    // A claim can only be raised on one of the company's own shipments.
    if (!(await shipmentRepository.getByIdForCompany(shipmentId, companyId))) throw APIError.notFound("Shipment not found");
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
