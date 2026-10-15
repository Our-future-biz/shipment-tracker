import { describe, expect, it } from "vitest";
import { EMPTY_HUB, hubIsSet, hubProblems, settingsProblems, vehicleTypeProblems, waitingFreeOf, workingDaysText, type SettingsDraft } from "./settings";

const van = { code: "van", label: "Van", capacityLdm: 3, capacityKg: 1200, palletPlaces: 6, tailLift: false, active: true };
const draft: SettingsDraft = {
  serviceLevels: [{ code: "D1", label: "+1 day", workingDays: 1, cutoff: "12:00", active: true }],
  vehicleTypes: [van],
  factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
  marginFloor: { percent: 8, minAmountCzk: 300 },
  transportOrder: { emailSubject: "Transport order {orderRef}", emailBody: "Dear {haulier}" },
  hub: EMPTY_HUB,
  waitingFreeMinutes: { LTL: 30, FTL: 120 },
};

describe("vehicleTypeProblems", () => {
  it("passes a valid type", () => {
    expect(vehicleTypeProblems(van)).toEqual([]);
  });

  it("holds the contract's limits", () => {
    expect(vehicleTypeProblems({ ...van, code: "Mega 13.6" })).toContain("code uses a–z, 0–9 and _ only");
    expect(vehicleTypeProblems({ ...van, capacityLdm: 15.4 })).toEqual([]);
    expect(vehicleTypeProblems({ ...van, capacityLdm: 15.5 })).toContain("LDM must be above 0 and at most 15.4");
    expect(vehicleTypeProblems({ ...van, capacityKg: 0 })).toContain("kg must be above 0");
    expect(vehicleTypeProblems({ ...van, palletPlaces: 2.5 })).toContain("pallet places must be a whole number, 0 or more");
  });
});

describe("settingsProblems", () => {
  it("passes valid settings", () => {
    expect(settingsProblems(draft)).toEqual([]);
  });

  it("names each problem", () => {
    expect(
      settingsProblems({
        ...draft,
        serviceLevels: [{ ...draft.serviceLevels[0]!, cutoff: "25:00" }],
        vehicleTypes: [van, { ...van, label: "Van 2" }],
        marginFloor: { percent: 120, minAmountCzk: -1 },
        transportOrder: { emailSubject: " ", emailBody: "x" },
      }),
    ).toEqual([
      "+1 day: cut-off must be HH:MM",
      "Van 2: code van is used twice",
      "Margin floor % must be 0–100",
      "Minimum margin cannot be negative",
      "Transport-order e-mail subject is required",
    ]);
  });
});

describe("workingDaysText", () => {
  it("says when each level is due", () => {
    expect(workingDaysText("D1", 1)).toBe("1 working day");
    expect(workingDaysText("D3", 3)).toBe("3 working days");
    expect(workingDaysText("EXP_SAMEDAY", 0)).toBe("Same day");
    expect(workingDaysText("EXP_FIXED", 0)).toBe("Date agreed per order");
  });
});

describe("our warehouse (hub)", () => {
  const hub = { name: "CTO sklad", street: "Na Hůrce 1", postcode: "16100", city: "Praha", country: "CZ" as const };

  it("may stay empty, but not half-filled", () => {
    expect(hubProblems(EMPTY_HUB)).toEqual([]);
    expect(hubProblems(hub)).toEqual([]);
    expect(hubProblems({ ...EMPTY_HUB, city: "Praha" })).toEqual(["Our warehouse: name", "Our warehouse: street", "Our warehouse: postcode (PSČ) has 5 digits"]);
    expect(settingsProblems({ ...draft, hub: { ...hub, postcode: "161" } })).toEqual(["Our warehouse: postcode (PSČ) has 5 digits"]);
  });

  it("is set once street, PSČ and city are there", () => {
    expect(hubIsSet(EMPTY_HUB)).toBe(false);
    expect(hubIsSet(null)).toBe(false);
    expect(hubIsSet(hub)).toBe(true);
  });
});

describe("free waiting time", () => {
  it("defaults to LTL 30 and FTL 120 minutes for settings saved before it existed", () => {
    expect(waitingFreeOf(null)).toEqual({ LTL: 30, FTL: 120 });
    expect(waitingFreeOf({ waitingFreeTime: { ltlMinutes: 45, ftlMinutes: 90 } })).toEqual({ LTL: 45, FTL: 90 });
  });

  it("is whole minutes, 0 or more", () => {
    expect(settingsProblems({ ...draft, waitingFreeMinutes: { LTL: -5, FTL: 120 } })).toEqual(["Free waiting time LTL: whole minutes, 0 or more"]);
  });
});
