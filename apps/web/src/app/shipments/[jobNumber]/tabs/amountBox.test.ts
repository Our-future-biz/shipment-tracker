import { describe, expect, it, vi } from "vitest";
import { onAmountBlur } from "./amountBox";

// A blur of an amount box, as the cost tables get it: the box is its target.
const blur = (value: string) => ({ target: { value } });

describe("onAmountBlur", () => {
  it("saves another amount and writes it the way figures are", () => {
    const save = vi.fn();
    const e = blur("1250,5");
    onAmountBlur("100.00", save)(e);
    expect(save).toHaveBeenCalledWith("1250,5", expect.any(Function));
    expect(e.target.value).toBe("1,250.50");
  });

  it("saves nothing when the amount is the stored one", () => {
    const save = vi.fn();
    onAmountBlur("1250.50", save)(blur("1 250,50"));
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the stored amount again when the save is refused", () => {
    const e = blur("2 x 40HC");
    onAmountBlur("100.00", (_typed, refused) => refused())(e);
    expect(e.target.value).toBe("100.00");
  });

  it("empties the box again when an amount typed into an empty one is refused", () => {
    const e = blur("999");
    onAmountBlur(null, (_typed, refused) => refused())(e);
    expect(e.target.value).toBe("");
  });
});
