import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./containers";
import { draftOf, heavyOrderWrong, OPTIONAL_FIELDS, rulesOf, sameAsStored, SETTINGS_FIELDS } from "./settingsForm";

describe("the Loading Planner Settings form", () => {
  it("shows every figure of the rules and gives the same rules back", () => {
    const draft = draftOf(DEFAULT_RULES);
    expect(Object.keys(draft).sort()).toEqual([...SETTINGS_FIELDS, ...OPTIONAL_FIELDS].sort());
    expect(draft).toMatchObject({ doorWidthMm: 50, lengthMm: 100, oogWidthMm: 3500, oogOverEndMm: 1000, oogHeightMm: 3200, warnKg: 5000, moveKg: 10000 });
    expect(rulesOf(draft)).toEqual(DEFAULT_RULES);
  });

  it("holds no rules while a field is cleared", () => {
    expect(rulesOf({ ...draftOf(DEFAULT_RULES), oogHeightMm: null })).toBeNull();
  });

  it("has nothing to save while it holds the stored figures", () => {
    expect(sameAsStored(draftOf(DEFAULT_RULES), DEFAULT_RULES)).toBe(true);
    expect(sameAsStored({ ...draftOf(DEFAULT_RULES), doorHeightMm: 60 }, DEFAULT_RULES)).toBe(false);
    expect(sameAsStored({ ...draftOf(DEFAULT_RULES), warnKg: null }, DEFAULT_RULES)).toBe(false);
  });

  it("refuses a heavy piece moved before it is warned about", () => {
    const rules = (warnKg: number, moveKg: number) => rulesOf({ ...draftOf(DEFAULT_RULES), warnKg, moveKg });
    expect(heavyOrderWrong(rules(5000, 4000))).toBe(true);
    expect(heavyOrderWrong(rules(5000, 5000))).toBe(false);
    expect(heavyOrderWrong(rules(5000, 10000))).toBe(false);
    // An unfinished form is not judged.
    expect(heavyOrderWrong(null)).toBe(false);
  });
});

describe("the road-weight warning in the Settings form (Council Outlay 14, P2)", () => {
  it("may be left empty: the form still holds rules, with no warning", () => {
    const draft = draftOf(DEFAULT_RULES);
    expect(draft).toMatchObject({ gross20Kg: null, gross40Kg: null });
    expect(rulesOf(draft)?.roadWeight).toEqual({ gross20Kg: null, gross40Kg: null });
  });

  it("is saved when filled in, and counts as a change", () => {
    const draft = { ...draftOf(DEFAULT_RULES), gross40Kg: 30000 };
    expect(rulesOf(draft)?.roadWeight).toEqual({ gross20Kg: null, gross40Kg: 30000 });
    expect(sameAsStored(draft, DEFAULT_RULES)).toBe(false);
    expect(sameAsStored(draftOf(DEFAULT_RULES), DEFAULT_RULES)).toBe(true);
  });

  it("reads rules from before it existed as no warning", () => {
    const old = { clearance: DEFAULT_RULES.clearance, oogWarning: DEFAULT_RULES.oogWarning, heavyPiece: DEFAULT_RULES.heavyPiece };
    expect(draftOf(old)).toMatchObject({ gross20Kg: null, gross40Kg: null });
  });
});
