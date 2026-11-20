import { describe, expect, it } from "vitest";
import type { GateEvent } from "../schemas/gateMovement.schema";
import {
  conditionNotGood,
  countedText,
  damageNotice,
  isLooseImport,
  receiptBlocked,
  receiptDateMoveRefusal,
  receiptMissing,
  receiptOf,
  receiptPiecesRefusal,
  receiptSuggestions,
  suggestionsNotice,
  ZERO_PIECES,
} from "./positionReceipt";
import { keptReceivedDay, pragueDate, pragueDayStart } from "./storage";

// Pure rules of the receipt of loose import cargo (no database: runs in the plain test run; the
// service itself is tested in tests/positionReceipt.test.ts under `encore test`).

describe("what a receipt takes (mock council R28, R29)", () => {
  it("refuses 0 pieces and points to a Short exception; not counted is fine", () => {
    expect(receiptPiecesRefusal(0)).toBe(ZERO_PIECES);
    expect(ZERO_PIECES).toMatch(/Short exception/);
    expect(receiptPiecesRefusal(null)).toBeNull();
    expect(receiptPiecesRefusal(1)).toBeNull();
    expect(receiptPiecesRefusal(-1)).toMatch(/whole number from 1/);
    expect(receiptPiecesRefusal(1.5)).toMatch(/whole number from 1/);
  });

  it("lets only a manager move the receipt's date, only earlier, with a reason", () => {
    expect(receiptDateMoveRefusal("2026-11-20", "2026-11-18", "manager", "came on Wednesday")).toBeNull();
    expect(receiptDateMoveRefusal("2026-11-20", "2026-11-18", "admin", "came on Wednesday")).toBeNull();
    expect(receiptDateMoveRefusal("2026-11-20", "2026-11-18", "user", "came on Wednesday")).toMatch(/a manager moves it earlier/);
    expect(receiptDateMoveRefusal("2026-11-20", "2026-11-21", "manager", "typo")).toMatch(/only earlier/);
    expect(receiptDateMoveRefusal("2026-11-20", "", "manager", "typo")).toMatch(/can't be cleared/);
    expect(receiptDateMoveRefusal("2026-11-20", "2026-11-18", "manager", " x ")).toMatch(/Give a reason/);
    expect(receiptDateMoveRefusal("2026-11-20", "2026-11-18", "manager", "x".repeat(501))).toMatch(/too long/);
  });
});

const out = { visit: "výdej", receivedAt: null, impRelease: null, status: "Expected" };
const ev = (kind: string, extra: Partial<GateEvent> & { receipt?: unknown } = {}): GateEvent => ({ kind, label: kind, at: "2026-11-20T09:00:00Z", by: "Jana", ...extra }) as GateEvent;

describe("receipt rules", () => {
  it("takes a receipt only for outbound cargo in no container, not yet received or released", () => {
    expect(receiptBlocked(out, null)).toBeNull();
    expect(receiptBlocked({ ...out, visit: "příjem" }, null)).toMatch(/Only outbound/);
    expect(receiptBlocked(out, "MSKU 611 902-7")).toMatch(/house of container MSKU 611 902-7/);
    expect(receiptBlocked({ ...out, receivedAt: new Date() }, null)).toMatch(/already received/);
    expect(receiptBlocked({ ...out, impRelease: new Date() }, null)).toMatch(/already released/);
    expect(receiptBlocked({ ...out, status: "Refused" }, null)).toMatch(/refused/);
    // Import cargo that comes in a container (FCL, a container number, the yard) is not loose cargo.
    expect(receiptBlocked({ ...out, operationType: "FCL stripping" }, null)).toMatch(/comes in a container/);
    // A container number alone (a sea LCL import carries its consol container's): named, not "FCL" (mock council S11-3).
    expect(receiptBlocked({ ...out, containerNumber: "MSKU6119027" }, null)).toBe(
      "It has container number MSKU6119027 — it is received at that container's stripping tally, or by the Received in warehouse date",
    );
    expect(receiptBlocked({ ...out, operationType: "FCL stripping", containerNumber: "MSKU6119027" }, null)).toMatch(/comes in a container \(FCL/);
  });

  it("words the count as the tally does", () => {
    expect(countedText(6, 6, "Damaged packaging", "A-03-2")).toBe("6 of 6 pcs counted · Damaged packaging · at A-03-2");
    expect(countedText(null, 6, "", "")).toBe("");
  });

  it("a condition other than Good offers the Damaged exception (Q20)", () => {
    expect(conditionNotGood("Good")).toBe(false);
    expect(conditionNotGood("")).toBe(false);
    expect(conditionNotGood(" Wet ")).toBe(true);
    expect(damageNotice("Wet")).toBe("Wet — record a Damaged exception?");
  });

  it("suggests Short / Over for a count difference and Damaged for the condition", () => {
    expect(receiptSuggestions(10, 10, "Good")).toEqual([]);
    expect(receiptSuggestions(10, null, "Good")).toEqual([]);
    expect(receiptSuggestions(10, 12, "Good")).toEqual([{ type: "Over", pieces: 2 }]);
    const s = receiptSuggestions(10, 9, "Damaged cargo");
    expect(s).toEqual([
      { type: "Short", pieces: 1 },
      { type: "Damaged", pieces: null },
    ]);
    expect(suggestionsNotice(s, 10, "Damaged cargo")).toBe("Short 1 pc against the expected 10 — record an exception? · Damaged cargo — record a Damaged exception?");
  });

  it("reads the receipt that counts from the events (a void takes it back)", () => {
    const facts = { pieces: 6, condition: "Good", location: "A-1" };
    expect(receiptOf([])).toBeNull();
    expect(receiptOf([ev("positionReceived", { receipt: facts })])).toEqual(facts);
    expect(receiptOf([ev("positionReceived", { receipt: facts }), ev("positionReceiptVoided")])).toBeNull();
    expect(receiptOf([ev("positionReceived", { receipt: facts }), ev("positionReceiptVoided"), ev("positionReceived", { receipt: { ...facts, pieces: 5 } }), ev("gateIn")])).toEqual({ ...facts, pieces: 5 });
  });
});

describe("the WH release of loose import cargo waits for its receipt", () => {
  const loose = { visit: "výdej", receivedAt: null, loadInDate: "", impRelease: null, leftAt: null };
  it("holds outbound cargo in no container until a receipt or the typed date (the web's receiptMissing)", () => {
    expect(receiptMissing(loose, false)).toBe(true);
    expect(receiptMissing({ ...loose, receivedAt: new Date() }, false)).toBe(false);
    expect(receiptMissing({ ...loose, loadInDate: "2026-11-20" }, false)).toBe(false);
    // A house is received at its container's tally; inbound cargo by its WH receipt stamp.
    expect(receiptMissing(loose, true)).toBe(false);
    expect(receiptMissing({ ...loose, visit: "příjem" }, false)).toBe(false);
    expect(receiptMissing({ ...loose, impRelease: new Date() }, false)).toBe(false);
  });

  // Review of step 7: Import FCL (FCL stripping, a container number, the yard) comes in its container.
  it("holds only truly loose cargo — not import cargo that comes in a container", () => {
    const lcl = { ...loose, operationType: "LCL consolidation", containerNumber: "" };
    expect(isLooseImport(lcl, false)).toBe(true);
    expect(receiptMissing(lcl, false)).toBe(true);
    for (const over of [{ operationType: "FCL stripping" }, { operationType: "Container yard storage" }, { operationType: "FCL transload (cross-stuff)" }, { containerNumber: "MSKU6119027" }]) {
      expect(isLooseImport({ ...lcl, ...over }, false)).toBe(false);
      expect(receiptMissing({ ...lcl, ...over }, false)).toBe(false);
    }
    expect(isLooseImport({ ...lcl, containerNumber: "  " }, false)).toBe(true);
    expect(isLooseImport({ ...lcl, operationType: "Cargo storage" }, false)).toBe(true);
  });
});

describe("a receipt or tally tick keeps an earlier typed received day", () => {
  it("keeps a typed day earlier than the receipt's day, nothing else", () => {
    expect(keptReceivedDay("2026-11-18", "2026-11-20")).toBe("2026-11-18");
    expect(keptReceivedDay("2026-11-20", "2026-11-20")).toBeNull();
    expect(keptReceivedDay("2026-11-22", "2026-11-20")).toBeNull();
    expect(keptReceivedDay("", "2026-11-20")).toBeNull();
    expect(keptReceivedDay("18.11.2026", "2026-11-20")).toBeNull();
  });

  it("receives at the start of that Prague day (winter and summer time)", () => {
    expect(pragueDayStart("2026-11-18").toISOString()).toBe("2026-11-17T23:00:00.000Z");
    expect(pragueDayStart("2026-07-01").toISOString()).toBe("2026-06-30T22:00:00.000Z");
    // The days the clocks change: still midnight there.
    for (const d of ["2026-03-29", "2026-10-25"]) {
      expect(pragueDate(pragueDayStart(d))).toBe(d);
      expect(pragueDate(new Date(pragueDayStart(d).getTime() - 1))).not.toBe(d);
    }
  });
});
