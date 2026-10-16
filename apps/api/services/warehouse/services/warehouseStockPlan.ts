import type {
  BondedEntryRecord,
  NewBondedEntryRecord,
  NewStockLineRecord,
  NewStockMovementRecord,
  StockLineRecord,
  StockSyncMovement,
} from "../repositories/warehouseStock.repository";
import type { HouseCtx } from "./houses";
import { containerKind, LEGACY_LINK } from "./containerRules";
import { CUSTOMS_CLEARED } from "./customs";
import { positionLifecycle } from "./lifecycle";
import { isDomestic, releasePlate } from "./direction";
import { DEFAULT_FREE_DAYS, isIsoDate, movementStorage, pragueDate } from "./storage";
import { customsDeadline, customsRegime, type CustomsRegime } from "./warehouseStockCustoms";

// Stock on Hand and the Bonded Register follow the gate. ONE function, called inside the
// transaction of every stamp / tally / stuffing / gate-out / void / archive that changes whether
// a position is in the warehouse, after the caller has updated (and so locked) the gate record:
//
//   received   inbound (příjem): the WH receipt stamp — Domestic cargo: its gate-in (no draft
//              receipt / receipt; the storage clock starts there too); outbound (výdej): the tick-off at the
//              stripping tally of its container, else (no container tally) the "Received in
//              warehouse" date — the same receipt as the lifecycle (lifecycle.ts).
//   left       inbound: the gate-out of the export container it was stuffed in, or the WH
//              release; outbound: the WH release.
//
// The sync writes the target state, so it is idempotent: running it twice (a replayed phone
// request, a second clerk) adds nothing. One automatic stock line and one automatic bonded entry
// per gate record, ever (unique index); a voided receipt marks them Voided and a later receipt
// opens the same rows again. A movement row (audit trail) is added only when the state changes.
// Fields people edit on a line (location, On hold / Allocated, consol, marks) are never
// overwritten. A position that already has an open MANUAL line or entry linked to it gets no
// automatic one (it would be counted twice) — the manager's "Build stock" lists those.

export const STOCK_OPEN = ["Available", "Allocated", "On hold"];
type LineState = "none" | "open" | "left" | "voided";
type EntryState = "none" | "open" | "discharged" | "voided";

export interface StockSyncOptions {
  /** Who did what made the change (logged on the movement rows). */
  by: string;
  /** Why a line is voided / reopened, e.g. the void reason. */
  why?: string;
  at?: Date;
}

/** Everything the plan reads, loaded in the caller's transaction. */
export interface StockSyncState {
  m: StockSyncMovement;
  house: HouseCtx | null;
  /** Number of the container the cargo left in (inbound stuffed), "" otherwise. */
  leftContainerNumber: string;
  line: StockLineRecord | null;
  manualLine: boolean;
  entry: BondedEntryRecord | null;
  manualEntry: boolean;
}

export interface StockSyncPlan {
  line: { insert?: NewStockLineRecord; update?: Partial<NewStockLineRecord> } | null;
  movements: NewStockMovementRecord[];
  entry: { insert?: NewBondedEntryRecord; update?: Partial<NewBondedEntryRecord> } | null;
  /** For the manager sync's counts. */
  lineChange: `${LineState}->${LineState}` | null;
  entryChange: `${EntryState}->${EntryState}` | null;
  /** A manual line already holds the position: no automatic line made. */
  skippedManual: boolean;
}

const lineState = (l: StockLineRecord | null): LineState =>
  !l ? "none" : l.status === "Voided" ? "voided" : l.status === "Picked" || l.closedAt ? "left" : "open";
// From the void reason and discharge time only, not the balance: an entry opened with 0 pieces
// (no colli, no tally count) is still open and must be discharged when the position leaves.
const entryState = (e: BondedEntryRecord | null): EntryState =>
  !e ? "none" : e.voidedReason ? "voided" : e.dischargedAt ? "discharged" : "open";

/** "YYYY-MM-DDTHH:MM" in Prague time, as the movement log shows it. */
const pragueStamp = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", dateStyle: "short", timeStyle: "short" }).format(d).replace(" ", "T");

const PROCEDURE: Record<Exclude<CustomsRegime, "">, string> = {
  "Temporary storage": "Temporary storage (UCC art. 147–149)",
  "Transit T1": "T1 transit — temporary storage on arrival",
  "Customs warehouse": "71 00 — customs warehousing",
};

// Pure: no database (the sync in warehouseStockSync.ts loads the state and writes the plan).
// The same rules as houses.ts (isExportContainer / tallyRequired), without its repositories.
const isExport = (h: HouseCtx) => containerKind(h.container.direction) === "export";
const tallied = (h: HouseCtx | null): h is HouseCtx => !!h && !isExport(h) && h.link.addedBy !== LEGACY_LINK;

/** The receipt and leaving of a position, as the lifecycle derives them. */
export function receiptAndLeft(m: StockSyncMovement, house: HouseCtx | null): { receipt: string | null; left: string | null } {
  const link = house && (isExport(house) || tallied(house)) ? house : null;
  const lc = positionLifecycle(
    m,
    false,
    link ? { stuffedAt: link.link.stuffedAt, tickedAt: link.link.tickedAt, tallyOutcome: link.link.tallyOutcome, containerGateInAt: link.container.gateInAt } : null,
  );
  const step = (s: string) => lc.steps.find((x) => x.stage === s);
  const received = step("received");
  const left = step("left");
  return { receipt: received?.done ? (received.at ?? null) : null, left: left?.done ? (left.at ?? null) : null };
}

/** YYYY-MM-DD (Prague) of a lifecycle time (an ISO instant, or a typed day). */
const dayOf = (at: string) => (isIsoDate(at) ? at : pragueDate(new Date(at)));
const instantOf = (at: string) => (isIsoDate(at) ? null : new Date(at));

/** The value of the line's Customs column. */
export function stockCustomsValue(m: Pick<StockSyncMovement, "visit" | "customsStatus">, regime: CustomsRegime): string {
  if (regime === "Transit T1") return "T1 bonded";
  if (regime) return regime;
  return m.visit !== "výdej" && m.customsStatus === CUSTOMS_CLEARED ? "Export cleared" : "Free circulation";
}

/** The target state of the position's stock line and bonded entry. Pure. */
export function planStockSync(s: StockSyncState, opts: StockSyncOptions): StockSyncPlan {
  const { m, house, line, entry } = s;
  const now = opts.at ?? new Date();
  const archived = !!m.deletedAt;
  const { receipt, left } = receiptAndLeft(m, house);
  const inStock = !!receipt && !archived;
  const ref = m.positionRef || m.gateRef;
  const regime = customsRegime(m);
  const receiptDay = receipt ? dayOf(receipt) : "";
  const tally = tallied(house) && house.link.tallyOutcome === "received" ? house.link : null;
  const pieces = tally && tally.tallyPieces !== null ? tally.tallyPieces : m.colli;
  const exportHouse = house && isExport(house) ? house : null;
  const reason = opts.why?.trim() || "";
  const movements: NewStockMovementRecord[] = [];
  const mv = (type: string, reference: string, extra: Partial<NewStockMovementRecord> = {}): NewStockMovementRecord => ({
    companyId: m.companyId,
    at: pragueStamp(now),
    type,
    job: ref,
    pieces,
    userName: opts.by,
    reference: reference.slice(0, 500),
    movementId: m.id,
    taskId: m.warehouseTaskId,
    source: "auto",
    ...extra,
  });

  // ---------- stock line ----------
  const before = lineState(line);
  let after: LineState = before;
  let linePlan: StockSyncPlan["line"] = null;
  let skippedManual = false;
  const follow: Partial<NewStockLineRecord> = {
    job: ref,
    taskId: m.warehouseTaskId,
    customer: m.customer,
    pod: m.pod,
    pieces,
    packageType: m.packing,
    weightKg: m.weightKg,
    cbm: m.measureCbm,
    receivedAt: movementStorage(m, now).startDate || receiptDay,
    receivedInstant: receipt ? instantOf(receipt) : null,
    freeDays: m.freeDays ?? DEFAULT_FREE_DAYS,
    customs: stockCustomsValue(m, regime),
    customsRegime: regime,
  };
  const leftReason = left ? (m.leftContainerId ? `Left in container ${s.leftContainerNumber || "—"}` : "WH release") : "";
  if (inStock && !left) {
    after = "open";
    // Stuffed in an export container: allocated to it; un-stuffed: back to Available.
    const stuffing: Partial<NewStockLineRecord> = {};
    if (exportHouse?.link.stuffedAt) {
      stuffing.status = "Allocated";
      stuffing.consol = exportHouse.container.number;
    } else if (line && line.status === "Allocated" && exportHouse && line.consol === exportHouse.container.number) {
      stuffing.status = "Available";
      stuffing.consol = "";
    }
    if (!line) {
      if (s.manualLine) {
        after = "none";
        skippedManual = true;
      } else {
        linePlan = {
          insert: {
            ...follow,
            companyId: m.companyId,
            movementId: m.id,
            source: "auto",
            job: ref,
            receivedAt: follow.receivedAt!,
            location: (tally?.tallyLocation ?? "").trim().toUpperCase(),
            status: "Available",
            ...stuffing,
          },
        };
      }
    } else {
      const reopen = before !== "open";
      linePlan = {
        update: {
          ...follow,
          ...(reopen ? { status: "Available", closedAt: null, closedReason: "" } : {}),
          ...(reopen && !line.location && tally?.tallyLocation ? { location: tally.tallyLocation.trim().toUpperCase() } : {}),
          ...stuffing,
        },
      };
    }
  } else if (line) {
    if (inStock && left) {
      after = "left";
      linePlan = {
        update: before === "left" ? { ...follow } : { ...follow, status: "Picked", closedAt: new Date(left), closedReason: leftReason },
      };
    } else {
      after = "voided";
      if (before !== "voided") {
        linePlan = { update: { status: "Voided", closedAt: now, closedReason: (archived ? "Position archived" : reason || "Receipt voided").slice(0, 500) } };
      }
    }
  }
  // The audit trail: only real changes.
  if (before !== after) {
    const location = linePlan?.insert?.location ?? line?.location ?? "";
    if (before === "none" && after === "open") {
      const receiptText = tally
        ? `Ticked off at the stripping tally — ${house!.container.number}`
        : m.visit === "výdej"
          ? "Received in warehouse"
          : isDomestic(m.handling) && !m.expReceipt
            ? "Gate-in (Domestic: the gate-in is the receipt)"
            : "WH receipt";
      movements.push(mv("Receipt", receiptText, { toLocation: location }));
    } else if (after === "left") {
      movements.push(
        m.leftContainerId
          ? mv("Load", leftReason, { fromLocation: location, toLocation: s.leftContainerNumber })
          : mv("Pick", leftReason, { fromLocation: location, toLocation: releasePlate(m) ? `truck ${releasePlate(m)}` : "" }),
      );
    } else if (after === "voided") {
      movements.push(mv("Adjustment", `Voided — ${archived ? "position archived" : reason || "receipt voided"}`, { fromLocation: location, pieces: line?.pieces ?? pieces }));
    } else if (after === "open") {
      movements.push(mv("Adjustment", `Back in stock${reason ? ` — ${reason}` : ""}`, { toLocation: location }));
    }
  }

  // ---------- bonded register ----------
  const eBefore = entryState(entry);
  let eAfter: EntryState = eBefore;
  let entryPlan: StockSyncPlan["entry"] = null;
  const deadline = customsDeadline(regime, receiptDay);
  if (inStock && !left && regime) {
    eAfter = "open";
    const follow: Partial<NewBondedEntryRecord> = {
      job: ref,
      taskId: m.warehouseTaskId,
      consignee: m.customer,
      regime,
      procedure: PROCEDURE[regime],
      entryDate: receiptDay,
      enteredAt: receipt ? instantOf(receipt) : null,
      deadline,
      pieces,
      weightKg: m.weightKg,
    };
    if (!entry) {
      if (s.manualEntry) eAfter = "none";
      else entryPlan = { insert: { ...follow, companyId: m.companyId, movementId: m.id, source: "auto", mrn: m.mrn.trim().toUpperCase(), balance: pieces } };
    } else {
      entryPlan = {
        update: {
          ...follow,
          ...(!entry.mrn && m.mrn.trim() ? { mrn: m.mrn.trim().toUpperCase() } : {}),
          ...(eBefore !== "open" ? { balance: pieces, dischargedAt: null, dischargeRef: "", discharge: "", voidedReason: "" } : { balance: pieces }),
        },
      };
    }
  } else if (entry && eBefore === "open") {
    if (!inStock) {
      eAfter = "voided";
      entryPlan = { update: { balance: 0, voidedReason: (archived ? "Position archived" : reason || "Receipt voided").slice(0, 500) } };
    } else {
      eAfter = "discharged";
      const at = left ? new Date(left) : now;
      const docs = [entry.mrn || m.mrn.trim().toUpperCase(), m.customsDocs.trim()].filter(Boolean).join(" · ");
      const how = left
        ? leftReason
        : m.customsStatus === CUSTOMS_CLEARED
          ? "customs cleared/released"
          : `no longer under customs control (customs mode ${m.customsMode})`;
      const dischargeRef = [docs, how].filter(Boolean).join(" · ").slice(0, 500);
      entryPlan = { update: { balance: 0, dischargedAt: at, dischargeRef, discharge: `${pragueDate(at)} · ${dischargeRef}`.slice(0, 500) } };
    }
  }

  return {
    line: linePlan,
    movements,
    entry: entryPlan,
    lineChange: before !== after ? `${before}->${after}` : null,
    entryChange: eBefore !== eAfter ? `${eBefore}->${eAfter}` : null,
    skippedManual,
  };
}

