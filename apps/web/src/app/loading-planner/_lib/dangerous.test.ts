import { describe, expect, it } from "vitest";
import { completeLine, newDraftLine, planFingerprint, type DraftLine } from "./cargoForm";
import { DEFAULT_RULES } from "./containers";
import { classesIn, cleanClass, cleanUn, dgProblem, dgWarning, dgWords, isDangerous, lashingNotes } from "./dangerous";
import type { CargoLine } from "./gauge";
import { planLoad } from "./plan";

const line = (id: string, more: Partial<CargoLine> = {}): CargoLine => ({ id, name: id, lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 300, colli: 1, canTurn: true, stackable: false, ...more });

describe("dangerous goods and lashing notes on a plan (Council Outlay 14, P11)", () => {
  it("reads a UN number and a class as the job writes them, and nothing out of anything else", () => {
    expect(cleanUn(" UN 1263 ")).toBe("1263");
    expect(cleanUn("un1263")).toBe("1263");
    expect(cleanUn("12")).toBe("");
    expect(cleanUn(null)).toBe("");
    expect(cleanClass("Class 3")).toBe("3");
    expect(cleanClass("1.4s")).toBe("1.4S");
    expect(cleanClass("flammable")).toBe("");
  });

  it("names a line's dangerous goods", () => {
    expect(dgWords({ un: "1263", dgClass: "3" })).toBe("UN 1263 · class 3");
    expect(dgWords({ dgClass: "2.1" })).toBe("class 2.1");
    expect(dgWords({ dg: true })).toBe("DG");
    expect(dgWords({})).toBe("");
    expect(isDangerous({ un: "1263" })).toBe(true);
    expect(isDangerous({})).toBe(false);
  });

  it("says what is wrong with a typed UN number or class", () => {
    expect(dgProblem("1263", "3")).toBeNull();
    expect(dgProblem("", "")).toBeNull();
    expect(dgProblem("126", "3")).toContain("four digits");
    expect(dgProblem("1263", "x")).toContain("like 3, 2.1 or 1.4S");
  });

  it("warns when two classes share a container, and says nothing for one class or none", () => {
    const lines = [line("paint", { dg: true, un: "1263", dgClass: "3" }), line("acid", { dg: true, un: "1789", dgClass: "8" }), line("boxes")];
    const factsOf = (id: string) => lines.find((l) => l.id === id);
    const [load] = planLoad(lines, ["40hc"], DEFAULT_RULES).loads;
    expect(classesIn(load!, factsOf)).toEqual(["3", "8"]);
    expect(dgWarning(load!, factsOf)).toMatch(/^Dangerous goods of classes 3 and 8 share this container: check their segregation/);
    const [single] = planLoad([lines[0]!, lines[2]!], ["40hc"], DEFAULT_RULES).loads;
    expect(dgWarning(single!, factsOf)).toBeNull();
  });

  it("lists the lashing notes by line number", () => {
    const lines = [line("tank", { lashing: " 4 chains " }), line("boxes"), line("drum", { lashing: "strapped to the pallet" })];
    expect(lashingNotes(lines, (id) => lines.findIndex((l) => l.id === id) + 1)).toEqual(["1 · tank: 4 chains", "3 · drum: strapped to the pallet"]);
  });

  it("saves them with the line, and a change of them or of the plan's note is something to save", () => {
    const draft: DraftLine = { ...newDraftLine("a"), name: "Paint", lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 300, dg: true, un: "1263", dgClass: "3", lashing: " 2 belts " };
    expect(completeLine(draft)).toMatchObject({ dg: true, un: "1263", dgClass: "3", lashing: "2 belts" });
    expect(completeLine({ ...draft, un: undefined, dgClass: undefined, lashing: " " })).not.toHaveProperty("un");
    const print = (lines: DraftLine[], note = "") => planFingerprint("Plan", lines, null, null, note);
    expect(print([draft])).not.toBe(print([{ ...draft, dgClass: "8" }]));
    expect(print([draft])).not.toBe(print([{ ...draft, lashing: "3 belts" }]));
    expect(print([draft])).not.toBe(print([draft], "Timber under the tank"));
    expect(print([draft], " note ")).toBe(print([draft], "note"));
  });
});
