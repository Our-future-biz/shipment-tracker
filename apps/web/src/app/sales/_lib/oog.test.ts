import { describe, expect, it } from "vitest";
import { checkOog, gaugeAdvice, hasOogEquipment, inGaugeMaximum, isOogType, oogMissing, oogSummary, oogTypes } from "./oog";

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
    // 300 wide on a 244 box: 28 per side; 250 high on 195 posts: 55 over; 1262 long on 1162: 50 per end
    const check = checkOog("40' FR", { length: 1262, width: 300, height: 250 });
    expect(check).toMatchObject({ overWidthPerSide: 28, overHeight: 55, overLengthPerEnd: 50, doesNotFit: null });
    // one tier above, one row each side, one bay each end, and the two slots diagonally above
    expect(check?.lost).toEqual({ above: 1, left: 1, right: 1, front: 1, back: 1, corners: 2, total: 7 });
  });

  it("loses only the slot above an open top whose cargo stands out of its roof", () => {
    expect(checkOog("40' OT", { length: 1100, width: 210, height: 300 })).toMatchObject({ loading: "top", overHeight: 66, doesNotFit: null, lost: { above: 1, total: 1 } });
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
    expect(inGaugeMaximum(["40' FR"])).toEqual({ length: 1162, width: 244, height: 195, limitedBy: "40' FR" });
  });

  it("is the smallest of each measure over several types, so the cargo fits them all", () => {
    expect(inGaugeMaximum(["40' OT", "20' FR"])).toEqual({ length: 562, width: 220, height: 223, limitedBy: "20' FR" });
  });

  it("knows nothing of boxes without measures", () => {
    expect(inGaugeMaximum(["40' HC"])).toBeNull();
  });
});

describe("oogSummary", () => {
  it("says the equipment, the answer, the measures and the lost slots in one line", () => {
    const containers = [{ qty: 1, type: "40' FR" }];
    expect(oogSummary({ containers, oog: { inGauge: false, length: 1262, width: 300, height: 250 } })).toBe(
      "40' FR · Out of gauge · 1,262 × 300 × 250 cm (L × W × H) · 40' FR: 7 lost slots per container",
    );
    expect(oogSummary({ containers, oog: { inGauge: true, length: 1162, width: 244, height: 195 } })).toBe("40' FR · In gauge · 1,162 × 244 × 195 cm (L × W × H)");
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
