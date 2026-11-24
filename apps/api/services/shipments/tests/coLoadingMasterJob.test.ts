import { describe, expect, it } from "vitest";
import { changeEntry } from "../lib/coLoadingLog";
import { factsForMasterJob, masterJobRows, putOnRefusal } from "../lib/coLoadingMasterJob";

describe("a sailing's Master Job (Council Outlay 14, C2)", () => {
  const shipments = [
    { shipmentId: "b", jobNumber: "CZLCL2", customer: "Beta", masterJobId: "mj-1" },
    { shipmentId: "a", jobNumber: "CZLCL1", customer: "Alfa", masterJobId: null },
    { shipmentId: "c", jobNumber: "CZLCL3", customer: "Gama", masterJobId: "mj-9" },
  ];

  it("says where each of the sailing's shipments stands beside its Master Job", () => {
    expect(masterJobRows(shipments, "mj-1").map((r) => [r.jobNumber, r.place])).toEqual([
      ["CZLCL1", "none"],
      ["CZLCL2", "on"],
      ["CZLCL3", "other"],
    ]);
    // No Master Job on the sailing: one in a Master Job is in another.
    expect(masterJobRows(shipments, null).map((r) => r.place)).toEqual(["none", "other", "other"]);
  });

  it("puts on only the sailing's own shipments, and none that is in another Master Job", () => {
    const rows = masterJobRows(shipments, "mj-1");
    expect(putOnRefusal(["a"], rows)).toBeNull();
    expect(putOnRefusal(["a", "b"], rows)).toBeNull();
    expect(putOnRefusal([], rows)).toContain("Tick the shipments");
    expect(putOnRefusal(["x"], rows)).toContain("no longer on this sailing");
    expect(putOnRefusal(["a", "c"], rows)).toBe("CZLCL3 is in another Master Job: take it off that one first.");
  });

  it("gives a new Master Job the sailing's vessel and dates where it has none, never a week or the ports", () => {
    const empty = { vessel: "", voyage: "", estimatedDeparture: null, closingDate: null };
    const sailing = { vessel: "MSC Anna", voyage: "445W", departureDate: "2026-12-05", cutoffDate: "2026-12-01" };
    expect(factsForMasterJob(sailing, empty)).toEqual({ vessel: "MSC Anna", voyage: "445W", estimatedDeparture: "2026-12-05", closingDate: "2026-12-01" });
    // What its shipments already agreed on stays.
    expect(factsForMasterJob(sailing, { vessel: "MSC Other", voyage: "", estimatedDeparture: "2026-12-04", closingDate: null })).toEqual({ voyage: "445W", closingDate: "2026-12-01" });
    // A week names no vessel.
    expect(factsForMasterJob({ ...sailing, vessel: "WEEK 51", voyage: "" }, empty)).toEqual({ estimatedDeparture: "2026-12-05", closingDate: "2026-12-01" });
    expect(factsForMasterJob({ vessel: "WEEK 51", voyage: "", departureDate: null, cutoffDate: null }, empty)).toEqual({});
  });

  it("stands in the sailing's history", () => {
    const entry = changeEntry({ containerNo: 0, kind: "master_job", oldAmount: null, newAmount: null, oldNote: "", newNote: "MCZLCL00000012", changedByName: "Jana", changedAt: new Date("2026-11-24T09:00:00Z") });
    expect(entry?.text).toBe("Master Job: none → MCZLCL00000012");
  });
});
