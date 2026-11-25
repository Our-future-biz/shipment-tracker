import { describe, expect, it } from "vitest";
import { afterChecklistSave, checklistTexts, noteChangedMeanwhile, noteEditorOnRead, noteRequest, toTell } from "./sailingLog";

describe("the customers still to tell (Council Outlay 14, C6)", () => {
  it("are the rows nobody has told yet", () => {
    const told = { at: "2026-11-24T09:00:00Z", byName: "Eva", channel: "email" };
    const rows = [
      { shipmentId: "a", told: null },
      { shipmentId: "b", told },
      { shipmentId: "c", told: null },
    ];
    expect(toTell(rows).map((r) => r.shipmentId)).toEqual(["a", "c"]);
    expect(toTell([{ shipmentId: "b", told }])).toEqual([]);
    expect(toTell([])).toEqual([]);
  });
});

describe("the checklists in Co-Loading settings (Council Outlay 14, C5)", () => {
  const stored = { checklistImport: ["Booking confirmed", "Seal checked"], checklistExport: ["VGM sent"] };

  it("shows each stored list one step per line, and nothing before they are read", () => {
    expect(checklistTexts(stored)).toEqual({ import: "Booking confirmed\nSeal checked", export: "VGM sent" });
    expect(checklistTexts(null)).toEqual({ import: "", export: "" });
  });

  it("keeps an unsaved edit of the other list when one is saved", () => {
    const typing = { import: "Booking confirmed\n\n  Seal checked  \nDocs out", export: "VGM sent\nHalf typed step" };
    const saved = { checklistImport: ["Booking confirmed", "Seal checked", "Docs out"], checklistExport: ["VGM sent"] };
    expect(afterChecklistSave(typing, "import", saved)).toEqual({ import: "Booking confirmed\nSeal checked\nDocs out", export: "VGM sent\nHalf typed step" });
    expect(afterChecklistSave(typing, "export", saved)).toEqual({ import: typing.import, export: "VGM sent" });
  });
});

describe("the hand-over note's box (Council Outlay 14, C5)", () => {
  it("sends the note with the stored one it started from, so a colleague's change meanwhile is refused, not written over", () => {
    expect(noteRequest({ text: "  Seal 4471 checked \n", startedFrom: "Booked" })).toEqual({ note: "Seal 4471 checked", expected: "Booked" });
    // Cleared: an empty note, still with what it started from.
    expect(noteRequest({ text: "   ", startedFrom: "Booked" })).toEqual({ note: "", expected: "Booked" });
    expect(noteRequest({ text: "First note", startedFrom: "" })).toEqual({ note: "First note", expected: "" });
  });

  it("follows the stored note while nothing else is typed, and after one's own save", () => {
    expect(noteEditorOnRead({ text: "", startedFrom: "" }, "Booked")).toEqual({ text: "Booked", startedFrom: "Booked" });
    expect(noteEditorOnRead({ text: "Booked", startedFrom: "Booked" }, "Booked, seal checked")).toEqual({ text: "Booked, seal checked", startedFrom: "Booked, seal checked" });
    // One's own save comes back trimmed: the box takes it and starts from it.
    expect(noteEditorOnRead({ text: "Mine \n", startedFrom: "Booked" }, "Mine")).toEqual({ text: "Mine", startedFrom: "Mine" });
  });

  it("keeps what is typed when a colleague's note is read meanwhile, and shows theirs beside it", () => {
    const typing = { text: "Mine, not saved yet", startedFrom: "Booked" };
    const after = noteEditorOnRead(typing, "Theirs");
    expect(after).toBe(typing);
    expect(noteChangedMeanwhile(after, "Theirs")).toBe(true);
    // A second save still names the note it started from: refused again until theirs is taken or kept over.
    expect(noteRequest(after).expected).toBe("Booked");
    // "Keep mine": it now starts from theirs, so the next save writes over it on purpose.
    expect(noteChangedMeanwhile({ ...after, startedFrom: "Theirs" }, "Theirs")).toBe(false);
    expect(noteRequest({ ...after, startedFrom: "Theirs" })).toEqual({ note: "Mine, not saved yet", expected: "Theirs" });
    // Nothing to show while the box agrees with the stored note, or nothing changed.
    expect(noteChangedMeanwhile({ text: "Theirs", startedFrom: "Booked" }, "Theirs")).toBe(false);
    expect(noteChangedMeanwhile({ text: "Mine", startedFrom: "Booked" }, "Booked")).toBe(false);
  });
});
