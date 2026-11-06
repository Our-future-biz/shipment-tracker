import { describe, expect, it } from "vitest";
import { containerNumberInput, containerCheckDigitOk } from "./container";

describe("containerNumberInput", () => {
  it("keeps 4 letters, then 7 digits", () => {
    expect(containerNumberInput("MRKUDSU")).toBe("MRKU");
    expect(containerNumberInput("12ab")).toBe("AB");
    expect(containerNumberInput("MSKU12x34")).toBe("MSKU1234");
    expect(containerNumberInput("MSKU123456789")).toBe("MSKU1234567");
  });
  it("cleans a pasted number", () => {
    expect(containerNumberInput("msmu 272727-7")).toBe("MSMU2727277");
  });
});

describe("containerCheckDigitOk", () => {
  it("accepts numbers whose last digit fits", () => {
    expect(containerCheckDigitOk("CSQU3054383")).toBe(true);
    expect(containerCheckDigitOk("csqu 305438-3")).toBe(true);
  });

  it("catches a mistyped digit", () => {
    expect(containerCheckDigitOk("CSQU3054384")).toBe(false);
    expect(containerCheckDigitOk("CSQU3054833")).toBe(false);
  });

  it("leaves what isn't a whole number to the shape check", () => {
    expect(containerCheckDigitOk("")).toBe(true);
    expect(containerCheckDigitOk(null)).toBe(true);
    expect(containerCheckDigitOk("CSQU305")).toBe(true);
  });
});
