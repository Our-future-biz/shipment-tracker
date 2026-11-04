import { APIError } from "encore.dev/api";
import { customers, shipments } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { supplierCostLine, typedNamesOf } from "../lib/supplierCosts";
import type { SupplierCostLine, SupplierCostsResponse } from "../interfaces/interfaces";

/** At most this many open lines of one supplier are read (and so at most this many jobs): the newest. */
const MAX_LINES = 500;

class SupplierCostsService {
  /**
   * "What we owe" a supplier from Costs Breakdown (Council Outlay 7, step 6b): its open lines with
   * their jobs' numbers, and the typed vendor texts that name it but are not linked (lib/supplierCosts).
   */
  async forSupplier(companyId: string, supplierId: string): Promise<SupplierCostsResponse> {
    if (!isUuid(supplierId)) throw APIError.invalidArgument("Not a company id");
    // Read as the user (the call passes their auth along): a company they cannot open is not found.
    const { customer } = await customers.customerGet({ id: supplierId });
    const [rows, vendors] = await Promise.all([
      invoiceCostRepository.openOfSupplier(companyId, supplierId, MAX_LINES + 1),
      invoiceCostRepository.openTypedVendors(companyId),
    ]);
    const shown = rows.slice(0, MAX_LINES);
    const ids = [...new Set(shown.map((r) => r.shipmentId))];
    const jobs = ids.length ? (await shipments._internalShipmentBasics({ ids })).shipments : [];
    const jobOf = new Map(jobs.map((j) => [j.id, j]));
    const lines = shown.map((r) => supplierCostLine(r, jobOf.get(r.shipmentId))).filter((l): l is SupplierCostLine => l !== null);
    return { lines, typedNames: typedNamesOf(vendors, customer.companyName), truncated: rows.length > MAX_LINES };
  }
}

export const supplierCostsService = new SupplierCostsService();
