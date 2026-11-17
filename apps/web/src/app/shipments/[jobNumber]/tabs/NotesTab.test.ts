import { describe, expect, it } from "vitest";
import { dueInfo } from "./noteDue";
import { NOTE_DETAILS_MAX, freeCommentsAsNote, freeCommentsMove } from "./noteDraft";

describe("freeCommentsAsNote", () => {
  it("is a title alone when Free Comments is one short line", () => {
    expect(freeCommentsAsNote("  Call the depot \n")).toEqual({ text: "Call the depot" });
  });

  it("keeps the whole text as details when the title does not hold it", () => {
    expect(freeCommentsAsNote("Call the depot\nThey close at 3")).toEqual({ text: "Call the depot", details: "Call the depot\nThey close at 3" });
    const long = "x".repeat(400);
    expect(freeCommentsAsNote(long)).toEqual({ text: `${"x".repeat(299)}…`, details: long });
  });

  it("leaves a text too long for a to-do where it is", () => {
    expect(freeCommentsAsNote("y".repeat(NOTE_DETAILS_MAX + 1))).toBeNull();
    expect(freeCommentsAsNote("   ")).toBeNull();
  });
});

describe("freeCommentsMove", () => {
  it("makes the to-do from the text being typed, not the one saved before, and saves it first", () => {
    const typed = "Book the truck\nPick-up at 8\nCall the driver";
    expect(freeCommentsMove("Call the depot", typed)).toEqual({ saveFirst: typed, note: { text: "Book the truck", details: typed } });
  });

  it("saves nothing first when the text on screen is the saved one", () => {
    expect(freeCommentsMove("Call the depot", "Call the depot")).toEqual({ note: { text: "Call the depot" } });
  });

  it("moves nothing, and so empties nothing, when the typed text can't be one to-do", () => {
    expect(freeCommentsMove("Call the depot", "z".repeat(NOTE_DETAILS_MAX + 1))).toBeNull();
    expect(freeCommentsMove("Call the depot", "  ")).toBeNull();
  });
});

describe("dueInfo", () => {
  const today = "2026-11-10";

  it("is nothing without a deadline", () => {
    expect(dueInfo(null, today)).toBeNull();
  });

  it("is red once the day has passed", () => {
    expect(dueInfo("2026-11-08", today)).toEqual({ label: "08.11.2026", tone: "overdue" });
  });

  it("is amber today and tomorrow", () => {
    expect(dueInfo("2026-11-10", today)).toEqual({ label: "10.11.2026", tone: "soon" });
    expect(dueInfo("2026-11-11", today)).toEqual({ label: "11.11.2026", tone: "soon" });
  });

  it("is grey later, also across a month", () => {
    expect(dueInfo("2026-12-02", today)).toEqual({ label: "02.12.2026", tone: "later" });
  });

  it("stays quiet on a done to-do", () => {
    expect(dueInfo("2026-11-08", today, true)).toEqual({ label: "08.11.2026", tone: "done" });
  });
});
