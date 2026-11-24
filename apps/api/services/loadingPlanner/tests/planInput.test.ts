import { describe, expect, it } from "vitest";
import type { PlanCargoLine, PlanInput } from "../interfaces/interfaces";
import { changedSinceMessage, cleanPlan, cleanResult, linkNeedsCheck } from "../lib/planInput";

const line = (more: Partial<PlanCargoLine> = {}): PlanCargoLine => ({
  id: "line-1",
  name: " Pallet ",
  lengthMm: 1200,
  widthMm: 800,
  heightMm: 1000,
  weightKg: 400.5,
  colli: 10,
  canTurn: true,
  stackable: false,
  ...more,
});
const input = (more: Partial<PlanInput> = {}): PlanInput => ({ name: " Machines to Nhava Sheva ", linkKind: null, linkId: null, linkRef: "", lines: [line()], nominated: null, ...more });
const problemOf = (more: Partial<PlanInput>) => {
  const result = cleanPlan(input(more));
  return "problem" in result ? result.problem : null;
};
const SHIPMENT = "3f1c2b0a-1111-4222-8333-444455556666";

describe("cleanPlan", () => {
  it("trims the names and keeps the cargo as sent", () => {
    const result = cleanPlan(input());
    expect(result).toEqual({ plan: { name: "Machines to Nhava Sheva", linkKind: null, linkId: null, linkRef: "", lines: [line({ name: "Pallet" })], nominated: null, result: null } });
  });

  it("keeps the dangerous goods mark of a line that has one, and adds none", () => {
    const result = cleanPlan(input({ lines: [line({ dg: true }), line({ id: "line-2", dg: false }), line({ id: "line-3" })] }));
    const lines = "plan" in result ? result.plan.lines : [];
    expect(lines.map((l) => l.dg)).toEqual([true, false, undefined]);
    expect(lines[2]).not.toHaveProperty("dg");
  });

  it("accepts a plan with no cargo yet", () => {
    expect(problemOf({ lines: [] })).toBeNull();
  });

  it("asks for a name", () => {
    expect(problemOf({ name: "  " })).toBe("Give the plan a name before saving.");
  });

  it("names the cargo line that is wrong", () => {
    expect(problemOf({ lines: [line({ lengthMm: 0 })] })).toBe('Cargo "Pallet": the length must be between 1 mm and 100 m');
    expect(problemOf({ lines: [line({ heightMm: 12.5 })] })).toBe('Cargo "Pallet": the height must be between 1 mm and 100 m');
    expect(problemOf({ lines: [line({ weightKg: 0 })] })).toBe('Cargo "Pallet": the weight must be more than 0 and at most 1,000 t');
    expect(problemOf({ lines: [line({ colli: 1.5 })] })).toBe('Cargo "Pallet": the colli must be a whole number from 1 to 2,000');
    expect(problemOf({ lines: [line({ name: "", widthMm: -1 })] })).toBe('Cargo "line 1": the width must be between 1 mm and 100 m');
    expect(problemOf({ lines: [line({ weightKg: Number.NaN })] })).toContain("the weight");
  });

  it("refuses two lines with one id and more colli than a plan holds", () => {
    expect(problemOf({ lines: [line(), line()] })).toBe("Two cargo lines have the same id");
    expect(problemOf({ lines: [line({ colli: 1500 }), line({ id: "line-2", colli: 1500 })] })).toBe("A plan holds at most 2,000 colli; this one has 3,000");
  });

  it("keeps a link only when it is whole", () => {
    expect(problemOf({ linkKind: "shipment", linkId: null })).toBe("The linked shipment, quote or sailing is missing");
    expect(problemOf({ linkKind: "quote", linkId: "not-an-id" })).toBe("The linked shipment, quote or sailing is missing");

    const linked = cleanPlan(input({ linkKind: "shipment", linkId: SHIPMENT, linkRef: " CZ00000053 " }));
    expect(linked).toMatchObject({ plan: { linkKind: "shipment", linkId: SHIPMENT, linkRef: "CZ00000053" } });

    // Without a kind, a stray id and reference are dropped.
    const unlinked = cleanPlan(input({ linkKind: null, linkId: SHIPMENT, linkRef: "CZ00000053" }));
    expect(unlinked).toMatchObject({ plan: { linkKind: null, linkId: null, linkRef: "" } });
  });

  it("checks the nominated equipment and drops repeats", () => {
    expect(cleanPlan(input({ nominated: ["40hc", "40hc", "20dc"] }))).toMatchObject({ plan: { nominated: ["40hc", "20dc"] } });
    expect(cleanPlan(input({ nominated: [] }))).toMatchObject({ plan: { nominated: [] } });
    expect(problemOf({ nominated: ["40' HC; DROP"] })).toBe("The nominated equipment is not valid");
  });
});

describe("changedSinceMessage", () => {
  it("names who saved the plan meanwhile and when, in Prague time", () => {
    expect(changedSinceMessage("jana@example.com", new Date("2026-11-23T13:05:00.000Z"))).toBe(
      "This plan was changed by jana@example.com on 23 Nov 2026, 14:05 since you opened it. Reload it and save again.",
    );
    expect(changedSinceMessage("", new Date("2026-07-01T08:00:00.000Z"))).toContain("changed by someone else on 1 Jul 2026, 10:00");
  });
});

describe("linkNeedsCheck", () => {
  const OTHER = "9a8b7c6d-1111-4222-8333-444455556666";
  const link = (linkId: string | null, linkKind: "shipment" | "quote" | null = "shipment") => ({ linkKind, linkId });

  it("checks the link of a new plan and a link that changed", () => {
    expect(linkNeedsCheck(link(SHIPMENT), null)).toBe(true);
    expect(linkNeedsCheck(link(SHIPMENT), link(null, null))).toBe(true);
    expect(linkNeedsCheck(link(SHIPMENT), link(OTHER))).toBe(true);
    expect(linkNeedsCheck(link(SHIPMENT, "quote"), link(SHIPMENT, "shipment"))).toBe(true);
  });

  it("leaves alone a link the plan already has, and a plan without one", () => {
    expect(linkNeedsCheck(link(SHIPMENT), link(SHIPMENT))).toBe(false);
    expect(linkNeedsCheck(link(null, null), link(SHIPMENT))).toBe(false);
    expect(linkNeedsCheck(link(null, null), null)).toBe(false);
  });
});

describe("a box plan's lines and a plan's result (Council Outlay 14, C1 and P4)", () => {
  const SAILING = "3f1c2b0a-1111-4222-8333-444455557777";

  it("links to a sailing as it does to a shipment", () => {
    const result = cleanPlan(input({ linkKind: "sailing", linkId: SAILING, linkRef: " WEEK 51 · Import from Shanghai " }));
    expect(result).toMatchObject({ plan: { linkKind: "sailing", linkId: SAILING, linkRef: "WEEK 51 · Import from Shanghai" } });
    expect(problemOf({ linkKind: "sailing", linkId: null })).toBe("The linked shipment, quote or sailing is missing");
  });

  it("keeps the shipment a line belongs to, trimmed, and leaves a line without one as it is", () => {
    const result = cleanPlan(input({ lines: [line({ group: " CZLCL00000053 " }), line({ id: "line-2", group: "  " }), line({ id: "line-3" })] }));
    expect("plan" in result && result.plan.lines.map((l) => l.group)).toEqual(["CZLCL00000053", undefined, undefined]);
    expect(problemOf({ lines: [line({ group: "x".repeat(61) })] })).toBe("Cargo line 1: the shipment it belongs to is not valid");
  });

  it("keeps what the plan came to, cleaned, and drops anything that is not that", () => {
    expect(cleanResult({ equipment: [{ name: " 40' HC ", count: 2 }], notLoaded: 3 })).toEqual({ equipment: [{ name: "40' HC", count: 2 }], notLoaded: 3 });
    expect(cleanResult({ equipment: [], notLoaded: 0 })).toEqual({ equipment: [], notLoaded: 0 });
    expect(cleanResult(null)).toBeNull();
    expect(cleanResult(undefined)).toBeNull();
    expect(cleanResult({ equipment: [{ name: "40' HC", count: 0 }], notLoaded: 0 })).toBeNull();
    expect(cleanResult({ equipment: [{ name: "", count: 1 }], notLoaded: 0 })).toBeNull();
    expect(cleanResult({ equipment: [{ name: "40' HC", count: 1.5 }], notLoaded: 0 })).toBeNull();
    expect(cleanResult({ equipment: [], notLoaded: -1 })).toBeNull();
    // A result that is not what it should be does not stop the plan from being saved.
    expect(cleanPlan(input({ result: { equipment: [], notLoaded: -1 } }))).toMatchObject({ plan: { result: null } });
  });
});

describe("dangerous goods and lashing notes on a plan (Council Outlay 14, P11)", () => {
  const cleaned = (more: Partial<PlanInput>) => {
    const result = cleanPlan(input(more));
    if ("problem" in result) throw new Error(result.problem);
    return result.plan;
  };

  it("keeps a line's UN number, class and lashing note, trimmed, and stores none as no field", () => {
    const [kept, bare] = cleaned({ lines: [line({ id: "a", un: " 1263 ", dgClass: " 3 ", lashing: "  2 belts across  " }), line({ id: "b", un: "", dgClass: "", lashing: " " })] }).lines;
    expect(kept).toMatchObject({ un: "1263", dgClass: "3", lashing: "2 belts across" });
    expect(bare).not.toHaveProperty("un");
    expect(bare).not.toHaveProperty("dgClass");
    expect(bare).not.toHaveProperty("lashing");
  });

  it("refuses a UN number that is not four digits, a class that is none, and a lashing note that is too long", () => {
    expect(problemOf({ lines: [line({ un: "12" })] })).toContain("UN number is four digits");
    expect(problemOf({ lines: [line({ dgClass: "flammable" })] })).toContain("class is like 3, 2.1 or 1.4S");
    expect(problemOf({ lines: [line({ lashing: "x".repeat(201) })] })).toContain("lashing note to 200 characters");
    for (const dgClass of ["3", "2.1", "1.4S", "9", "6.1"]) expect(problemOf({ lines: [line({ dgClass })] })).toBeNull();
  });

  it("keeps the plan's note trimmed, leaves the stored one alone when none is sent, and refuses one that is too long", () => {
    expect(cleaned({ note: "  Dunnage under the tank.  " }).note).toBe("Dunnage under the tank.");
    expect(cleaned({ note: "" }).note).toBe("");
    expect(cleaned({})).not.toHaveProperty("note");
    expect(problemOf({ note: "x".repeat(1001) })).toContain("plan's note to 1,000 characters");
  });
});

describe("pins on a plan's lines (Council Outlay 14, P8)", () => {
  it("keeps a line's end and container number, and stores none as no field", () => {
    const result = cleanPlan(input({ lines: [line({ id: "a", pinEnd: "doors", pinBox: 2 }), line({ id: "b" })] }));
    if ("problem" in result) throw new Error(result.problem);
    expect(result.plan.lines[0]).toMatchObject({ pinEnd: "doors", pinBox: 2 });
    expect(result.plan.lines[1]).not.toHaveProperty("pinEnd");
    expect(result.plan.lines[1]).not.toHaveProperty("pinBox");
  });

  it("refuses an end that is none and a container number out of 1 to 9", () => {
    expect(problemOf({ lines: [line({ pinEnd: "middle" as "front" })] })).toContain("front wall or to the doors");
    expect(problemOf({ lines: [line({ pinBox: 0 })] })).toContain("from 1 to 9");
    expect(problemOf({ lines: [line({ pinBox: 10 })] })).toContain("from 1 to 9");
    expect(problemOf({ lines: [line({ pinBox: 1.5 })] })).toContain("from 1 to 9");
  });
});
