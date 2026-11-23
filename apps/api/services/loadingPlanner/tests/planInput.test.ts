import { describe, expect, it } from "vitest";
import type { LoadingPlanItem, PlanCargoLine, PlanInput } from "../interfaces/interfaces";
import { cleanPlan, linkNeedsCheck, MAX_PIECES, summaryOf } from "../lib/planInput";

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
    expect(result).toEqual({ plan: { name: "Machines to Nhava Sheva", linkKind: null, linkId: null, linkRef: "", lines: [line({ name: "Pallet" })], nominated: null } });
  });

  it("accepts a plan with no cargo yet", () => {
    expect(problemOf({ lines: [] })).toBeNull();
  });

  it("asks for a name", () => {
    expect(problemOf({ name: "  " })).toBe("Give the plan a name");
  });

  it("names the cargo line that is wrong", () => {
    expect(problemOf({ lines: [line({ lengthMm: 0 })] })).toBe('Cargo "Pallet": the length must be between 1 mm and 100 m');
    expect(problemOf({ lines: [line({ heightMm: 12.5 })] })).toBe('Cargo "Pallet": the height must be between 1 mm and 100 m');
    expect(problemOf({ lines: [line({ weightKg: 0 })] })).toBe('Cargo "Pallet": the weight must be more than 0 and at most 1,000 t');
    expect(problemOf({ lines: [line({ colli: 1.5 })] })).toBe(`Cargo "Pallet": the colli must be a whole number from 1 to ${MAX_PIECES}`);
    expect(problemOf({ lines: [line({ name: "", widthMm: -1 })] })).toBe('Cargo "line 1": the width must be between 1 mm and 100 m');
    expect(problemOf({ lines: [line({ weightKg: Number.NaN })] })).toContain("the weight");
  });

  it("refuses two lines with one id and more pieces than a plan holds", () => {
    expect(problemOf({ lines: [line(), line()] })).toBe("Two cargo lines have the same id");
    expect(problemOf({ lines: [line({ colli: 1500 }), line({ id: "line-2", colli: 1500 })] })).toBe(`A plan holds at most ${MAX_PIECES} pieces; this one has 3000`);
  });

  it("keeps a link only when it is whole", () => {
    expect(problemOf({ linkKind: "shipment", linkId: null })).toBe("The linked shipment or quote is missing");
    expect(problemOf({ linkKind: "quote", linkId: "not-an-id" })).toBe("The linked shipment or quote is missing");

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

describe("summaryOf", () => {
  it("adds up the colli and the weight", () => {
    const plan: LoadingPlanItem = {
      ...input({ lines: [line(), line({ id: "line-2", colli: 2, weightKg: 1000 })] }),
      id: "p1",
      createdBy: "a@example.com",
      updatedBy: "b@example.com",
      createdAt: "2026-11-23T08:00:00.000Z",
      updatedAt: "2026-11-23T09:00:00.000Z",
    };
    expect(summaryOf(plan)).toMatchObject({ id: "p1", colli: 12, weightKg: 6005, updatedBy: "b@example.com" });
    expect(summaryOf(plan)).not.toHaveProperty("lines");
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
