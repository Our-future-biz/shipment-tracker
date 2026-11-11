import { describe, expect, it } from "vitest";
import { formOpensNow } from "./formReset";

describe("formOpensNow", () => {
  it("fills the form as it opens", () => {
    expect(formOpensNow(false, true)).toBe(true);
  });

  it("keeps what was typed while the form stays open (a refused save, a poll)", () => {
    expect(formOpensNow(true, true)).toBe(false);
  });

  it("does nothing while closed or as it closes", () => {
    expect(formOpensNow(false, false)).toBe(false);
    expect(formOpensNow(true, false)).toBe(false);
  });
});
