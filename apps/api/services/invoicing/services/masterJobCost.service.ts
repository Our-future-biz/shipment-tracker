import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { fx, shipments } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import { masterJobCostRepository, type SplitRowValues } from "../repositories/masterJobCost.repository";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { sameCostCodes } from "../utils/truckingLines.utils";
import { assertNotKeptByTrucking, buyingChanges } from "./invoicing.service";
import { housesInSplit, masterJobRef, splitLine, splitWeights, type SplitHouse } from "../lib/masterJobSplit";
import { lineVsEstimate, totalVsEstimate, type LineVsEstimate } from "../lib/masterJobVsEstimate";
import type { MasterJobCostRecord, MasterJobSplitMethod, NewMasterJobCostRecord } from "../schemas/masterJobCost.schema";
import type { MasterJobCostInput, MasterJobCostItem, MasterJobCostsView, MasterJobCostUpdate, MasterJobShareItem } from "../interfaces/interfaces";

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
  excludedShipmentIds: r.excludedShipmentIds,
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

/** The shipments to leave out of a line, kept to those linked now; a line can't leave out all of them. */
function excludedAmong(ids: string[], houses: SplitHouse[]): string[] {
  if (!Array.isArray(ids)) throw APIError.invalidArgument("excludedShipmentIds must be a list of shipments");
  const excluded = houses.filter((h) => ids.includes(h.shipmentId)).map((h) => h.shipmentId);
  if (houses.length > 0 && excluded.length === houses.length) throw APIError.failedPrecondition("At least one shipment stays in the split");
  return excluded;
}

function assertMasterJobId(masterJobId: string) {
  if (!isUuid(masterJobId)) throw APIError.invalidArgument("masterJobId must be a master job id");
}

/** The master job's shipments with their freight tons, from the shipments service (refuses a master job not of the company). */
async function housesOf(masterJobId: string): Promise<SplitHouse[]> {
  const { houses } = await shipments._internalMasterJobHouses({ masterJobId });
  return houses;
}

function sharesOf(lines: MasterJobCostRecord[], houses: SplitHouse[]): MasterJobShareItem[] {
  return lines.flatMap((line) => splitLine(line, houses).map((s) => ({ lineId: line.id, ...s })));
}

const truckingKey = (shipmentId: string, code: string) => `${shipmentId} ${code}`;

/** The lines, shipments and shares, as a re-split leaves them (the view without its estimates). */
type SplitView = Pick<MasterJobCostsView, "lines" | "houses" | "shares">;

// CZK per 1 unit of a currency at today's ČNB fixing. Without the rates (fx can't be read) only
// lines in one currency are compared.
async function czkRatesToday(): Promise<(currency: string) => number | null> {
  let rates = new Map<string, number>();
  try {
    rates = new Map((await fx.fxRatesOn({})).rates.map((r) => [r.currency, r.rate]));
  } catch (err) {
    log.warn(err, "today's ČNB rates could not be read; master job costs in two currencies are not compared");
  }
  return (currency) => (currency === "CZK" ? 1 : (rates.get(currency) ?? null));
}

/** The view with every line against its estimate, and the whole master job's (Profit Burning / Optimalization). */
async function withVsEstimate(view: SplitView): Promise<MasterJobCostsView> {
  const czkPer = await czkRatesToday();
  const compared = view.lines.flatMap((l): [string, LineVsEstimate][] => {
    const vs = lineVsEstimate(l, czkPer);
    return vs ? [[l.id, vs]] : [];
  });
  return {
    ...view,
    vsEstimate: Object.fromEntries(compared.map(([id, { delta, currency }]) => [id, { delta, currency }])),
    totalVsEstimate: totalVsEstimate(compared.map(([, vs]) => vs)),
  };
}

/**
 * The shares as the shipments carry them: a shipment priced from a quote takes its estimate from
 * the quote alone, so it gets the real part of a line only; a shipment whose cost of the line's
 * code Trucking keeps gets no part (the haulier's cost is there from the trip and would count twice).
 */
async function sharesAsWritten(companyId: string, lines: MasterJobCostRecord[], houses: SplitHouse[]): Promise<MasterJobShareItem[]> {
  const shares = sharesOf(lines, houses);
  const ids = [...new Set(shares.map((s) => s.shipmentId))];
  const codes = [...new Set(lines.flatMap((l) => (l.category ? sameCostCodes(l.category) : [])))];
  const [quotePriced, keptByTrucking] = await Promise.all([
    invoiceCostRepository.quotePricedAmong(companyId, ids),
    truckingLinesRepository.keptBuyingCodes(companyId, ids, codes),
  ]);
  const byId = new Map(lines.map((l) => [l.id, l]));
  return shares.flatMap((s) => {
    const line = byId.get(s.lineId)!;
    if (line.category && sameCostCodes(line.category).some((code) => keptByTrucking.has(truckingKey(s.shipmentId, code)))) return [];
    const est = quotePriced.has(s.shipmentId) ? null : s.est;
    return est == null && s.real == null ? [] : [{ ...s, est }];
  });
}

/** Refuses a line Trucking already keeps on one of the shipments that would carry a part of it. */
async function assertNotKeptByTruckingFor(
  companyId: string,
  houses: SplitHouse[],
  line: Pick<MasterJobCostRecord, "category" | "splitMethod"> & Partial<Pick<MasterJobCostRecord, "excludedShipmentIds">>,
): Promise<void> {
  if (!line.category) return;
  const inSplit = housesInSplit(line, houses);
  const weights = splitWeights(line.splitMethod, inSplit);
  await assertNotKeptByTrucking(companyId, inSplit.filter((_, i) => weights[i]! > 0).map((h) => h.shipmentId), line.category);
}

class MasterJobCostService {
  async view(companyId: string, masterJobId: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    const [houses, lines] = await Promise.all([housesOf(masterJobId), masterJobCostRepository.list(companyId, masterJobId)]);
    return withVsEstimate({ lines: lines.map(toItem), houses, shares: await sharesAsWritten(companyId, lines, houses) });
  }

  async add(companyId: string, masterJobId: string, input: MasterJobCostInput): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    const values = { category: "", ...changesOf(input) };
    // housesOf also refuses a master job that is not the company's.
    await assertNotKeptByTruckingFor(companyId, await housesOf(masterJobId), { category: values.category ?? "", splitMethod: values.splitMethod ?? "wm" });
    await masterJobCostRepository.create(companyId, masterJobId, values);
    return withVsEstimate(await this.resplit(companyId, masterJobId));
  }

  async update(companyId: string, masterJobId: string, id: string, input: MasterJobCostUpdate): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    if (!isUuid(id)) throw APIError.notFound("Master job cost not found");
    const { excludedShipmentIds, ...fields } = input;
    const changes = changesOf(fields);
    const current = await masterJobCostRepository.get(id, companyId, masterJobId);
    if (!current) throw APIError.notFound("Master job cost not found");
    const newCodeOrSplit = changes.category !== undefined || changes.splitMethod !== undefined;
    const houses = excludedShipmentIds !== undefined || newCodeOrSplit ? await housesOf(masterJobId) : [];
    if (excludedShipmentIds !== undefined) changes.excludedShipmentIds = excludedAmong(excludedShipmentIds, houses);
    // A new charge code or split is checked against Trucking, and so is a shipment put back in the
    // split; a share Trucking came to keep since is left out of the split (sharesAsWritten), so the
    // line's other fields, and taking another shipment out, stay possible.
    const next = { ...current, ...changes } as MasterJobCostRecord;
    if (next.category && newCodeOrSplit) {
      await assertNotKeptByTruckingFor(companyId, houses, next);
    } else if (next.category && excludedShipmentIds !== undefined) {
      const backIn = houses.filter((h) => current.excludedShipmentIds.includes(h.shipmentId) && !next.excludedShipmentIds.includes(h.shipmentId));
      await assertNotKeptByTruckingFor(companyId, backIn, next);
    }
    const row = await masterJobCostRepository.update(id, companyId, masterJobId, changes);
    if (!row) throw APIError.notFound("Master job cost not found");
    return withVsEstimate(await this.resplit(companyId, masterJobId));
  }

  async remove(companyId: string, masterJobId: string, id: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    if (!isUuid(id) || !(await masterJobCostRepository.softDelete(id, companyId, masterJobId))) throw APIError.notFound("Master job cost not found");
    return withVsEstimate(await this.resplit(companyId, masterJobId));
  }

  /**
   * Works every line's shares out again over the master job's shipments as they are now and writes
   * them into the shipments' Costs Breakdowns, replacing the previous shares (sharesAsWritten).
   * Worked out under the master job's lock, so a re-split that writes last read the latest lines.
   */
  async resplit(companyId: string, masterJobId: string): Promise<SplitView> {
    assertMasterJobId(masterJobId);
    let view: SplitView = { lines: [], houses: [], shares: [] };
    await masterJobCostRepository.replaceSplitRows(companyId, masterJobId, async () => {
      const [houses, lines] = await Promise.all([housesOf(masterJobId), masterJobCostRepository.list(companyId, masterJobId)]);
      const shares = await sharesAsWritten(companyId, lines, houses);
      view = { lines: lines.map(toItem), houses, shares };
      const byId = new Map(lines.map((l) => [l.id, l]));
      return shares.map((s): SplitRowValues => {
        const line = byId.get(s.lineId)!;
        return {
          shipmentId: s.shipmentId,
          category: line.category,
          description: line.description,
          vendor: line.vendor,
          estAmount: s.est,
          estCurrency: line.estCurrency,
          realAmount: s.real,
          realCurrency: line.realCurrency,
          invoiceNumber: line.invoiceNumber,
          received: line.received,
          sourceMasterJobRef: masterJobRef(masterJobId, line.id),
          lineSort: line.sortOrder,
        };
      });
    });
    return view;
  }
}

export const masterJobCostService = new MasterJobCostService();
