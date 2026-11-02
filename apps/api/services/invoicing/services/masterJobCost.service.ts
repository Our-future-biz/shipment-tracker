import { APIError } from "encore.dev/api";
import { shipments } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import { masterJobCostRepository, type SplitRowValues } from "../repositories/masterJobCost.repository";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { buyingChanges } from "./invoicing.service";
import { masterJobRef, splitLine, type SplitHouse } from "../lib/masterJobSplit";
import type { MasterJobCostRecord, MasterJobSplitMethod, NewMasterJobCostRecord } from "../schemas/masterJobCost.schema";
import type { MasterJobCostInput, MasterJobCostItem, MasterJobCostsView, MasterJobShareItem } from "../interfaces/interfaces";

// A master job's buying costs (its Costs Breakdown). Each line is shared out over the master job's
// shipments - by W/M or equally, as the line says - and every shipment carries its share as a
// read-only row of its own Costs Breakdown. The shares are worked out again, as a set, whenever a
// line changes and whenever the master job's shipments or their weights do (resplit).

const SPLIT_METHODS: readonly MasterJobSplitMethod[] = ["wm", "shipment"];

const toItem = (r: MasterJobCostRecord): MasterJobCostItem => ({
  id: r.id,
  masterJobId: r.masterJobId,
  category: r.category,
  description: r.description,
  vendor: r.vendor,
  estQty: r.estQty,
  estAmount: r.estAmount,
  estCurrency: r.estCurrency,
  realQty: r.realQty,
  realAmount: r.realAmount,
  realCurrency: r.realCurrency,
  invoiceNumber: r.invoiceNumber,
  received: r.received,
  splitMethod: r.splitMethod,
  sortOrder: r.sortOrder,
});

function changesOf(input: MasterJobCostInput): Partial<NewMasterJobCostRecord> {
  if (input.splitMethod !== undefined && !SPLIT_METHODS.includes(input.splitMethod)) {
    throw APIError.invalidArgument('splitMethod must be "wm" or "shipment"');
  }
  // The same cleaning as a shipment's buying line (charge code, decimal amounts).
  const { haulierId: _h, unit: _u, ...line } = buyingChanges(input);
  return { ...line, ...(input.splitMethod !== undefined ? { splitMethod: input.splitMethod } : {}) } as Partial<NewMasterJobCostRecord>;
}

function assertMasterJobId(masterJobId: string) {
  if (!isUuid(masterJobId)) throw APIError.invalidArgument("masterJobId must be a master job id");
}

/** The master job's shipments with their freight tons, from the shipments service (refuses a master job not of the company). */
async function housesOf(masterJobId: string): Promise<SplitHouse[]> {
  const { houses } = await shipments.masterJobHouses({ masterJobId });
  return houses;
}

function sharesOf(lines: MasterJobCostRecord[], houses: SplitHouse[]): MasterJobShareItem[] {
  return lines.flatMap((line) => splitLine(line, houses).map((s) => ({ lineId: line.id, ...s })));
}

class MasterJobCostService {
  async view(companyId: string, masterJobId: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    const [houses, lines] = await Promise.all([housesOf(masterJobId), masterJobCostRepository.list(companyId, masterJobId)]);
    return { lines: lines.map(toItem), houses, shares: sharesOf(lines, houses) };
  }

  async add(companyId: string, masterJobId: string, input: MasterJobCostInput): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    await housesOf(masterJobId);
    await masterJobCostRepository.create(companyId, masterJobId, { category: "", ...changesOf(input) });
    return this.resplit(companyId, masterJobId);
  }

  async update(companyId: string, masterJobId: string, id: string, input: MasterJobCostInput): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    const row = await masterJobCostRepository.update(id, companyId, masterJobId, changesOf(input));
    if (!row) throw APIError.notFound("Master job cost not found");
    return this.resplit(companyId, masterJobId);
  }

  async remove(companyId: string, masterJobId: string, id: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    if (!(await masterJobCostRepository.softDelete(id, companyId, masterJobId))) throw APIError.notFound("Master job cost not found");
    return this.resplit(companyId, masterJobId);
  }

  /**
   * Works every line's shares out again over the master job's shipments as they are now and writes
   * them into the shipments' Costs Breakdowns, replacing the previous shares. A shipment priced from
   * a quote takes its estimate from the quote alone, so it gets the real part of a line only.
   */
  async resplit(companyId: string, masterJobId: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    const [houses, lines] = await Promise.all([housesOf(masterJobId), masterJobCostRepository.list(companyId, masterJobId)]);
    const shares = sharesOf(lines, houses);
    const quotePriced = new Set<string>();
    for (const shipmentId of new Set(shares.map((s) => s.shipmentId))) {
      if (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId)) quotePriced.add(shipmentId);
    }
    const byId = new Map(lines.map((l) => [l.id, l]));
    const rows: SplitRowValues[] = shares.flatMap((s) => {
      const line = byId.get(s.lineId)!;
      const est = quotePriced.has(s.shipmentId) ? null : s.est;
      if (est == null && s.real == null) return [];
      return [{
        shipmentId: s.shipmentId,
        category: line.category,
        description: line.description,
        vendor: line.vendor,
        estAmount: est,
        estCurrency: line.estCurrency,
        realAmount: s.real,
        realCurrency: line.realCurrency,
        invoiceNumber: line.invoiceNumber,
        received: line.received,
        sourceMasterJobRef: masterJobRef(masterJobId, line.id),
        lineSort: line.sortOrder,
      }];
    });
    await masterJobCostRepository.replaceSplitRows(companyId, masterJobId, rows);
    return { lines: lines.map(toItem), houses, shares };
  }
}

export const masterJobCostService = new MasterJobCostService();
