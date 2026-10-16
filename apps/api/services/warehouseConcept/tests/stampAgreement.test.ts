import { describe, expect, it } from "vitest";
import { leftOf, receiptOf } from "../services/kpiStamps";
import { receiptAndLeft } from "../services/warehouseStockPlan";
import { LEGACY_LINK } from "../services/containerRules";
import { pragueDate } from "../services/storage";
import type { StockSyncMovement } from "../repositories/warehouseStock.repository";
import type { HouseCtx } from "../services/houses";

// Pure: no database. The Reports KPIs (kpiStamps) and Stock on Hand (the stock sync, through the
// lifecycle) must count the same receipt and leaving for a position.

const T0 = new Date("2026-10-01T08:00:00Z");
const T1 = new Date("2026-10-05T22:30:00Z");

const movement = (over: Partial<StockSyncMovement>): StockSyncMovement =>
  ({
    id: "m1",
    companyId: "c1",
    createdAt: new Date("2026-09-30T08:00:00Z"),
    deletedAt: null,
    visit: "příjem",
    status: "Expected",
    loadInDate: "",
    gateIn: null,
    gateOut: null,
    impRelease: null,
    expDraft: null,
    expReceipt: null,
    receivedAt: null,
    leftAt: null,
    leftContainerId: null,
    ...over,
  }) as StockSyncMovement;

const house = (direction: "Loading" | "Unloading", addedBy = "u", link: Record<string, unknown> = {}): HouseCtx =>
  ({
    container: { id: "k1", number: "MSKU 1", direction, gateInAt: T0 },
    link: { addedBy, tallyOutcome: "", stuffedAt: null, tickedAt: null, ...link },
    links: [],
  }) as unknown as HouseCtx;

const day = (at: string | null) => (at == null ? null : /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : pragueDate(new Date(at)));

const CASES: [string, StockSyncMovement, HouseCtx | null][] = [
  ["inbound, nothing yet", movement({ gateIn: T0 }), null],
  ["inbound, WH receipt", movement({ gateIn: T0, expReceipt: T0 }), null],
  ["inbound, released", movement({ expReceipt: T0, impRelease: T1 }), null],
  ["inbound, stuffed, container gone out", movement({ expReceipt: T0, leftAt: T1, leftContainerId: "k1" }), house("Loading", "u", { stuffedAt: T0 })],
  ["outbound, typed date, no container", movement({ visit: "výdej", loadInDate: "2026-10-02" }), null],
  ["outbound, typed date, import container not ticked", movement({ visit: "výdej", loadInDate: "2026-10-02" }), house("Unloading")],
  ["outbound, ticked at the tally", movement({ visit: "výdej", loadInDate: "2026-10-02", receivedAt: T0 }), house("Unloading", "u", { tallyOutcome: "received", tickedAt: T0 })],
  ["outbound, typed date, legacy link", movement({ visit: "výdej", loadInDate: "2026-10-02" }), house("Unloading", LEGACY_LINK)],
  ["outbound, typed date, export container (odd)", movement({ visit: "výdej", loadInDate: "2026-10-02" }), house("Loading")],
  ["outbound, released", movement({ visit: "výdej", receivedAt: T0, impRelease: T1 }), house("Unloading", "u", { tallyOutcome: "received" })],
  ["outbound, released without receipt", movement({ visit: "výdej", impRelease: T1 }), null],
  ["domestic, gate-in is the receipt", movement({ handling: "Domestic", gateIn: T0 }), null],
  ["domestic, released", movement({ handling: "Domestic", gateIn: T0, impRelease: T1, gateOut: T1 }), null],
  ["domestic, expected", movement({ handling: "Domestic" }), null],
];

describe("Reports KPIs and Stock on Hand use the same receipt and leaving", () => {
  it.each(CASES)("%s", (_name, m, h) => {
    const stock = receiptAndLeft(m, h);
    const receipt = receiptOf(m, h ? { addedBy: h.link.addedBy, containerDirection: h.container.direction } : null);
    const left = leftOf(m);
    expect(receipt?.day ?? null).toBe(day(stock.receipt));
    expect(left?.day ?? null).toBe(day(stock.left));
    expect(receipt?.at?.toISOString() ?? null).toBe(stock.receipt && !/^\d{4}-\d{2}-\d{2}$/.test(stock.receipt) ? stock.receipt : null);
  });
});
