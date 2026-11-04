import { APIError } from "encore.dev/api";
import { customers, shipments } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import { businessDay } from "../../../lib/businessDate";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { summarizeSupplierCosts, supplierCostLine, typedNamesOf } from "../lib/supplierCosts";
import type { SupplierCostLine, SupplierCostsResponse } from "../interfaces/interfaces";

/** At most this many open lines of one supplier are read: the totals are over all of them (m1). */
const MAX_READ = 10_000;
/** The shipments service names at most this many jobs per call. */
const JOBS_PER_CALL = 500;
/** How many of each list the page gets; the totals and counts cover every line. */
const SHOWN = { owed: 300, expected: 200, untracked: 200 };

class SupplierCostsService {
  /**
   * "What we owe" a supplier from Costs Breakdown (Council Outlay 7, step 6b; Council Review 5): its open
   * lines with their jobs' numbers and due days, the totals of each currency over all of them, and the typed
   * vendor texts that name it but are not linked (lib/supplierCosts).
   */
  async forSupplier(companyId: string, supplierId: string): Promise<SupplierCostsResponse> {
    if (!isUuid(supplierId)) throw APIError.invalidArgument("Not a company id");
    // Read as the user (the call passes their auth along): a company they cannot open is not found. A haulier
    // whose terms were never saved there comes with Trucking's payment days.
    const { customer } = await customers.customerGet({ id: supplierId });
    const paymentDays = customer.supplierTerms.paymentDays;
    const [rows, vendors] = await Promise.all([
      invoiceCostRepository.openOfSupplier(companyId, supplierId, MAX_READ + 1),
      invoiceCostRepository.openTypedVendors(companyId),
    ]);
    const read = rows.slice(0, MAX_READ);
    const ids = [...new Set(read.map((r) => r.shipmentId))];
    const jobOf = new Map<string, { jobNumber: string; status: string }>();
    for (let i = 0; i < ids.length; i += JOBS_PER_CALL) {
      const { shipments: jobs } = await shipments._internalShipmentBasics({ ids: ids.slice(i, i + JOBS_PER_CALL) });
      for (const j of jobs) jobOf.set(j.id, j);
    }
    const today = businessDay(new Date());
    const lines = read.map((r) => supplierCostLine(r, jobOf.get(r.shipmentId), paymentDays, today)).filter((l): l is SupplierCostLine => l !== null);
    const summary = summarizeSupplierCosts(lines);
    return {
      owed: summary.owed.slice(0, SHOWN.owed),
      expected: summary.expected.slice(0, SHOWN.expected),
      untracked: summary.untracked.slice(0, SHOWN.untracked),
      totals: summary.totals,
      counts: { owed: summary.owed.length, expected: summary.expected.length, untracked: summary.untracked.length, withoutAmount: summary.withoutAmount, dueUnknown: summary.dueUnknown },
      paymentDays,
      typedNames: typedNamesOf(vendors, customer.companyName),
      truncated: rows.length > MAX_READ,
    };
  }
}

export const supplierCostsService = new SupplierCostsService();
