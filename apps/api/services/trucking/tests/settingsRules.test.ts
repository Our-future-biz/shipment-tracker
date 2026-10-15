import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { cleanSettings, DEFAULT_SETTINGS, readSettings, SERVICE_LEVEL_CODES, settingsChanges } from "../lib/settingsRules";
import type { TruckingSettingsInput } from "../interfaces/interfaces";

const clone = (): TruckingSettingsInput => JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

describe("trucking settings checks", () => {
  it("accepts the defaults as they are", () => {
    expect(cleanSettings(clone())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.serviceLevels.map((l) => l.code)).toEqual(SERVICE_LEVEL_CODES);
    expect(DEFAULT_SETTINGS.factors).toEqual({ kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 });
    expect(DEFAULT_SETTINGS.marginFloor).toEqual({ percent: 8, minAmountCzk: 300 });
  });

  it("needs all 8 service levels, each once, and returns them in the fixed order with fixed working days", () => {
    const s = clone();
    s.serviceLevels.pop();
    expect(() => cleanSettings(s)).toThrow("All 8 service levels must be sent; missing: EXP_FIXED");
    const twice = clone();
    twice.serviceLevels[1] = { ...twice.serviceLevels[0] };
    expect(() => cleanSettings(twice)).toThrow("Service level D1 is listed twice");
    const shuffled = clone();
    shuffled.serviceLevels.reverse();
    shuffled.serviceLevels[0].workingDays = 9;
    const out = cleanSettings(shuffled);
    expect(out.serviceLevels.map((l) => l.code)).toEqual(SERVICE_LEVEL_CODES);
    expect(out.serviceLevels.find((l) => l.code === "EXP_FIXED")!.workingDays).toBe(0);
  });

  it("checks the cut-off format", () => {
    for (const bad of ["24:00", "9:00", "12:60", "noon", ""]) {
      const s = clone();
      s.serviceLevels[0].cutoff = bad;
      expect(() => cleanSettings(s)).toThrow("Service level D1: the cut-off must be a time like 12:00");
    }
    const ok = clone();
    ok.serviceLevels[0].cutoff = "23:59";
    expect(cleanSettings(ok).serviceLevels[0].cutoff).toBe("23:59");
  });

  it("limits loading metres to more than 0 and at most 15.4", () => {
    const over = clone();
    over.vehicleTypes[0].capacityLdm = 15.5;
    expect(() => cleanSettings(over)).toThrow(/loading metres must be more than 0 and at most 15.4/);
    const zero = clone();
    zero.vehicleTypes[0].capacityLdm = 0;
    expect(() => cleanSettings(zero)).toThrow(/loading metres/);
    const roadTrain = clone();
    roadTrain.vehicleTypes[0].capacityLdm = 15.4;
    expect(cleanSettings(roadTrain).vehicleTypes[0].capacityLdm).toBe(15.4);
  });

  it("checks vehicle codes, payload and pallet places", () => {
    const code = clone();
    code.vehicleTypes[0].code = "Big Truck";
    expect(() => cleanSettings(code)).toThrow(/may only use a-z, 0-9 and _/);
    const dup = clone();
    dup.vehicleTypes[1].code = "van";
    expect(() => cleanSettings(dup)).toThrow('Vehicle type code "van" is used twice');
    const kg = clone();
    kg.vehicleTypes[0].capacityKg = 0;
    expect(() => cleanSettings(kg)).toThrow(/payload in kg must be more than 0/);
    const pp = clone();
    pp.vehicleTypes[0].palletPlaces = 1.5;
    expect(() => cleanSettings(pp)).toThrow(/pallet places must be a whole number/);
  });

  it("needs factors above 0 and a margin floor in range", () => {
    for (const key of ["kgPerLdm", "kgPerCbm", "kgPerPalletPlace"] as const) {
      const s = clone();
      s.factors[key] = 0;
      expect(() => cleanSettings(s)).toThrow(/must be more than 0/);
    }
    const pct = clone();
    pct.marginFloor.percent = 101;
    expect(() => cleanSettings(pct)).toThrow("The margin floor percent must be between 0 and 100");
    const min = clone();
    min.marginFloor.minAmountCzk = -1;
    expect(() => cleanSettings(min)).toThrow("The minimum margin in CZK cannot be negative");
  });

  it("needs the transport-order texts", () => {
    const s = clone();
    s.transportOrder.emailSubject = "  ";
    expect(() => cleanSettings(s)).toThrow("The transport-order e-mail subject is required");
  });

  it("reads stored settings with every level in order and lists only the changed parts", () => {
    const stored = clone();
    stored.serviceLevels = stored.serviceLevels.slice(0, 3).reverse();
    expect(readSettings(stored).serviceLevels.map((l) => l.code)).toEqual(SERVICE_LEVEL_CODES);
    const next = clone();
    next.factors.kgPerLdm = 1850;
    expect(settingsChanges(clone(), next)).toEqual({ factors: { before: DEFAULT_SETTINGS.factors, after: next.factors } });
  });
});

describe("our warehouse (hub) in the settings", () => {
  it("is empty by default, kept from an older row without it, and saved cleaned", () => {
    expect(DEFAULT_SETTINGS.hub).toEqual({ name: "", street: "", postcode: "", city: "", country: "CZ" });
    const { hub: _hub, ...older } = clone();
    void _hub;
    expect(readSettings(older).hub).toEqual(DEFAULT_SETTINGS.hub);
    const s = clone();
    s.hub = { name: "Sklad", street: "", postcode: "250 01", city: "Brandýs", country: "CZ" };
    expect(cleanSettings(s).hub).toEqual({ name: "Sklad", street: "", postcode: "25001", city: "Brandýs", country: "CZ" });
  });
});

describe("free waiting time (Phase 6)", () => {
  it("defaults to LTL 30 / FTL 120 minutes, also for a row saved before it existed; whole minutes 0..1440", () => {
    expect(DEFAULT_SETTINGS.waitingFreeTime).toEqual({ ltlMinutes: 30, ftlMinutes: 120 });
    const { waitingFreeTime: _w, ...older } = DEFAULT_SETTINGS;
    expect(readSettings(older as TruckingSettingsInput).waitingFreeTime).toEqual({ ltlMinutes: 30, ftlMinutes: 120 });
    const s = structuredClone(DEFAULT_SETTINGS);
    s.waitingFreeTime = { ltlMinutes: 45, ftlMinutes: 90 };
    expect(cleanSettings(s).waitingFreeTime).toEqual({ ltlMinutes: 45, ftlMinutes: 90 });
    s.waitingFreeTime = { ltlMinutes: 12.5, ftlMinutes: 90 };
    expect(() => cleanSettings(s)).toThrow(/whole minutes/);
    s.waitingFreeTime = { ltlMinutes: 30, ftlMinutes: 2000 };
    expect(() => cleanSettings(s)).toThrow(/FTL/);
  });
});
