import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, shipments, trucking } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import { businessDay } from "../../../lib/businessDate";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import {
  CANCELLED_STATUS,
  expectsCosts,
  seesTruckingConcept,
  summarizeHaulierInvoices,
  supplierCostLine,
  supplierCostLists,
  supplierCostTotals,
  typedNamesOf,
  type SupplierCostJob,
} from "../lib/supplierCosts";
import type { SupplierCostLine, SupplierCostsResponse, SupplierHaulierInvoices, SupplierHaulierInvoicesStatus, SupplierUsageResponse } from "../interfaces/interfaces";

/** The shipments service names at most this many jobs per call. */
const JOBS_PER_CALL = 500;
/** At most this many of a supplier's jobs are looked at for its open ones (the newest). */
const MAX_JOBS = 2_000;
/** Jobs that are done with: billed (any direction) or cancelled. */
const finished = (status: string) => status.startsWith("Billed") || status === CANCELLED_STATUS;

/** How many of each list the page gets; the totals and counts cover every line. */
const SHOWN = { owed: 300, expected: 200, untracked: 200 };

/** No haulier invoices in What we owe, and why. */
const noHaulierInvoices = (status: SupplierHaulierInvoicesStatus): SupplierHaulierInvoices => ({
  status,
  owed: [],
  untracked: [],
  totals: [],
  counts: { owed: 0, untracked: 0, dueUnknown: 0 },
  truncated: false,
});

/** The jobs of these shipments: asked JOBS_PER_CALL at a time, the calls all at once. */
async function jobsOf(ids: string[]): Promise<Map<string, SupplierCostJob & { id: string }>> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += JOBS_PER_CALL) batches.push(ids.slice(i, i + JOBS_PER_CALL));
  const answers = await Promise.all(batches.map((batch) => shipments._internalShipmentBasics({ ids: batch })));
  return new Map(answers.flatMap((a) => a.shipments.map((j) => [j.id, j] as const)));
}

class SupplierCostsService {
  /**
   * "What we owe" a supplier from Costs Breakdown (Council Outlay 7, step 6b; Council Review 5): the totals of
   * each currency over all of its open lines (added up by the database, C-2), the most urgent owed, the newest
   * expected and untracked lines with their jobs' numbers and due days, and the typed vendor texts that name it
   * but are not linked (lib/supplierCosts). A haulier's approved Trucking invoices not yet paid come apart, for
   * those who see the Trucking Concept (C-1).
   */
  async forSupplier(companyId: string, supplierId: string, role: string): Promise<SupplierCostsResponse> {
    if (!isUuid(supplierId)) throw APIError.invalidArgument("Not a company id");
    // Read as the user (the call passes their auth along): a company they cannot open is not found. A haulier
    // whose terms were never saved there comes with Trucking's payment days.
    const { customer } = await customers.customerGet({ id: supplierId });
    const paymentDays = customer.supplierTerms.paymentDays;
    const today = businessDay(new Date());
    const [received, expectedGroups, owedRows, untrackedRows, vendors, haulierInvoices] = await Promise.all([
      invoiceCostRepository.openReceivedTotals(companyId, supplierId, paymentDays, today),
      invoiceCostRepository.openExpectedByShipment(companyId, supplierId),
      invoiceCostRepository.openOwed(companyId, supplierId, SHOWN.owed),
      invoiceCostRepository.openUntracked(companyId, supplierId, SHOWN.untracked),
      invoiceCostRepository.openTypedVendors(companyId),
      this.haulierInvoices(supplierId, customer.roles.includes("haulier"), role, today),
    ]);
    // What is expected on a cancelled job, or on one gone, is not counted: its jobs are read first, then the
    // expected lines listed are the newest of those that count. What was received is owed whatever the job's
    // status (a deleted shipment's lines are retired with it).
    const jobOf = await jobsOf([...new Set([...expectedGroups, ...owedRows, ...untrackedRows].map((r) => r.shipmentId))]);
    const notExpected = [...new Set(expectedGroups.filter((g) => !expectsCosts(jobOf.get(g.shipmentId))).map((g) => g.shipmentId))];
    const expectedRows = await invoiceCostRepository.openExpected(companyId, supplierId, notExpected, SHOWN.expected);
    const lines = [...owedRows, ...expectedRows, ...untrackedRows]
      .map((r) => supplierCostLine(r, jobOf.get(r.shipmentId), paymentDays, today))
      .filter((l): l is SupplierCostLine => l !== null);
    const { totals, counts } = supplierCostTotals(received, expectedGroups, jobOf, paymentDays);
    return {
      ...supplierCostLists(lines),
      totals,
      counts,
      paymentDays,
      typedNames: typedNamesOf(vendors, customer.companyName),
      haulierInvoices,
    };
  }

  /**
   * A haulier's approved Trucking invoices not yet paid, with VAT, for a caller who sees the Trucking Concept. When
   * Trucking cannot be read the costs are shown all the same, saying so.
   */
  private async haulierInvoices(supplierId: string, isHaulier: boolean, role: string, today: string): Promise<SupplierHaulierInvoices> {
    if (!isHaulier) return noHaulierInvoices("none");
    if (!seesTruckingConcept(role)) return noHaulierInvoices("hidden");
    try {
      const { invoices, truncated } = await trucking._internalHaulierInvoicesUnpaid({ customerId: supplierId });
      return { status: "included", ...summarizeHaulierInvoices(invoices, today, SHOWN), truncated };
    } catch (err) {
      log.warn(err, "invoicing: a haulier's unpaid Trucking invoices were not read", { supplierId });
      return noHaulierInvoices("unavailable");
    }
  }

  /**
   * A supplier's open jobs (shipments it is on that are neither billed nor cancelled) and when it was last put
   * on one, for its page: the "Open jobs" tile, and the low-rating warning, which is for a supplier in use.
   */
  async usage(companyId: string, supplierId: string): Promise<SupplierUsageResponse> {
    if (!isUuid(supplierId)) throw APIError.invalidArgument("Not a company id");
    const rows = await invoiceCostRepository.linkedShipments(companyId, supplierId, MAX_JOBS + 1);
    const read = rows.slice(0, MAX_JOBS);
    const jobs = await jobsOf(read.map((r) => r.shipmentId));
    const openJobs = [...jobs.values()].filter((j) => !finished(j.status)).length;
    return { openJobs, capped: rows.length > MAX_JOBS, lastUsedAt: read[0] ? read[0].lastAt.toISOString() : null };
  }
}

export const supplierCostsService = new SupplierCostsService();
