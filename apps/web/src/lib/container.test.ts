import { describe, expect, it } from "vitest";
import { containerNumberInput } from "./container";

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
