import { describe, expect, it } from "vitest";
import { compareFigures, equipmentWords, sameEquipment } from "./compare";
import { DEFAULT_RULES } from "./containers";
import type { CargoLine } from "./gauge";
import { planLoad } from "./plan";

const pallets: CargoLine = { id: "p", name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1500, weightKg: 400, colli: 20, canTurn: true, stackable: false };

describe("Compare alternatives (Council Outlay 14, P6)", () => {
  it("says what a plan comes to", () => {
    const twenty = compareFigures(planLoad([pallets], ["20dc"], DEFAULT_RULES));
    const forty = compareFigures(planLoad([pallets], ["40hc"], DEFAULT_RULES));
    expect(twenty).toMatchObject({ containers: "2 × 20' DC", count: 2, notLoaded: 0, outOfGauge: 0, linerConfirm: 0 });
    expect(forty).toMatchObject({ containers: "1 × 40' HC", count: 1, notLoaded: 0 });
    // 8,000 kg in 28,600 kg of payload; 20 pallets of 0.96 m² on a floor of 28.3 m².
    expect(Math.round(forty.payloadPct)).toBe(28);
    expect(Math.round(forty.floorPct)).toBe(68);
  });

  it("counts what an alternative cannot take, and the containers out of gauge", () => {
    const tall: CargoLine = { ...pallets, id: "t", name: "Silo", heightMm: 3000, colli: 1 };
    expect(compareFigures(planLoad([tall], ["40hc"], DEFAULT_RULES))).toMatchObject({ containers: "", count: 0, notLoaded: 1 });
    expect(compareFigures(planLoad([tall], ["40ot"], DEFAULT_RULES))).toMatchObject({ containers: "1 × 40' OT", outOfGauge: 1 });
  });

  it("names the equipment and tells the same nomination in another order", () => {
    expect(equipmentWords(null)).toBe("Planner chooses");
    expect(equipmentWords(["40hc", "20dc"])).toBe("20' DC, 40' HC");
    expect(sameEquipment(["40hc", "20dc"], ["20dc", "40hc"])).toBe(true);
    expect(sameEquipment(["40hc"], null)).toBe(false);
    expect(sameEquipment(null, null)).toBe(true);
  });
});
