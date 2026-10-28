import { describe, expect, it } from "vitest";
import { roundCents } from "../lib/money";

describe("roundCents", () => {
  it("rounds to cents, half up, also where floating point holds a half cent just below it", () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(746.15 * 3)).toBe(2238.45);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(1046.124)).toBe(1046.12);
    expect(roundCents(1046)).toBe(1046);
  });
});
