import { describe, expect, it } from "vitest";
import { airWaybillOk } from "./airWaybill";

describe("airWaybillOk", () => {
  it("accepts a whole number, however it is written", () => {
    expect(airWaybillOk("02012345675")).toBe(true);
    expect(airWaybillOk("020-1234 5675")).toBe(true);
  });

  it("catches a wrong last digit or a wrong length", () => {
    expect(airWaybillOk("02012345676")).toBe(false);
    expect(airWaybillOk("0201234567")).toBe(false);
    expect(airWaybillOk("ABC12345675")).toBe(false);
  });

  it("leaves an empty one alone", () => {
    expect(airWaybillOk("")).toBe(true);
    expect(airWaybillOk(null)).toBe(true);
  });
});
