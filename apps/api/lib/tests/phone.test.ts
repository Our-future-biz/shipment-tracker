import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("./encoreApi.stub"));

import { CZECH_PHONE_MESSAGE, assertCzechPhone, czechPhoneProblem } from "../phone";

describe("Czech phone numbers (+420)", () => {
  it("need exactly 9 digits after the code, however they are spaced", () => {
    expect(czechPhoneProblem("+420 774 237 000")).toBe("");
    expect(czechPhoneProblem("00420774237000")).toBe("");
    expect(czechPhoneProblem("+420 774 237 000 00")).toBe(CZECH_PHONE_MESSAGE);
    expect(czechPhoneProblem("+420 774 237")).toBe(CZECH_PHONE_MESSAGE);
  });

  it("leave other numbers alone", () => {
    for (const other of ["", "774 237 000 00", "+421 905 123 456", "+44 20 7946 0958"]) expect(czechPhoneProblem(other)).toBe("");
  });

  it("are refused by the API with the field named", () => {
    expect(() => assertCzechPhone("+420 1", "Driver phone")).toThrow(`Driver phone: ${CZECH_PHONE_MESSAGE}`);
    expect(() => assertCzechPhone("+420 774 237 000")).not.toThrow();
  });
});
