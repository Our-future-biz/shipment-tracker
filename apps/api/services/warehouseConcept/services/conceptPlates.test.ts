import { describe, expect, it } from "vitest";
import { conceptPlate, pickupRowPlates, type ReleasedRecord } from "./conceptPlates";

// The plate of a job whose live pick-up is the Concept's (mock council C2). Pure: runs in the plain
// test run; the service reads its records under `encore test`.

const pickup = (...plates: string[]) => ({ pinHash: "x", rows: plates.map((licensePlate) => ({ haulier: "H", licensePlate, driver: "D" })) });
const out = (over: Partial<ReleasedRecord> = {}): ReleasedRecord => ({ visit: "výdej", handling: "Import", impRelease: null, plate: "", ...over });

describe("Concept plates of a job", () => {
  it("lists the Concept pick-up's plates once each, without blanks", () => {
    expect(pickupRowPlates(pickup(" 1AB 2345 ", "", "3CD 4567", "1AB 2345"))).toBe("1AB 2345, 3CD 4567");
    expect(pickupRowPlates(undefined)).toBe("");
    expect(pickupRowPlates({ rows: "not json" })).toBe("");
  });

  it("takes the plate the cargo left with at the latest WH release, else the pick-up's", () => {
    expect(conceptPlate(pickup("1AB 2345"), [])).toBe("1AB 2345");
    // Not released yet: the pick-up's plate, not the gate's planned one.
    expect(conceptPlate(pickup("1AB 2345"), [out({ plate: "7XY 0000" })])).toBe("1AB 2345");
    const released = [
      out({ impRelease: new Date("2026-11-19T08:00:00Z"), plate: "5OLD 111" }),
      out({ impRelease: new Date("2026-11-20T08:00:00Z"), plate: " 9GATE 99 " }),
    ];
    expect(conceptPlate(pickup("1AB 2345"), released)).toBe("9GATE 99");
    // A release with no plate does not hide the pick-up's; inbound cargo's plate is not the pick-up's.
    expect(conceptPlate(pickup("1AB 2345"), [out({ impRelease: new Date(), plate: "" }), out({ visit: "příjem", impRelease: new Date(), plate: "2IN 222" })])).toBe("1AB 2345");
    expect(conceptPlate(undefined, [])).toBe("");
  });
});
