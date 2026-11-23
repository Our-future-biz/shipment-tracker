import { describe, expect, it } from "vitest";
import { breakEvenMark, fillOfBox, fillWords, fullWords, meterBar, meterScale, meterTone, meterWords, missingNote, noVolumeWords, containersWords, cutoffWarning, oddInBox, oddWarning, overfillWarning, removedReasonWords, rowNotes, shareWords, usedOfLimit, type BoxMeter, type BoxRow, type BoxUtilization } from "./boxUtilization";

const HC = { containerType: "40' HC", insideCbm: 76.4, planningCbm: 64.9, standardKg: 26200, heavyTestedKg: 28400, maxKg: 28400, inlandKg: null as number | null, planningPct: 85, containers: 1 };
const OT = { containerType: "40' OT", insideCbm: 67.3, planningCbm: 57.2, standardKg: 26600, heavyTestedKg: null, maxKg: 28550, inlandKg: null, planningPct: 85, containers: 1 };
const meter = (used: number, limit: number, max: number, state: BoxMeter["state"]): BoxMeter => ({ used, limit, max, pct: Math.floor((used / limit) * 100), free: Math.round((limit - used) * 1000) / 1000, state });
const row = (more: Partial<BoxRow> = {}): BoxRow => ({
  shipmentId: "s1",
  jobNumber: "CZLCL00000001",
  customer: "Alfa",
  status: "active",
  counted: true,
  colli: 1,
  weightKg: 1000,
  volumeCbm: 2,
  freightTons: 2,
  weightMissing: false,
  volumeMissing: false,
  weightSharePct: 3.8,
  volumeSharePct: 3.1,
  notStackable: false,
  dangerous: false,
  outOfGauge: false,
  temperatureControlled: false,
  odd: null,
  implausible: false,
  ...more,
});
const box = (more: Partial<BoxUtilization> = {}): BoxUtilization => ({
  containerType: "40' HC",
  capacity: HC,
  volume: null,
  weight: null,
  fullPct: 0,
  limitedBy: null,
  totals: { shipments: 14, colli: 0, weightKg: 0, volumeCbm: 0, freightTons: 0 },
  missing: { weight: 0, volume: 0 },
  notCounted: 0,
  rows: [],
  ...more,
});

describe("a meter in words", () => {
  it("says the room that is left", () => {
    const volume = meter(52.4, 64.9, 76.4, "room");
    expect(usedOfLimit("volume", volume)).toBe("52.4 of 64.9 cbm");
    expect(meterWords("volume", volume, HC)).toBe("Room for 12.5 cbm");
    expect(meterWords("weight", meter(0, 26200, 28400, "room"), HC)).toBe("Empty: room for 26,200 kg");
    expect(meterTone(volume)).toBe("indigo");
  });

  it("says nearly full, and full at the limit", () => {
    const weight = meter(24100, 26200, 28400, "nearly_full");
    expect(usedOfLimit("weight", weight)).toBe("24,100 of 26,200 kg");
    expect(meterWords("weight", weight, HC)).toBe("Nearly full: room for 2,100 kg");
    expect(meterWords("weight", meter(26200, 26200, 28400, "nearly_full"), HC)).toBe("Full");
    expect(meterTone(weight)).toBe("amber");
  });

  it("says by how much it is over, and what the box can still take", () => {
    expect(meterWords("volume", meter(66.1, 64.9, 76.4, "over"), HC)).toBe("Over the planning volume by 1.2 cbm. The box holds 76.4 cbm inside, so it may still load if the cargo stows well.");
    expect(meterWords("weight", meter(27000, 26200, 28400, "over"), HC)).toBe("Over the standard limit by 800 kg. A heavy-tested box takes up to 28,400 kg.");
    expect(meterWords("weight", meter(27000, 26600, 28550, "over"), OT)).toBe("Over the standard limit by 400 kg. Up to 28,550 kg needs the shipping line's confirmation.");
    expect(meterWords("volume", meter(80, 64.9, 76.4, "beyond"), HC)).toBe("Over by 15.1 cbm: more than the box holds inside (76.4 cbm).");
    expect(meterWords("weight", meter(29000, 26200, 28400, "beyond"), HC)).toBe("Over by 2,800 kg: more than a 40' HC can take (28,400 kg).");
    expect(meterTone(meter(80, 64.9, 76.4, "beyond"))).toBe("red");
  });

  it("draws the bar to the most the box can take, with the limit as a mark", () => {
    const bar = meterBar(meter(52.4, 64.9, 76.4, "room"));
    expect(bar.filledPct).toBeCloseTo(68.59, 1);
    expect(bar.limitPct).toBeCloseTo(84.95, 1);
    expect(meterBar(meter(90, 64.9, 76.4, "beyond")).filledPct).toBe(100);
  });

  it("names the limit and the maximum under the bar", () => {
    expect(meterScale("volume", HC)).toBe("planning 64.9 (85%) · inside 76.4 cbm");
    expect(meterScale("weight", { ...HC, inlandKg: 24000 })).toBe("inland 24,000 · standard 26,200 · at most 28,400 kg");
    expect(meterWords("weight", meter(25000, 24000, 28400, "over"), { ...HC, inlandKg: 24000 })).toBe(
      "Over the inland weight by 1,000 kg. The box itself takes 26,200 kg, so the limit is the leg between the port and the hub.",
    );
    expect(meterScale("weight", HC)).toBe("standard 26,200 · heavy tested 28,400 kg");
    expect(meterScale("weight", OT)).toBe("standard 26,600 · at most 28,550 kg");
  });

  it("says why a type has no volume meter", () => {
    expect(noVolumeWords("40' HFR")).toBe("A flat rack has no walls: its volume is not measured.");
    expect(noVolumeWords("40' HRF")).toBe("No inside sizes are known for a 40' HRF yet: its volume is not measured.");
  });
});

describe("missing figures", () => {
  it("say nothing when every shipment has both", () => {
    expect(missingNote(box())).toBeNull();
  });

  it("say how many shipments lack a figure and what that does to the total", () => {
    expect(missingNote(box({ missing: { weight: 2, volume: 0 } }))).toBe("2 of 14 shipments have no weight: the box is heavier than shown.");
    expect(missingNote(box({ missing: { weight: 0, volume: 1 } }))).toBe("1 of 14 shipments has no volume: the box is fuller than shown.");
    expect(missingNote(box({ missing: { weight: 3, volume: 1 } }))).toBe("3 of 14 shipments have no weight and 1 has no volume: the box is fuller than shown.");
    expect(missingNote(box({ totals: { shipments: 1, colli: 0, weightKg: 0, volumeCbm: 0, freightTons: 0 }, missing: { weight: 1, volume: 0 } }))).toBe("1 of 1 shipment has no weight: the box is heavier than shown.");
  });
});

describe("a shipment's row", () => {
  it("gives its share by the measure it takes more of", () => {
    expect(shareWords(row({ weightSharePct: 24.4, volumeSharePct: 17.3 }))).toBe("24% of weight");
    expect(shareWords(row({ weightSharePct: 3.8, volumeSharePct: 14.8 }))).toBe("15% of volume");
    expect(shareWords(row({ weightSharePct: 36.2, volumeSharePct: null }))).toBe("36% of weight");
    expect(shareWords(row({ weightSharePct: 0.4, volumeSharePct: 0.2 }))).toBe("under 1% of weight");
    expect(shareWords(row({ weightSharePct: 0, volumeSharePct: 0 }))).toBeNull();
    expect(shareWords(row({ weightSharePct: null, volumeSharePct: null }))).toBeNull();
  });

  it("notes what is missing, what to check and what makes the cargo awkward", () => {
    expect(rowNotes(row())).toEqual([]);
    expect(rowNotes(row({ weightMissing: true })).map((n) => n.text)).toEqual(["Weight missing"]);
    expect(rowNotes(row({ weightMissing: true, volumeMissing: true })).map((n) => n.text)).toEqual(["Weight and volume missing"]);
    expect(rowNotes(row({ counted: false, weightMissing: true })).map((n) => n.text)).toEqual(["Cancelled: not counted"]);
    expect(rowNotes(row({ implausible: true, notStackable: true, dangerous: true, outOfGauge: true, temperatureControlled: true })).map((n) => n.text)).toEqual([
      "Check the figures",
      "Not stackable",
      "Dangerous goods",
      "Out of gauge",
      "Temperature controlled",
    ]);
  });
});

describe("how full the box is", () => {
  it("is the fuller meter's percentage, in words", () => {
    expect(fullWords(box({ fullPct: 92 }))).toBe("92% full");
    expect(fullWords(box({ fullPct: 100 }))).toBe("100% full");
    expect(fullWords(box({ fullPct: 104 }))).toBe("Over: 104%");
    expect(fullWords(box({ fullPct: null }))).toBe("—");
    expect(fullWords(box({ fullPct: 0, totals: { shipments: 0, colli: 0, weightKg: 0, volumeCbm: 0, freightTons: 0 } }))).toBe("Empty");
  });
});

describe("a box's fill in short", () => {
  const filled = box({
    volume: meter(52.34, 64.9, 76.4, "room"),
    weight: meter(24100, 26200, 28400, "nearly_full"),
    fullPct: 91,
    totals: { shipments: 5, colli: 212, weightKg: 24100, volumeCbm: 52.34, freightTons: 54.89 },
    rows: [row(), row({ weightMissing: true }), row({ counted: false, weightMissing: true, volumeMissing: true })],
  });

  it("is the same on the sailing's header as on the list", () => {
    expect(fillOfBox(filled)).toEqual({ volume: { pct: 80, state: "room" }, weight: { pct: 91, state: "nearly_full" }, fullPct: 91, shipments: 5, missing: 1 });
  });

  it("is said in one line", () => {
    expect(fillWords(fillOfBox(filled))).toBe("Volume 80%, weight 91% (nearly full) · 5 shipments · 1 without a figure");
    expect(fillWords({ volume: null, weight: { pct: 104, state: "over" }, fullPct: 104, shipments: 1, missing: 0 })).toBe("Weight 104% (over the limit) · 1 shipment");
    expect(fillWords({ volume: null, weight: null, fullPct: null, shipments: 0, missing: 0 })).toBe("No capacity known for this container type · 0 shipments");
  });

  it("warns before a link would overfill the box, and only then", () => {
    expect(overfillWarning(filled, { shipments: 1, weightKg: 2000, volumeCbm: 5 })).toBeNull();
    expect(overfillWarning(filled, { shipments: 0, weightKg: 0, volumeCbm: 0 })).toBeNull();
    expect(overfillWarning(filled, { shipments: 1, weightKg: 4200, volumeCbm: 5 })).toBe("Linking this shipment would bring the box's weight to 108% (over by 2,100 kg). You can still link it.");
    expect(overfillWarning(filled, { shipments: 3, weightKg: 4200, volumeCbm: 20 })).toBe(
      "Linking these 3 shipments would bring the box's volume to 111% (over by 7.4 cbm) and its weight to 108% (over by 2,100 kg). You can still link them.",
    );
    expect(overfillWarning(box(), { shipments: 2, weightKg: 99999, volumeCbm: 999 })).toBeNull();
  });
});

describe("a shipment of another kind than the box is for", () => {
  it("follows the server's rule", () => {
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "Consolidation" })).toBeNull();
    expect(oddInBox("sea_lcl", { freightMode: null, loadType: undefined })).toBeNull();
    expect(oddInBox("sea_lcl", { freightMode: "Air Freight", loadType: "Consolidation" })).toBe("Air Freight");
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "Full Load" })).toBe("Full Load");
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "Project Shipment" })).toBe("Project Shipment");
    expect(oddInBox("sea_fcl", { freightMode: "Sea Freight", loadType: "Full Load" })).toBeNull();
    expect(oddInBox("air", { freightMode: "Sea Freight", loadType: "" })).toBe("Sea Freight");
    expect(oddInBox("road", { freightMode: "Road Freight", loadType: "Full Load" })).toBeNull();
  });

  it("is remarked on in its row, and is not linked", () => {
    expect(rowNotes(row({ odd: "Air Freight" })).map((n) => n.text)).toEqual(["Air Freight: not what this box is for"]);
    expect(oddWarning([])).toBeNull();
    expect(oddWarning(["Full Load"])).toBe("This shipment is Full Load: not what this box is for. Untick it to link the others.");
    expect(oddWarning(["Full Load", "Air Freight", "Full Load"])).toBe("3 of these shipments are not what this box is for (Full Load, Air Freight). Untick them to link the others.");
  });

  it("says why a shipment was taken off a sailing", () => {
    expect(removedReasonWords({ reason: "removed" })).toBe("Removed by hand");
    expect(removedReasonWords({ reason: "shipment_deleted" })).toBe("The shipment was deleted");
    expect(removedReasonWords({ reason: "" })).toBe("Not recorded");
    expect(removedReasonWords({ reason: "moved", movedTo: "WEEK 52", note: "Box full" })).toBe("Moved to WEEK 52: Box full");
    expect(removedReasonWords({ reason: "moved", movedTo: "", note: "" })).toBe("Moved to another sailing");
  });
});

describe("several containers and the cut-off", () => {
  it("names a sailing's containers", () => {
    expect(containersWords({ containerType: "40' HC", containerCount: 1 })).toBe("40' HC");
    expect(containersWords({ containerType: "40' HC", containerCount: 2 })).toBe("2 × 40' HC");
    expect(containersWords({ containerType: "20' DC" })).toBe("20' DC");
  });

  it("speaks of boxes when the sailing has more than one", () => {
    const two = { ...HC, containers: 2, insideCbm: 152.8, planningCbm: 129.8, standardKg: 52400, heavyTestedKg: 56800, maxKg: 56800 };
    expect(meterWords("volume", meter(131, 129.8, 152.8, "over"), two)).toBe("Over the planning volume by 1.2 cbm. The boxes hold 152.8 cbm inside, so it may still load if the cargo stows well.");
    expect(meterWords("weight", meter(53000, 52400, 56800, "over"), two)).toBe("Over the standard limit by 600 kg. Heavy-tested boxes take up to 56,800 kg.");
    expect(meterWords("weight", meter(57000, 52400, 56800, "beyond"), two)).toBe("Over by 4,600 kg: more than 2 × 40' HC can take (56,800 kg).");
  });

  it("remarks on linking after the cut-off, not on the day or before", () => {
    expect(cutoffWarning("2026-11-20", "2026-11-23", "20.11.2026")).toBe("The cut-off of this sailing was 20.11.2026. You can still link shipments.");
    expect(cutoffWarning("2026-11-23", "2026-11-23", "23.11.2026")).toBeNull();
    expect(cutoffWarning("2026-11-30", "2026-11-23", "30.11.2026")).toBeNull();
    expect(cutoffWarning(null, "2026-11-23", "")).toBeNull();
  });
});

describe("the break-even mark on a meter", () => {
  it("stands at the break-even share of what is loaded", () => {
    const mark = breakEvenMark("volume", meter(48, 64.9, 76.4, "room"), 0.5)!;
    expect(mark.onBar).toBe(true);
    expect(mark.pct).toBeCloseTo((24 / 76.4) * 100, 5);
    expect(mark.words).toBe("Break-even at 24 cbm: reached, with the same mix of cargo");
  });
  it("says when it is still ahead, and when the box cannot take it", () => {
    expect(breakEvenMark("volume", meter(40, 64.9, 76.4, "room"), 1.5)!.words).toBe("Break-even at 60 cbm, with the same mix of cargo");
    const beyond = breakEvenMark("volume", meter(40, 64.9, 76.4, "room"), 2.5)!;
    expect(beyond).toMatchObject({ onBar: false, pct: 100, words: "Break-even at 100 cbm: more than the box takes, with the same mix of cargo" });
  });
  it("is not drawn without a break-even or on an empty meter", () => {
    expect(breakEvenMark("volume", meter(40, 64.9, 76.4, "room"), null)).toBeNull();
    expect(breakEvenMark("weight", meter(0, 26200, 28400, "room"), 0.5)).toBeNull();
  });
});
