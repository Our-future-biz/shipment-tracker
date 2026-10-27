import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHARGE_CODES, OFFERED_CHARGE_CODES, chargeLabel, toChargeCode } from "../chargeCodes";

const webCatalogue = () =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/src/lib/chargeCodes.ts"), "utf8");

// One entry per line: { code: "...", label: "...", group: "...", side: "...", modes: ["...", ...], legacy: true }
const entriesOf = (source: string) =>
  [...source.matchAll(/\{ code: "(\w+)", label: "([^"]+)", group: "(\w+)", side: "(\w+)"(?:, modes: \[([^\]]*)\])?(, legacy: true)? \}/g)].map((m) => ({
    code: m[1],
    label: m[2],
    group: m[3],
    side: m[4],
    ...(m[5] ? { modes: [...m[5].matchAll(/"([^"]+)"/g)].map((mode) => mode[1]) } : {}),
    ...(m[6] ? { legacy: true } : {}),
  }));

describe("CHARGE_CODES", () => {
  it("are the same codes, labels, groups and sides as the web's CHARGE_CODES", () => {
    expect(entriesOf(webCatalogue())).toEqual(CHARGE_CODES);
  });

  it("have unique codes and labels", () => {
    expect(new Set(CHARGE_CODES.map((c) => c.code)).size).toBe(CHARGE_CODES.length);
    expect(new Set(CHARGE_CODES.map((c) => c.label.toLowerCase())).size).toBe(CHARGE_CODES.length);
  });

  it("offer every code but the older ones", () => {
    expect(OFFERED_CHARGE_CODES).not.toContain("freight");
    expect(OFFERED_CHARGE_CODES).not.toContain("handling");
    expect(OFFERED_CHARGE_CODES).toContain("road_freight");
    expect(OFFERED_CHARGE_CODES).toContain("customs_import");
  });

  it("are read whole from the web's file, every entry of it", () => {
    expect(webCatalogue().match(/\{ code: "/g)?.length).toBe(CHARGE_CODES.length);
  });
});

describe("toChargeCode", () => {
  it("keeps a code, reads a label or an older key as its code, and keeps other text as typed", () => {
    expect(toChargeCode("road_freight")).toBe("road_freight");
    expect(toChargeCode(" Road freight ")).toBe("road_freight");
    expect(toChargeCode("Ocean freight")).toBe("ocean_freight");
    expect(toChargeCode("road toll surcharge")).toBe("road_toll");
    expect(toChargeCode("CUSTOMS CLEARANCE")).toBe("customs");
    expect(toChargeCode("others")).toBe("other");
    expect(toChargeCode("freight")).toBe("freight");
    expect(toChargeCode("Courier")).toBe("Courier");
  });
});

describe("chargeLabel", () => {
  it("shows the label of a code, of an older key, and other text as it is", () => {
    expect(chargeLabel("thc_origin")).toBe("THC Origin");
    expect(chargeLabel("locals")).toBe("Locals");
    expect(chargeLabel("Courier")).toBe("Courier");
    expect(chargeLabel("")).toBe("");
  });
});
