import log from "encore.dev/log";
import { db } from "../db/db";
import type { Tx } from "../repositories/warehouseSection.repository";
import { bondedEntryRepository, stockGateReader, stockLineRepository, stockMovementRepository } from "../repositories/warehouseStock.repository";
import { houseContexts } from "./houses";
import { pgCode } from "./offline";
import { planStockSync, type StockSyncOptions, type StockSyncPlan, type StockSyncState } from "./warehouseStockPlan";

export { planStockSync, receiptAndLeft, type StockSyncOptions, type StockSyncPlan, type StockSyncState } from "./warehouseStockPlan";

// Stock on Hand and the Bonded Register follow the gate: see warehouseStockPlan.ts for the rules.
// Called inside the transaction of every stamp / tally / stuffing / gate-out / void / archive
// that changes whether a position is in the warehouse, after the caller updated (and so locked)
// the gate record; one automatic line and entry per gate record (unique index).

/**
 * Reads what the plan needs, inside the caller's transaction (the gate record locked). The dry
 * run passes `lock: false`: it writes nothing, so it must not hold up stamps on the records it visits.
 */
async function loadState(tx: Tx, companyId: string, movementId: string, lock = true): Promise<StockSyncState | null> {
  const m = lock ? await stockGateReader.movementLocked(tx, companyId, movementId) : await stockGateReader.movement(companyId, movementId);
  if (!m) return null;
  const house = (await houseContexts([movementId], companyId, tx)).get(movementId) ?? null;
  const leftContainerNumber = m.leftContainerId
    ? house && house.container.id === m.leftContainerId
      ? house.container.number
      : await stockGateReader.containerNumber(tx, companyId, m.leftContainerId)
    : "";
  const line = await stockLineRepository.autoForMovement(tx, companyId, movementId, lock);
  const entry = await bondedEntryRepository.autoForMovement(tx, companyId, movementId, lock);
  return {
    m,
    house,
    leftContainerNumber,
    line,
    manualLine: line ? false : await stockLineRepository.manualOpenForMovement(tx, companyId, movementId),
    entry,
    manualEntry: entry ? false : await bondedEntryRepository.manualOpenForMovement(tx, companyId, movementId),
  };
}

async function applyPlan(tx: Tx, s: StockSyncState, plan: StockSyncPlan) {
  const { m } = s;
  if (plan.line?.insert) {
    // A parallel sync cannot be first (the gate record is locked), but the unique index decides.
    const made = await stockLineRepository.insertAuto(tx, plan.line.insert);
    if (!made) return false;
  } else if (plan.line?.update && s.line) {
    await stockLineRepository.updateTx(tx, s.line.id, m.companyId, plan.line.update);
  }
  if (plan.entry?.insert) await bondedEntryRepository.insertAuto(tx, plan.entry.insert);
  else if (plan.entry?.update && s.entry) await bondedEntryRepository.updateTx(tx, s.entry.id, m.companyId, plan.entry.update);
  await stockMovementRepository.appendTx(tx, plan.movements);
  return true;
}

// Postgres "undefined column / table": the stock migration (0018) is not applied yet. The gate
// action itself must not fail then — the sync is skipped (savepoint) and logged; the manager's
// "Build stock from gate records" brings the lines up to date once it is applied.
const SCHEMA_MISSING = new Set(["42703", "42P01"]);

/**
 * Brings the stock line and bonded entry of one gate record to its state, inside `tx` (the
 * caller's transaction, after its update of the gate record). Idempotent.
 */
export async function syncStockForMovement(tx: Tx, companyId: string, movementId: string, opts: StockSyncOptions): Promise<StockSyncPlan | null> {
  try {
    return await tx.transaction(async (sp) => {
      const state = await loadState(sp, companyId, movementId);
      if (!state) return null;
      const plan = planStockSync(state, opts);
      if (!(await applyPlan(sp, state, plan))) {
        // Lost a race on the insert: plan again on the row that is there now.
        const again = await loadState(sp, companyId, movementId);
        if (!again) return null;
        const p2 = planStockSync(again, opts);
        await applyPlan(sp, again, p2);
        return p2;
      }
      return plan;
    });
  } catch (err) {
    if (!SCHEMA_MISSING.has(pgCode(err))) throw err;
    log.error("warehouse: stock sync skipped — migration 0018 (stock from gate events) is not applied; restart Encore", { movementId, error: String(err) });
    return null;
  }
}

/** The same for several gate records, each in a transaction of its own (outside a gate action). */
export async function syncStockForMovements(companyId: string, movementIds: string[], opts: StockSyncOptions) {
  const plans: { movementId: string; plan: StockSyncPlan | null }[] = [];
  for (const id of movementIds) {
    plans.push({ movementId: id, plan: await db.transaction((tx) => syncStockForMovement(tx, companyId, id, opts)) });
  }
  return plans;
}

/** The plan without writing anything (the manager's dry run). */
export async function previewStockSync(companyId: string, movementId: string, opts: StockSyncOptions): Promise<{ plan: StockSyncPlan; ref: string } | null> {
  return db.transaction(async (tx) => {
    const state = await loadState(tx, companyId, movementId, false);
    if (!state) return null;
    return { plan: planStockSync(state, opts), ref: state.m.positionRef || state.m.gateRef };
  });
}
