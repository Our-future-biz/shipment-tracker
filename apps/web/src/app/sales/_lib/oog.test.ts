import { describe, expect, it } from "vitest";
import { answerInGauge, checkOog, gaugeAdvice, hasGauge, hasOogEquipment, inGaugeMaximum, isOogType, oogMissing, oogSummary, oogTypes } from "./oog";

describe("answerInGauge", () => {
  it("pre-fills the most the equipment takes in gauge when Yes is answered before any measure is typed", () => {
    expect(answerInGauge({}, true, ["40' FR"])).toEqual({ inGauge: true, length: 1150, width: 244, height: 194 });
    // a type without known measures has nothing to pre-fill
    expect(answerInGauge({ inGauge: false }, true, ["40' HC"])).toEqual({ inGauge: true });
  });

  it("keeps measures already typed whichever way the answer goes - a mis-click does not put the maximum in their place", () => {
    const typed = { inGauge: false, length: 1262, width: 300, height: 250 };
    expect(answerInGauge(typed, true, ["40' FR"])).toEqual({ inGauge: true });
    expect(answerInGauge({ ...typed, inGauge: true }, false, ["40' FR"])).toEqual({ inGauge: false });
  });
});

describe("out-of-gauge equipment", () => {
  it("knows open tops and flat racks by their type", () => {
    expect(["20' OT", "40' HOT", "40' FR", "20' FR"].map(isOogType)).toEqual([true, true, true, true]);
    expect(["40' HC", "40' RF", "20' GP", undefined].map(isOogType)).toEqual([false, false, false, false]);
  });

  it("asks a Sea FCL quote with such a box, and lists each type once", () => {
    const containers = [{ qty: 1, type: "40' FR" }, { qty: 2, type: "40' HC" }, { qty: 1, type: "40' FR" }, { qty: 1, type: "20' OT" }];
    expect(hasOogEquipment({ serviceType: "Sea FCL", containers })).toBe(true);
    expect(hasOogEquipment({ serviceType: "Sea LCL", containers })).toBe(false);
    expect(oogTypes(containers)).toEqual(["40' FR", "20' OT"]);
  });

  it("requires the in-gauge answer, and the measures of cargo that is not", () => {
    const fcl = { serviceType: "Sea FCL", containers: [{ qty: 1, type: "40' FR" }] };
    expect(oogMissing(fcl)).toBe("Say whether the cargo is in gauge");
    expect(oogMissing({ ...fcl, oog: { inGauge: true } })).toBe("Enter the cargo's overall length, width and height");
    expect(oogMissing({ ...fcl, oog: { inGauge: true, length: 1162, width: 244, height: 195 } })).toBeNull();
    expect(oogMissing({ ...fcl, oog: { inGauge: false, length: 1000 } })).toBe("Enter the cargo's overall length, width and height");
    expect(oogMissing({ ...fcl, oog: { inGauge: false, length: 1000, width: 300, height: 250 } })).toBeNull();
  });
});

describe("checkOog", () => {
  it("finds nothing out of gauge for cargo within the box", () => {
    expect(checkOog("40' FR", { length: 1100, width: 240, height: 190 })).toMatchObject({
      overWidthPerSide: 0, overHeight: 0, overLengthPerEnd: 0, doesNotFit: null, lost: { total: 0 },
    });
  });

  it("measures a flat rack's over-width per side, over-height and over-length per end, and the slots lost", () => {
    // past the liner limit, counted from the in-gauge figure: 300 wide on 244: 28 per side;
    // 250 high on 194: 56 over; 1262 long on 1150: 56 per end
    const check = checkOog("40' FR", { length: 1262, width: 300, height: 250 });
    expect(check).toMatchObject({ overWidthPerSide: 28, overHeight: 56, overLengthPerEnd: 56, doesNotFit: null, liner: [] });
    // in 20' slots: one 40' slot above (2), one each side (2 + 2), one bay each end (1 + 1), and
    // the two 40' slots diagonally above (4)
    expect(check?.lost).toEqual({ above: 2, left: 2, right: 2, front: 1, back: 1, corners: 4, total: 12 });
  });

  it("loses only the slot above an open top whose cargo stands out of its roof", () => {
    // the slot above a 40' box is a 40' slot: two 20' slots
    expect(checkOog("40' OT", { length: 1100, width: 210, height: 300 })).toMatchObject({ loading: "top", overHeight: 66, doesNotFit: null, lost: { above: 2, total: 2 } });
  });

  it("says an open top cannot take cargo wider or longer than its walls", () => {
    expect(checkOog("40' HOT", { length: 1250, width: 240, height: 200 })?.doesNotFit).toBe(
      "Too long and wide for the roof opening (max 1,150 cm long, 216 cm wide) and too long and wide for the doors (max 1,200 cm long, 232 cm wide) - it needs a flat rack",
    );
  });

  it("knows no measures of other boxes", () => {
    expect(checkOog("40' HC", { length: 1, width: 1, height: 1 })).toBeNull();
  });
});

describe("inGaugeMaximum", () => {
  it("is the box's own measures for one type", () => {
    expect(inGaugeMaximum(["40' FR"])).toEqual({ length: 1150, width: 244, height: 194, limitedBy: "40' FR" });
  });

  it("is the smallest of each measure over several types, so the cargo fits them all", () => {
    expect(inGaugeMaximum(["40' OT", "20' FR"])).toEqual({ length: 550, width: 220, height: 218, limitedBy: "20' FR" });
  });

  it("knows nothing of boxes without measures", () => {
    expect(inGaugeMaximum(["40' HC"])).toBeNull();
  });
});

describe("oogSummary", () => {
  it("says the equipment, the answer, the measures and the lost slots in one line", () => {
    const containers = [{ qty: 1, type: "40' FR" }];
    expect(oogSummary({ containers, oog: { inGauge: false, length: 1262, width: 300, height: 250 } })).toBe(
      "40' FR · Out of gauge · 1,262 × 300 × 250 cm (L × W × H) · 40' FR: 12 lost slots per container",
    );
    expect(oogSummary({ containers, oog: { inGauge: true, length: 1150, width: 244, height: 194 } })).toBe("40' FR · In gauge · 1,150 × 244 × 194 cm (L × W × H)");
  });
});

describe("20' open top", () => {
  it("takes 530 × 220 × 234 cm in gauge from the top", () => {
    expect(inGaugeMaximum(["20' OT"])).toEqual({ length: 530, width: 220, height: 234, limitedBy: "20' OT" });
    expect(checkOog("20' OT", { length: 530, width: 220, height: 234 })).toMatchObject({ loading: "top", doesNotFit: null, lost: { total: 0 } });
  });

  it("takes longer cargo up to 589 cm through the doors, within 232 cm wide and 225 cm high", () => {
    expect(checkOog("20' OT", { length: 589, width: 232, height: 225 })).toMatchObject({ loading: "doors", doesNotFit: null, lost: { total: 0 } });
  });

  it("sends cargo too long and wide for the roof and too high for the doors to a flat rack", () => {
    expect(checkOog("20' OT", { length: 531, width: 221, height: 226 })?.doesNotFit).toBe(
      "Too long and wide for the roof opening (max 530 cm long, 220 cm wide) and too high for the doors (max 225 cm) - it needs a flat rack",
    );
  });

  it("advises the 223 cm roof opening and the door limits", () => {
    expect(gaugeAdvice("20' OT")).toBe("Roof opening is 223 cm wide. Up to 589 cm long when loaded through the doors: max 232 cm wide and 225 cm high");
    expect(gaugeAdvice("40' FR")).toBeNull();
  });
});

describe("20' high-cube open top", () => {
  it("takes 535 × 220 × 264 cm in gauge from the top", () => {
    expect(inGaugeMaximum(["20' HOT"])).toEqual({ length: 535, width: 220, height: 264, limitedBy: "20' HOT" });
    expect(checkOog("20' HOT", { length: 535, width: 220, height: 264 })).toMatchObject({ loading: "top", doesNotFit: null, lost: { total: 0 } });
  });

  it("takes longer cargo up to 589 cm through the doors, within 232 cm wide and 255 cm high", () => {
    expect(checkOog("20' HOT", { length: 589, width: 232, height: 255 })).toMatchObject({ loading: "doors", doesNotFit: null, overHeight: 0, lost: { total: 0 } });
    expect(oogSummary({ containers: [{ qty: 1, type: "20' HOT" }], oog: { inGauge: true, length: 589, width: 230, height: 250 } })).toBe(
      "20' HOT · In gauge · 589 × 230 × 250 cm (L × W × H) · 20' HOT: load through the doors",
    );
    expect(gaugeAdvice("20' HOT")).toBe("Up to 589 cm long when loaded through the doors: max 232 cm wide and 255 cm high");
  });

  it("lets cargo short enough for the roof stand out of it, costing the slot above", () => {
    expect(checkOog("20' HOT", { length: 500, width: 210, height: 300 })).toMatchObject({ loading: "top", overHeight: 36, lost: { above: 1, total: 1 } });
  });

  it("sends cargo too long for the roof and too high for the doors to a flat rack, naming only what is over", () => {
    expect(checkOog("20' HOT", { length: 560, width: 220, height: 260 })?.doesNotFit).toBe(
      "Too long for the roof opening (max 535 cm) and too high for the doors (max 255 cm) - it needs a flat rack",
    );
  });
});

describe("the flat-rack message", () => {
  it("names every measure that is over, roof and doors alike", () => {
    expect(checkOog("20' HOT", { length: 600, width: 240, height: 260 })?.doesNotFit).toBe(
      "Too long and wide for the roof opening (max 535 cm long, 220 cm wide) and too long, wide and high for the doors (max 589 cm long, 232 cm wide, 255 cm high) - it needs a flat rack",
    );
  });
});

describe("40' open top", () => {
  it("takes 1150 × 220 × 234 cm in gauge from the top", () => {
    expect(inGaugeMaximum(["40' OT"])).toEqual({ length: 1150, width: 220, height: 234, limitedBy: "40' OT" });
    expect(checkOog("40' OT", { length: 1150, width: 220, height: 234 })).toMatchObject({ loading: "top", doesNotFit: null, lost: { total: 0 } });
  });

  it("takes longer cargo up to 1200 cm through the doors, within 232 cm wide and 225 cm high", () => {
    expect(checkOog("40' OT", { length: 1200, width: 232, height: 225 })).toMatchObject({ loading: "doors", doesNotFit: null, lost: { total: 0 } });
    expect(gaugeAdvice("40' OT")).toBe("Up to 1,200 cm long when loaded through the doors: max 232 cm wide and 225 cm high");
  });

  it("sends cargo too long and wide for the roof and too high for the doors to a flat rack", () => {
    expect(checkOog("40' OT", { length: 1151, width: 221, height: 226 })?.doesNotFit).toBe(
      "Too long and wide for the roof opening (max 1,150 cm long, 220 cm wide) and too high for the doors (max 225 cm) - it needs a flat rack",
    );
  });
});

describe("40' high-cube open top", () => {
  it("takes 1150 × 216 × 264 cm in gauge from the top", () => {
    expect(inGaugeMaximum(["40' HOT"])).toEqual({ length: 1150, width: 216, height: 264, limitedBy: "40' HOT" });
    expect(checkOog("40' HOT", { length: 1150, width: 216, height: 264 })).toMatchObject({ loading: "top", doesNotFit: null, lost: { total: 0 } });
  });

  it("takes longer cargo up to 1200 cm through the doors, within 232 cm wide and 255 cm high", () => {
    expect(checkOog("40' HOT", { length: 1200, width: 232, height: 255 })).toMatchObject({ loading: "doors", doesNotFit: null, lost: { total: 0 } });
    expect(gaugeAdvice("40' HOT")).toBe("Up to 1,200 cm long when loaded through the doors: max 232 cm wide and 255 cm high");
  });

  it("sends cargo too long and wide for the roof and too high for the doors to a flat rack", () => {
    expect(checkOog("40' HOT", { length: 1151, width: 217, height: 256 })?.doesNotFit).toBe(
      "Too long and wide for the roof opening (max 1,150 cm long, 216 cm wide) and too high for the doors (max 255 cm) - it needs a flat rack",
    );
  });
});

describe("flat racks", () => {
  // In gauge, up to the liner limit (with the liner's confirmation), and out of gauge past it.
  const cases = [
    { type: "20' FR", inGauge: [550, 244, 218], liner: [563, 244, 223] },
    { type: "40' FR", inGauge: [1150, 244, 194], liner: [1163, 244, 198] },
    { type: "40' HFR", inGauge: [1150, 244, 224], liner: [1163, 244, 226] },
  ] as const;
  const box = ([length, width, height]: readonly number[]) => ({ length: length!, width: width!, height: height! });

  for (const c of cases) {
    it(`${c.type}: in gauge up to ${c.inGauge.join(" × ")} cm`, () => {
      expect(inGaugeMaximum([c.type])).toEqual({ ...box(c.inGauge), limitedBy: c.type });
      expect(checkOog(c.type, box(c.inGauge))).toMatchObject({ liner: [], lost: { total: 0 }, overHeight: 0, overLengthPerEnd: 0 });
    });

    it(`${c.type}: up to ${c.liner.join(" × ")} cm only with the liner's confirmation`, () => {
      const check = checkOog(c.type, box(c.liner));
      expect(check).toMatchObject({ overWidthPerSide: 0, overHeight: 0, overLengthPerEnd: 0, lost: { total: 0 } });
      expect(check?.liner.map((l) => l.measure)).toEqual(["length", "height"]);
    });

    it(`${c.type}: out of gauge past ${c.liner.join(" × ")} cm, counted from the in-gauge measures`, () => {
      const [l, w, h] = c.liner;
      const check = checkOog(c.type, { length: l + 1, width: w + 2, height: h + 1 });
      expect(check).toMatchObject({
        overWidthPerSide: 1,
        overHeight: h + 1 - c.inGauge[2],
        overLengthPerEnd: Math.round((l + 1 - c.inGauge[0]) / 2),
        liner: [],
      });
      expect(check?.lost.total).toBeGreaterThan(0);
    });
  }

  it("asks the liner only for the measures in its band, and counts the rest out of gauge", () => {
    const check = checkOog("40' FR", { length: 1160, width: 244, height: 210 });
    expect(check?.liner).toEqual([{ measure: "length", value: 1160, inGauge: 1150, limit: 1163 }]);
    expect(check).toMatchObject({ overHeight: 16, overLengthPerEnd: 0, lost: { above: 2, total: 2 } });
  });

  it("says the liner's confirmation in the summary", () => {
    expect(oogSummary({ containers: [{ qty: 1, type: "20' FR" }], oog: { inGauge: true, length: 560, width: 244, height: 220 } })).toBe(
      "20' FR · In gauge · 560 × 244 × 220 cm (L × W × H) · 20' FR: needs the liner's confirmation",
    );
  });

  it("knows 40' HFR as out-of-gauge equipment with measures", () => {
    expect(isOogType("40' HFR")).toBe(true);
    expect(hasGauge("40' HFR")).toBe(true);
    expect(hasGauge("40' HC")).toBe(false);
  });
});

describe("lost slots by box size", () => {
  it("are double on a 40' flat rack what a 20' loses for over-width and over-height", () => {
    // 1 cm over-width per side and over-height on both
    const twenty = checkOog("20' FR", { length: 550, width: 246, height: 230 })!.lost;
    const forty = checkOog("40' FR", { length: 1150, width: 246, height: 210 })!.lost;
    const hfr = checkOog("40' HFR", { length: 1150, width: 246, height: 240 })!.lost;
    expect(twenty).toEqual({ above: 1, left: 1, right: 1, front: 0, back: 0, corners: 2, total: 5 });
    expect(forty).toEqual({ above: 2, left: 2, right: 2, front: 0, back: 0, corners: 4, total: 10 });
    expect(hfr).toEqual(forty);
  });

  it("are the same for over-length, one slot per bay at each end", () => {
    expect(checkOog("20' FR", { length: 600, width: 244, height: 200 })!.lost).toMatchObject({ front: 1, back: 1, total: 2 });
    expect(checkOog("40' FR", { length: 1200, width: 244, height: 190 })!.lost).toMatchObject({ front: 1, back: 1, total: 2 });
  });
});

describe("open-top over-height by box size", () => {
  it("costs a 40' OT double the slots a 20' OT loses above", () => {
    // 266 cm high: 32 cm out of the roof of either
    const twenty = checkOog("20' OT", { length: 500, width: 210, height: 266 })!;
    const forty = checkOog("40' OT", { length: 1100, width: 210, height: 266 })!;
    expect(twenty).toMatchObject({ loading: "top", overHeight: 32, lost: { above: 1, total: 1 } });
    expect(forty).toMatchObject({ loading: "top", overHeight: 32, lost: { above: 2, total: 2 } });
  });

  it("costs a 40' HOT double the slots a 20' HOT loses above", () => {
    expect(checkOog("20' HOT", { length: 500, width: 210, height: 300 })!.lost).toMatchObject({ above: 1, total: 1 });
    expect(checkOog("40' HOT", { length: 1100, width: 210, height: 300 })!.lost).toMatchObject({ above: 2, total: 2 });
  });
});
