import { isUuid } from "../../../lib/uuid";
import type { AdrPackingGroup, CargoDimensionLine, PalletType } from "../interfaces/interfaces";
import { cargoDimensionRepository } from "../repositories/cargoDimension.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import type { CargoDimensionRecord } from "../schemas/cargoDimension.schema";

/** What the Loading Planner is told about a shipment a plan links to. */
export interface ShipmentJobRef {
  /** The shipment's Internal Reference as it is now; null when the company has no such live shipment. */
  jobNumber: string | null;
  /** Asked with the cargo, of a live shipment: its Dimensions rows (Cargo Details) and the dimensions booked with its quote. */
  cargo?: { cargoDimensions: CargoDimensionLine[]; bookedDimensions: CargoDimensionLine[] };
}

// A Dimensions row as the shipment's page has it (Cargo Details).
const dimensionLineOf = (row: CargoDimensionRecord): CargoDimensionLine => ({
  containerId: row.containerId,
  pieces: row.pieces,
  lengthCm: row.lengthCm,
  widthCm: row.widthCm,
  heightCm: row.heightCm,
  dimensionUnit: row.dimensionUnit === "in" ? "in" : "cm",
  weightPerPcKg: row.weightPerPcKg,
  volumePerPcM3: row.volumePerPcM3,
  packageType: row.packageType,
  stackable: row.stackable,
  palletType: row.palletType as PalletType | null,
  adrUn: row.adrUn,
  adrClass: row.adrClass,
  adrPackingGroup: row.adrPackingGroup as AdrPackingGroup | null,
  adrLimitedQuantity: row.adrLimitedQuantity,
});

/**
 * The Internal Reference (job number) of the company's live shipment, as it is now - asked by the
 * Loading Planner before it saves a plan linked to a shipment, and when it opens one. Null when the
 * company has no such live shipment; an id that is no id names none, and is answered so before
 * Postgres refuses it with an error of its own. `withCargo` (a plan being opened): the shipment's
 * cargo too, to judge the plan's cargo by. Booked dimensions not yet copied from the quote (the
 * shipment's page copies them when it is opened) count as none.
 */
export async function shipmentJobRefOf(shipmentId: string, companyId: string, withCargo = false): Promise<ShipmentJobRef> {
  if (!isUuid(shipmentId)) return { jobNumber: null };
  const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
  if (!shipment) return { jobNumber: null };
  if (!withCargo) return { jobNumber: shipment.jobNumber };
  const rows = await cargoDimensionRepository.listByShipmentId(shipment.id, companyId);
  return { jobNumber: shipment.jobNumber, cargo: { cargoDimensions: rows.map(dimensionLineOf), bookedDimensions: shipment.bookedDimensions ?? [] } };
}
