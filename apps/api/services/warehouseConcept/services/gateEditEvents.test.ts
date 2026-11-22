import { describe, expect, it } from "vitest";
import type { GateChecklist, GateTransportLeg } from "../schemas/gateMovement.schema";
import { CHECK_EDITED, CUSTOMS_EDITED, LEG_EDITED, checkEditEvents, customsEditEvents, legEditEvents } from "./gateEditEvents";

// Mock test: the gate record's History logged no customs, transport-leg or checklist edit. Each changed field is
// now one line, "<what>: <now>" with "was <before>" (pure; the service appends them in the save's transaction).

const AT = "2026-11-21T08:00:00.000Z";
const leg = (l: GateTransportLeg["leg"], over: Partial<GateTransportLeg> = {}): GateTransportLeg => ({ leg: l, company: "", plate: "", driver: "", phone: "", gateTime: "", ...over });
const DEFAULTS: GateChecklist = { ht: "a", photos: "a", measure: "a", vgm: "a", seal: "a", dg: "a" };

describe("customsEditEvents", () => {
  const before = { customsMode: "SCP", mrn: "", customsStatus: "Paperwork Verified" };

  it("logs each customs field that changes, with what it was", () => {
    expect(customsEditEvents(before, { customsMode: "T1", mrn: "26CZ5100008888A1", customsStatus: "Paperwork Verified" }, AT, "Eva")).toEqual([
      { kind: CUSTOMS_EDITED, label: "Customs procedure: T1", at: AT, by: "Eva", detail: "was SCP" },
      { kind: CUSTOMS_EDITED, label: "MRN: 26CZ5100008888A1", at: AT, by: "Eva", detail: "was —" },
    ]);
  });

  it("says a cleared field is cleared, and logs nothing for a field left out or sent as it was", () => {
    expect(customsEditEvents({ ...before, mrn: "26CZ1" }, { mrn: "" }, AT, "Eva")).toEqual([{ kind: CUSTOMS_EDITED, label: "MRN: cleared", at: AT, by: "Eva", detail: "was 26CZ1" }]);
    expect(customsEditEvents(before, { customsMode: "SCP", customsStatus: " Paperwork Verified " }, AT, "Eva")).toEqual([]);
    expect(customsEditEvents(before, {}, AT, "Eva")).toEqual([]);
  });
});

describe("legEditEvents", () => {
  it("logs each leg field that changes, on its leg, with what it was", () => {
    const before = [leg("IN"), leg("OUT", { company: "Haulier s.r.o." }), leg("CFS")];
    const after = [leg("IN"), leg("OUT", { company: "Other s.r.o.", plate: "1AB 2345" }), leg("CFS")];
    expect(legEditEvents(before, after, AT, "Eva")).toEqual([
      { kind: LEG_EDITED, label: "OUT leg transport company: Other s.r.o.", at: AT, by: "Eva", detail: "was Haulier s.r.o." },
      { kind: LEG_EDITED, label: "OUT leg plate: 1AB 2345", at: AT, by: "Eva", detail: "was —" },
    ]);
    expect(legEditEvents(before, before, AT, "Eva")).toEqual([]);
  });

  it("reads a gate time typed as an ISO time as the Prague day and time, and free text as typed", () => {
    const [e] = legEditEvents([leg("IN", { gateTime: "after lunch" })], [leg("IN", { gateTime: "2026-11-21T08:30:00.000Z" })], AT, "Eva");
    expect(e).toMatchObject({ label: "IN leg gate time: 2026-11-21 09:30", detail: "was after lunch" });
    expect(legEditEvents([leg("IN", { gateTime: "2026-11-21T08:30:00.000Z" })], [leg("IN")], AT, "Eva")[0]).toMatchObject({ label: "IN leg gate time: cleared", detail: "was 2026-11-21 09:30" });
  });

  // Review of system-22: a gate time stored as "…T08:30:00Z" and sent back as "…T08:30:00.000Z" logged
  // "IN leg gate time: 2026-11-21 09:30 / was 2026-11-21 09:30".
  it("logs nothing for a gate time sent back as the same instant written another way", () => {
    expect(legEditEvents([leg("IN", { gateTime: "2026-11-21T08:30:00Z" })], [leg("IN", { gateTime: "2026-11-21T08:30:00.000Z" })], AT, "Eva")).toEqual([]);
    expect(legEditEvents([leg("IN", { gateTime: "2026-11-21T09:30:00+01:00" })], [leg("IN", { gateTime: "2026-11-21T08:30:00.000Z" })], AT, "Eva")).toEqual([]);
    // Another instant, or free text against a time, is a change.
    expect(legEditEvents([leg("IN", { gateTime: "2026-11-21T08:30:00Z" })], [leg("IN", { gateTime: "2026-11-21T08:45:00.000Z" })], AT, "Eva")).toHaveLength(1);
    expect(legEditEvents([leg("IN", { gateTime: "2026-11-21T08:30:00Z" })], [leg("IN", { gateTime: "after lunch" })], AT, "Eva")).toHaveLength(1);
  });
});

describe("checkEditEvents", () => {
  it("logs an icon whose state changes in the words the checklist shows, a stored icon missing read as the default", () => {
    expect(checkEditEvents({ ht: "n" }, DEFAULTS, { ht: "g" }, AT, "Eva")).toEqual([{ kind: CHECK_EDITED, label: "Checklist HT: done", at: AT, by: "Eva", detail: "was n/a" }]);
    expect(checkEditEvents({}, DEFAULTS, { dg: "r" }, AT, "Eva")).toEqual([{ kind: CHECK_EDITED, label: "Checklist DG/ADR: problem", at: AT, by: "Eva", detail: "was pending" }]);
  });

  it("logs nothing for a click that leaves the icon as it was", () => {
    expect(checkEditEvents({ photos: "g" }, DEFAULTS, { photos: "g" }, AT, "Eva")).toEqual([]);
  });
});
