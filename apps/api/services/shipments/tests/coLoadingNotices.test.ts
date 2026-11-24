import { describe, expect, it } from "vitest";
import { noticeSubject, recordRefusal, rolledRows, sailedRows, type NoticeLink, type ToldNotice } from "../lib/coLoadingNotices";

const at = (iso: string) => new Date(iso);
const CANCELLED = "Cancelled Shipment";
const link = (shipmentId: string, more: Partial<NoticeLink> = {}): NoticeLink => ({
  shipmentId,
  jobNumber: `CZ${shipmentId}`,
  customer: `Customer ${shipmentId}`,
  status: "Booked [IMP]",
  linkedAt: at("2026-11-20T08:00:00Z"),
  removedAt: null,
  removedReason: "",
  removedNote: "",
  movedTo: "",
  ...more,
});
const told = (shipmentId: string, iso: string, more: Partial<ToldNotice> = {}): ToldNotice => ({ shipmentId, toldAt: at(iso), toldByName: "Jana", channel: "email", ...more });

describe("a sailing's customer notices (Council Outlay 14, C6)", () => {
  it("lists the shipments on the sailing with who told their customers it sailed", () => {
    const rows = sailedRows(
      [link("2"), link("1"), link("3", { status: CANCELLED }), link("4", { removedAt: at("2026-11-21T08:00:00Z"), removedReason: "removed" })],
      // Told before it was linked here (on an earlier sailing): that does not count.
      [told("1", "2026-11-22T09:00:00Z"), told("1", "2026-11-23T09:00:00Z", { toldByName: "Petr", channel: "phone" }), told("2", "2026-11-19T09:00:00Z")],
      CANCELLED,
    );
    expect(rows.map((r) => r.jobNumber)).toEqual(["CZ1", "CZ2"]);
    expect(rows[0]!.told).toEqual({ at: "2026-11-23T09:00:00.000Z", byName: "Petr", channel: "phone" });
    expect(rows[1]!.told).toBeNull();
  });

  it("lists each shipment moved on once, by its last move, with who told its customer since", () => {
    const rows = rolledRows(
      [
        link("1", { removedAt: at("2026-11-21T08:00:00Z"), removedReason: "moved", removedNote: "Box full", movedTo: "WEEK 52" }),
        link("1", { linkedAt: at("2026-11-22T08:00:00Z"), removedAt: at("2026-11-23T08:00:00Z"), removedReason: "moved", removedNote: "Late cargo", movedTo: "WEEK 53" }),
        link("2", { removedAt: at("2026-11-22T10:00:00Z"), removedReason: "moved", movedTo: "WEEK 52" }),
        link("3", { removedAt: at("2026-11-22T10:00:00Z"), removedReason: "removed" }),
        link("4"),
      ],
      [told("1", "2026-11-22T09:00:00Z"), told("2", "2026-11-22T11:00:00Z")],
      CANCELLED,
    );
    expect(rows.map((r) => [r.jobNumber, r.movedTo, r.reason])).toEqual([
      ["CZ1", "WEEK 53", "Late cargo"],
      ["CZ2", "WEEK 52", ""],
    ]);
    // Moved away and put back on this sailing since: not rolled from it.
    expect(rolledRows([link("5", { removedAt: at("2026-11-21T08:00:00Z"), removedReason: "moved", movedTo: "WEEK 52" }), link("5", { linkedAt: at("2026-11-22T08:00:00Z") })], [], CANCELLED)).toEqual([]);
    // Told after the first move, not since the last one: still to tell.
    expect(rows[0]!.told).toBeNull();
    expect(rows[1]!.told?.byName).toBe("Jana");
  });

  it("records only shipments that are on the list", () => {
    const rows = sailedRows([link("1"), link("2")], [], CANCELLED);
    expect(recordRefusal(["1", "2"], rows, "sailed")).toBeNull();
    expect(recordRefusal([], rows, "sailed")).toContain("Tick the shipments");
    expect(recordRefusal(["1", "9"], rows, "sailed")).toContain("no longer on this sailing");
    expect(recordRefusal(["9"], rows, "rolled")).toContain("not moved on from this sailing");
  });

  it("words the notice for the shipment's own record", () => {
    expect(noticeSubject("sailed", "WEEK 51", {})).toBe("Sailed on WEEK 51");
    expect(noticeSubject("rolled", "WEEK 51", { movedTo: "WEEK 52", reason: "Box full" })).toBe("Rolled from WEEK 51 to WEEK 52: Box full");
    expect(noticeSubject("rolled", "WEEK 51", {})).toBe("Rolled from WEEK 51");
  });
});
