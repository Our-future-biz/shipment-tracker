import { describe, expect, it } from "vitest";
import { COVER_TITLES_SHOWN, coverNotices, tellsReader, type CoverAssignmentRow } from "../lib/coverBell";

const ME = { userId: "u-eva", email: "eva@firma.cz" };
const JAN = "u-jan";
const NAMES = new Map([[JAN, "jan@firma.cz"]]);
const AT = new Date("2026-11-17T09:00:00Z");

const change = (over: Partial<CoverAssignmentRow> = {}): CoverAssignmentRow => ({
  shipmentId: "s1",
  jobNumber: "CZFCL00000101",
  field: "holidayCover",
  oldValue: "",
  newValue: ME.email,
  userId: JAN,
  changedAt: AT,
  personInCharge: "jan@firma.cz",
  holidayCover: ME.email,
  readAt: null,
  ...over,
});
const open = (shipmentId: string, ...titles: string[]) => titles.map((text) => ({ shipmentId, text }));

describe("who is told of the to-dos of a shipment they now cover", () => {
  it("the person somebody else made its Holiday Cover or Handled By", () => {
    expect(tellsReader(change(), ME)).toBe(true);
    expect(tellsReader(change({ field: "personInCharge" }), ME)).toBe(true);
  });

  it("not the person who named themselves, nor one the field already named (a value only rewritten)", () => {
    expect(tellsReader(change({ userId: ME.userId }), ME)).toBe(false);
    expect(tellsReader(change({ oldValue: "Eva@firma.cz — Eva Malá", newValue: "eva@firma.cz" }), ME)).toBe(false);
  });

  it("not for a change of another field, or one naming somebody else", () => {
    expect(tellsReader(change({ field: "salesPerson" }), ME)).toBe(false);
    expect(tellsReader(change({ newValue: "ana@firma.cz" }), ME)).toBe(false);
  });
});

describe("the bell's line of a shipment the person now covers", () => {
  it("shows its open to-dos: how many, the first titles, what they were made and by whom", () => {
    const [line] = coverNotices([change()], open("s1", "Call the depot", "Book the truck", "Send the SI", "Chase the POD"), ME, NAMES);
    expect(line).toEqual({
      shipmentId: "s1",
      jobNumber: "CZFCL00000101",
      role: "Holiday Cover",
      by: "jan@firma.cz",
      at: AT.toISOString(),
      openCount: 4,
      titles: ["Call the depot", "Book the truck", "Send the SI"].slice(0, COVER_TITLES_SHOWN),
    });
  });

  it("goes once they open the Notes To-Do tab, and comes back with a later change", () => {
    const read = new Date(AT.getTime() + 60_000);
    expect(coverNotices([change({ readAt: read })], open("s1", "Call the depot"), ME, NAMES)).toEqual([]);
    const later = new Date(read.getTime() + 60_000);
    expect(coverNotices([change({ readAt: read, changedAt: later, field: "personInCharge" })], open("s1", "Call the depot"), ME, NAMES)).toMatchObject([{ role: "Handled By" }]);
  });

  it("goes once the to-dos are finished, or when the person no longer covers it", () => {
    expect(coverNotices([change()], [], ME, NAMES)).toEqual([]);
    expect(coverNotices([change({ holidayCover: "ana@firma.cz" })], open("s1", "Call the depot"), ME, NAMES)).toEqual([]);
  });

  it("is one line per shipment, its latest change telling them, the newest shipment first", () => {
    const earlier = new Date(AT.getTime() - 3_600_000);
    const rows = [
      change({ changedAt: earlier }),
      change({ field: "personInCharge", personInCharge: ME.email }),
      change({ shipmentId: "s2", jobNumber: "CZLCL00000102", changedAt: earlier }),
      // Naming themselves later tells nothing, and hides nothing of the change before it.
      change({ shipmentId: "s3", jobNumber: "CZLCL00000103", userId: ME.userId }),
      change({ shipmentId: "s3", jobNumber: "CZLCL00000103", changedAt: earlier }),
    ];
    const lines = coverNotices(rows, [...open("s1", "a"), ...open("s2", "b"), ...open("s3", "c")], ME, NAMES);
    expect(lines.map((l) => [l.jobNumber, l.role])).toEqual([
      ["CZFCL00000101", "Handled By"],
      ["CZLCL00000102", "Holiday Cover"],
      ["CZLCL00000103", "Holiday Cover"],
    ]);
  });

  it("leaves who made the change empty when they are unknown", () => {
    expect(coverNotices([change({ userId: "u-gone" })], open("s1", "a"), ME, NAMES)[0]!.by).toBe("");
  });
});
