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
// shipments - by W/M or equally, as the line says. The view always shows that split as it stands,
// but a shipment carries its share, as a read-only row of its own Costs Breakdown, only once someone
// processes the split (process). Only a shipment that leaves loses its share by itself.

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
  inSplit: r.inSplit,
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

/**
 * The shipments to leave out of a line, kept to those linked now. A line can't leave out every
 * shipment that would carry it: a line split by W/M is carried only by the shipments with a W/M,
 * so the last of those stays in too.
 */
export function excludedAmong(ids: string[], houses: SplitHouse[], splitMethod: string): string[] {
  if (!Array.isArray(ids)) throw APIError.invalidArgument("excludedShipmentIds must be a list of shipments");
  const excluded = houses.filter((h) => ids.includes(h.shipmentId)).map((h) => h.shipmentId);
  const carriers = splitMethod === "wm" ? houses.filter((h) => h.freightTon > 0) : houses;
  if (carriers.length > 0 && carriers.every((h) => excluded.includes(h.shipmentId))) {
    throw APIError.failedPrecondition(splitMethod === "wm" ? "At least one shipment with a W/M stays in the split" : "At least one shipment stays in the split");
  }
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

/** The view without its estimates. */
type SplitView = Pick<MasterJobCostsView, "lines" | "houses" | "shares" | "split">;

/** The shares as rows of the shipments' Costs Breakdowns. */
function splitRows(masterJobId: string, lines: MasterJobCostRecord[], shares: MasterJobShareItem[]): SplitRowValues[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return shares.map((s) => {
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
}

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
  line: Pick<MasterJobCostRecord, "category" | "splitMethod"> & Partial<Pick<MasterJobCostRecord, "inSplit" | "excludedShipmentIds">>,
): Promise<void> {
  if (!line.category || line.inSplit === false) return;
  const inSplit = housesInSplit(line, houses);
  const weights = splitWeights(line.splitMethod, inSplit);
  await assertNotKeptByTrucking(companyId, inSplit.filter((_, i) => weights[i]! > 0).map((h) => h.shipmentId), line.category);
}

class MasterJobCostService {
  async view(companyId: string, masterJobId: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    const [houses, lines] = await Promise.all([housesOf(masterJobId), masterJobCostRepository.list(companyId, masterJobId)]);
    const shares = await sharesAsWritten(companyId, lines, houses);
    const split = await masterJobCostRepository.splitState(companyId, masterJobId, splitRows(masterJobId, lines, shares));
    return withVsEstimate({ lines: lines.map(toItem), houses, shares, split });
  }

  async add(companyId: string, masterJobId: string, input: MasterJobCostInput): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    const values = { category: "", ...changesOf(input) };
    // housesOf also refuses a master job that is not the company's.
    await assertNotKeptByTruckingFor(companyId, await housesOf(masterJobId), { category: values.category ?? "", splitMethod: values.splitMethod ?? "wm", inSplit: values.inSplit });
    await masterJobCostRepository.create(companyId, masterJobId, values);
    return this.view(companyId, masterJobId);
  }

  async update(companyId: string, masterJobId: string, id: string, input: MasterJobCostUpdate): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    if (!isUuid(id)) throw APIError.notFound("Master job cost not found");
    const { excludedShipmentIds, ...fields } = input;
    const changes = changesOf(fields);
    const current = await masterJobCostRepository.get(id, companyId, masterJobId);
    if (!current) throw APIError.notFound("Master job cost not found");
    const newCodeOrSplit = changes.category !== undefined || changes.splitMethod !== undefined || changes.inSplit !== undefined;
    const houses = excludedShipmentIds !== undefined || newCodeOrSplit ? await housesOf(masterJobId) : [];
    if (excludedShipmentIds !== undefined) changes.excludedShipmentIds = excludedAmong(excludedShipmentIds, houses, changes.splitMethod ?? current.splitMethod);
    // A new charge code or split, a line put in the split and a shipment put back in it are checked
    // against Trucking (a line out of the split has no shares to check); a share Trucking came to
    // keep since is left out of the split (sharesAsWritten), so the line's other fields, and taking
    // another shipment out, stay possible.
    const next = { ...current, ...changes } as MasterJobCostRecord;
    if (next.category && newCodeOrSplit) {
      await assertNotKeptByTruckingFor(companyId, houses, next);
    } else if (next.category && excludedShipmentIds !== undefined) {
      const backIn = houses.filter((h) => current.excludedShipmentIds.includes(h.shipmentId) && !next.excludedShipmentIds.includes(h.shipmentId));
      await assertNotKeptByTruckingFor(companyId, backIn, next);
    }
    const row = await masterJobCostRepository.update(id, companyId, masterJobId, changes);
    if (!row) throw APIError.notFound("Master job cost not found");
    return this.view(companyId, masterJobId);
  }

  async remove(companyId: string, masterJobId: string, id: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    if (!isUuid(id) || !(await masterJobCostRepository.softDelete(id, companyId, masterJobId))) throw APIError.notFound("Master job cost not found");
    return this.view(companyId, masterJobId);
  }

  /**
   * Processes the split: works every line's shares out over the master job's shipments as they are
   * now and writes them into the shipments' Costs Breakdowns, replacing the previous shares
   * (sharesAsWritten). Worked out under the master job's lock, so the write that comes last read
   * the latest lines. Nothing else puts a cost on a shipment.
   */
  async process(companyId: string, masterJobId: string): Promise<MasterJobCostsView> {
    assertMasterJobId(masterJobId);
    await masterJobCostRepository.replaceSplitRows(companyId, masterJobId, async () => {
      const [houses, lines] = await Promise.all([housesOf(masterJobId), masterJobCostRepository.list(companyId, masterJobId)]);
      return splitRows(masterJobId, lines, await sharesAsWritten(companyId, lines, houses));
    });
    return this.view(companyId, masterJobId);
  }

  /** A shipment that left the master job, or was deleted, carries none of its costs: only that is written without processing. */
  async dropSharesOfLeftShipments(companyId: string, masterJobId: string): Promise<void> {
    assertMasterJobId(masterJobId);
    await masterJobCostRepository.dropSplitRowsOutside(companyId, masterJobId, async () => (await housesOf(masterJobId)).map((h) => h.shipmentId));
  }
}

export const masterJobCostService = new MasterJobCostService();
