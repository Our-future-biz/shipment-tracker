import { describe, expect, it } from "vitest";
import { CZECH_PHONE_MESSAGE, czechPhoneProblem, limitCzechDigits, limitCzechPhone } from "./phone";

describe("czechPhoneProblem", () => {
  it("accepts a +420 number with exactly 9 digits, however it is spaced", () => {
    for (const ok of ["+420 774 237 000", "+420774237000", "00420 774-237-000", "+420 (774) 237 000"]) {
      expect(czechPhoneProblem(ok)).toBe("");
    }
  });

  it("refuses a +420 number with more or fewer than 9 digits", () => {
    for (const bad of ["+420 774237000000", "+420 774 237 00", "00420 7742370001", "+420", "+420 774 237 00x"]) {
      expect(czechPhoneProblem(bad)).toBe(CZECH_PHONE_MESSAGE);
    }
  });

  it("leaves numbers without +420 alone", () => {
    for (const other of ["", undefined, null, "774 237 000 00", "+421 905 123 456", "+44 20 7946 0958", "call reception"]) {
      expect(czechPhoneProblem(other)).toBe("");
    }
  });
});

describe("limitCzechPhone", () => {
  it("lets no 10th digit into a +420 number", () => {
    expect(limitCzechPhone("+420 774 237 0001")).toBe("+420 774 237 000");
    expect(limitCzechPhone("00420774237000999")).toBe("00420774237000");
    expect(limitCzechPhone("+420 774 237 00")).toBe("+420 774 237 00");
  });

  it("leaves other numbers as typed", () => {
    expect(limitCzechPhone("+421 905 123 456 7")).toBe("+421 905 123 456 7");
    expect(limitCzechPhone("774 237 000 00")).toBe("774 237 000 00");
  });

  it("cuts a national part to 9 digits", () => {
    expect(limitCzechDigits("12345678900")).toBe("123456789");
    expect(limitCzechDigits("774 237 000 1")).toBe("774 237 000 ");
  });
});
