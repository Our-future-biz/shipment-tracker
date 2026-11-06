import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { datesMovedNotices, notToldNotices, proposedNotices, type DateMovedRow, type ProposedRow, type ToldRow } from "../lib/trackingBell";
import { exceptionNotice } from "../lib/trackingChatNotice";

const names = new Map([["u2", "petr@firma.cz"]]);
const moved = (over: Partial<DateMovedRow> = {}): DateMovedRow => ({
  id: "a1",
  shipmentId: "s1",
  jobNumber: "CZ42",
  field: "estimatedArrival",
  oldValue: "2026-10-09",
  newValue: "2026-10-16",
  changedAt: new Date("2026-11-03T09:12:00Z"),
  userId: "u2",
  ownShipment: true,
  readAt: null,
  ...over,
});

describe("a date that moved", () => {
  it("says what moved, from what to what, and who moved it", () => {
    expect(datesMovedNotices([moved()], names, new Set())).toEqual([
      { key: "moved:s1:2026-11-03", kind: "date_moved", shipmentId: "s1", jobNumber: "CZ42", title: "ETA moved", text: "09.10.2026 → 16.10.2026", by: "petr@firma.cz", at: "2026-11-03T09:12:00.000Z", unread: true },
    ]);
  });

  it("is one line per shipment per Prague day, the latest winning", () => {
    const rows = [
      moved({ id: "a2", changedAt: new Date("2026-11-03T15:00:00Z"), newValue: "2026-10-20" }),
      moved({ id: "a1", changedAt: new Date("2026-11-03T09:00:00Z") }),
      moved({ id: "a3", field: "estimatedDeparture", changedAt: new Date("2026-11-03T08:00:00Z") }),
      moved({ id: "a0", changedAt: new Date("2026-11-02T09:00:00Z") }),
      moved({ id: "a4", shipmentId: "s2", changedAt: new Date("2026-11-03T09:00:00Z") }),
    ];
    const out = datesMovedNotices(rows, names, new Set());
    expect(out.map((n) => n.key)).toEqual(["moved:s1:2026-11-03", "moved:s1:2026-11-02", "moved:s2:2026-11-03"]);
    expect(out[0]!.text).toBe("09.10.2026 → 20.10.2026");
  });

  it("is no move for a first filling-in, a clearing or the same day", () => {
    const rows = [moved({ oldValue: null }), moved({ oldValue: "" }), moved({ newValue: null }), moved({ newValue: "2026-10-09" })];
    expect(datesMovedNotices(rows, names, new Set())).toEqual([]);
  });

  it("reaches the sales person from 3 days, or once the customer was told a date", () => {
    const sales = (newValue: string) => moved({ ownShipment: false, newValue });
    expect(datesMovedNotices([sales("2026-10-11")], names, new Set())).toEqual([]);
    expect(datesMovedNotices([sales("2026-10-12")], names, new Set())).toHaveLength(1);
    expect(datesMovedNotices([sales("2026-10-06")], names, new Set())).toHaveLength(1);
    expect(datesMovedNotices([sales("2026-10-11")], names, new Set(["s1"]))).toHaveLength(1);
  });

  it("is read once the Tracking tab was opened after it", () => {
    expect(datesMovedNotices([moved({ readAt: new Date("2026-11-03T10:00:00Z") })], names, new Set())[0]!.unread).toBe(false);
    expect(datesMovedNotices([moved({ readAt: new Date("2026-11-03T08:00:00Z") })], names, new Set())[0]!.unread).toBe(true);
  });
});

describe("a date to confirm", () => {
  const row: ProposedRow = { id: "e1", shipmentId: "s1", jobNumber: "CZ42", kind: "arrived", source: "carrier", effectField: "actualArrival", effectValue: "2026-10-16", occurredOn: "2026-10-16", createdAt: new Date("2026-10-16T14:30:00Z"), readAt: null };

  it("says which date and who reports it", () => {
    expect(proposedNotices([row])).toMatchObject([{ kind: "to_confirm", title: "ATA to confirm", text: "Arrived 16.10.2026", by: "Carrier", unread: true }]);
  });
});

describe("what the customer wasn't told", () => {
  const row = (over: Partial<ToldRow> = {}): ToldRow => ({
    shipmentId: "s1",
    jobNumber: "CZ42",
    noticeAt: new Date("2026-10-01T10:00:00Z"),
    readAt: null,
    etaPod: "2026-10-09",
    etaWarehouse: null,
    plannedDelivery: null,
    estimatedArrival: "2026-10-16",
    actualArrival: null,
    etaWarehouseNow: null,
    warehouseReceivedDate: null,
    plannedDeliveryDate: null,
    actualDeliveryDate: null,
    ...over,
  });

  it("says what was told and what it is now, timed by the move", () => {
    const lastChange = new Map([["s1:estimatedArrival", new Date("2026-11-03T09:00:00Z")]]);
    expect(notToldNotices([row()], lastChange)).toEqual([
      { key: "not_told:s1", kind: "not_told", shipmentId: "s1", jobNumber: "CZ42", title: "Customer not told", text: "ETA: told 09.10.2026, now 16.10.2026", by: "", at: "2026-11-03T09:00:00.000Z", unread: true },
    ]);
  });

  it("is nothing while the dates stand", () => {
    expect(notToldNotices([row({ estimatedArrival: "2026-10-09" })], new Map())).toEqual([]);
  });

  it("compares the warehouse date with today's, not the one told", () => {
    expect(notToldNotices([row({ estimatedArrival: "2026-10-09", etaWarehouse: "2026-10-12", etaWarehouseNow: "2026-10-12" })], new Map())).toEqual([]);
    expect(notToldNotices([row({ estimatedArrival: "2026-10-09", etaWarehouse: "2026-10-12", etaWarehouseNow: "2026-10-20" })], new Map())).toHaveLength(1);
  });

  it("is new again when the date moves after the tab was opened", () => {
    const lastChange = new Map([["s1:estimatedArrival", new Date("2026-11-03T09:00:00Z")]]);
    expect(notToldNotices([row({ readAt: new Date("2026-11-04T09:00:00Z") })], lastChange)[0]!.unread).toBe(false);
    expect(notToldNotices([row({ readAt: new Date("2026-11-02T09:00:00Z") })], lastChange)[0]!.unread).toBe(true);
  });
});

describe("an exception's chat line", () => {
  const JAN = { id: "u1", email: "jan@firma.cz", displayName: "Jan" };
  const EVA = { id: "u2", email: "eva@firma.cz", displayName: "Eva" };
  const exception = { label: "Rolled", day: "2026-11-05", note: "No space" };

  it("says what and why, tagging the shipment's people", () => {
    const out = exceptionNotice({ personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz — Eva" }, [JAN, EVA], exception, "other");
    expect(out.message).toBe("Rolled since 05.11.2026: No space\n@Jan @Eva");
    expect(out.tagged).toEqual([JAN, EVA]);
  });

  it("doesn't tag the one who reported it", () => {
    const out = exceptionNotice({ personInCharge: "jan@firma.cz", holidayCover: "" }, [JAN, EVA], exception, "u1");
    expect(out.message).toBe("Rolled since 05.11.2026: No space");
    expect(out.tagged).toEqual([]);
  });
});
