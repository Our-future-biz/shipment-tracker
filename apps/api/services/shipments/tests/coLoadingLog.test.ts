import { describe, expect, it } from "vitest";
import { changeEntry, checklistFor, checklistOf, cleanChecklist, DEFAULT_CHECKLIST, linkEntries, sailingHistory, tickRefusal } from "../lib/coLoadingLog";

const at = (iso: string) => new Date(iso);

describe("a sailing's checklist (Council Outlay 14, C5)", () => {
  it("starts from the six steps until a manager sets the company's own, per direction", () => {
    expect(checklistFor(null, "import")).toEqual([...DEFAULT_CHECKLIST]);
    const own = { checklistImport: ["Booking confirmed", "Devanning booked"], checklistExport: null };
    expect(checklistFor(own, "import")).toEqual(["Booking confirmed", "Devanning booked"]);
    expect(checklistFor(own, "export")).toEqual([...DEFAULT_CHECKLIST]);
  });

  it("keeps a typed list tidy: trimmed, none empty, none twice, not too many or too long", () => {
    expect(cleanChecklist(["  Booking   confirmed ", "", "B/L received"])).toEqual({ steps: ["Booking confirmed", "B/L received"] });
    expect(cleanChecklist(["  ", ""])).toHaveProperty("error");
    expect(cleanChecklist(["A", "a"])).toEqual({ error: '"a" is on the list twice.' });
    expect(cleanChecklist(Array.from({ length: 16 }, (_, i) => `Step ${i}`))).toHaveProperty("error");
    expect(cleanChecklist(["x".repeat(61)])).toHaveProperty("error");
    expect(cleanChecklist("Booking")).toHaveProperty("error");
  });

  it("shows each step with its tick, and a tick whose step left the list until it is unticked", () => {
    const list = checklistOf(["Booking confirmed", "B/L received"], [
      { step: "booking confirmed", doneByName: "Jana", doneAt: at("2026-11-24T08:00:00Z") },
      { step: "Old step", doneByName: "Petr", doneAt: at("2026-11-23T08:00:00Z") },
    ]);
    expect(list).toEqual([
      { step: "Booking confirmed", doneByName: "Jana", doneAt: "2026-11-24T08:00:00.000Z" },
      { step: "B/L received", doneByName: null, doneAt: null },
      { step: "Old step", doneByName: "Petr", doneAt: "2026-11-23T08:00:00.000Z", offList: true },
    ]);
    expect(tickRefusal("b/l received", true, list)).toBeNull();
    expect(tickRefusal("Old step", false, list)).toBeNull();
    expect(tickRefusal("Old step", true, list)).toContain("only be unticked");
    expect(tickRefusal("Nothing", true, list)).toContain("not on the sailing's checklist");
  });
});

describe("a sailing's history", () => {
  const change = (kind: string, oldNote: string, newNote: string, more = {}) => ({ containerNo: 0, kind, oldAmount: null, newAmount: null, oldNote, newNote, changedByName: "Jana", changedAt: at("2026-11-24T09:00:00Z"), ...more });

  it("says a kept change in words, and leaves a container's costs out", () => {
    expect(changeEntry(change("stage", "Open", "Closed for cargo"))?.text).toBe("Stage: Open → Closed for cargo");
    expect(changeEntry(change("check", "", "B/L received"))?.text).toBe("Ticked: B/L received");
    expect(changeEntry(change("check", "B/L received", ""))?.text).toBe("Unticked: B/L received");
    expect(changeEntry(change("note", "", "Ask Petr"))?.text).toBe("Hand-over note written");
    expect(changeEntry(change("note", "Ask Petr", ""))?.text).toBe("Hand-over note cleared");
    expect(changeEntry(change("cutoff", "2026-12-01", ""))?.text).toBe("Cut-off: 01.12.2026 → none");
    expect(changeEntry(change("containers", "", "", { oldAmount: "1.00", newAmount: "2.00" }))?.text).toBe("Number of containers: 1 → 2");
    expect(changeEntry(change("vessel", "WEEK 51", "MSC Anna"))?.text).toBe("Vessel: WEEK 51 → MSC Anna");
    // Money: never in the history.
    expect(changeEntry(change("ocean", "", "", { containerNo: 1, newAmount: "2100.00" }))).toBeNull();
  });

  const link = (more = {}) => ({ jobNumber: "CZLCL1", linkedAt: at("2026-11-20T08:00:00Z"), linkedByName: "Jana", linkedNote: "", removedAt: null, removedByName: "", removedReason: "", removedNote: "", movedTo: "", ...more });

  it("says how a shipment came on and how it left", () => {
    expect(linkEntries(link()).map((e) => e.text)).toEqual(["CZLCL1 linked"]);
    expect(linkEntries(link({ linkedNote: "Carrier took it late" }))[0]!.text).toBe("CZLCL1 linked after the sailing was closed for cargo: Carrier took it late");
    const moved = linkEntries(link({ removedAt: at("2026-11-22T08:00:00Z"), removedByName: "Petr", removedReason: "moved", removedNote: "Box full", movedTo: "WEEK 52" }));
    expect(moved[1]).toEqual({ at: "2026-11-22T08:00:00.000Z", by: "Petr", kind: "moved", text: "CZLCL1 moved to WEEK 52: Box full" });
    expect(linkEntries(link({ removedAt: at("2026-11-22T08:00:00Z"), removedReason: "shipment_deleted" }))[1]!.text).toBe("CZLCL1 left the sailing: the shipment was deleted");
    expect(linkEntries(link({ removedAt: at("2026-11-22T08:00:00Z"), removedReason: "removed" }))[1]!.text).toBe("CZLCL1 removed from the sailing");
  });

  it("is one list, the latest first, starting with the sailing's making", () => {
    const history = sailingHistory({ createdAt: at("2026-11-19T08:00:00Z"), createdByName: "Jan" }, [change("stage", "Open", "Departed")], [link()]);
    expect(history.map((e) => e.text)).toEqual(["Stage: Open → Departed", "CZLCL1 linked", "Sailing created"]);
    expect(history[2]).toMatchObject({ kind: "created", by: "Jan" });
  });
});
