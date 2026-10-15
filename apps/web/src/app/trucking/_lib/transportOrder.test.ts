import { describe, expect, it } from "vitest";
import { PIN_EXPLANATION, invalidRecipients, parseRecipients, pinProblem, pinValue } from "./transportOrder";

describe("pick-up PIN field", () => {
  it("prints no PIN when the field is empty", () => {
    expect(pinProblem("")).toBeNull();
    expect(pinValue("  ")).toBeNull();
  });

  it("takes 4 to 6 digits, spaces ignored", () => {
    expect(pinProblem("123 456")).toBeNull();
    expect(pinValue("123 456")).toBe("123456");
    expect(pinProblem("123")).toBe("The PIN has 4 to 6 digits");
    expect(pinProblem("1234567")).toBe("The PIN has 4 to 6 digits");
    expect(pinProblem("12a4")).toBe("The PIN has digits only");
  });

  it("explains why the PIN is typed", () => {
    expect(PIN_EXPLANATION).toBe("Shown once in Shipments — type it to print it; it is not stored.");
  });
});

describe("recipients", () => {
  it("splits on commas, semicolons and lines, without repeats", () => {
    expect(parseRecipients("a@x.cz, b@y.cz;\nA@x.cz  ")).toEqual(["a@x.cz", "b@y.cz"]);
  });
  it("finds what is not an e-mail address", () => {
    expect(invalidRecipients(["a@x.cz", "dispecink", "b@y"])).toEqual(["dispecink", "b@y"]);
  });
});
