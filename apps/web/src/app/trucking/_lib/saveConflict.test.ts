import { describe, expect, it } from "vitest";
import { followRecord } from "./saveConflict";

const v = (vatUnreliable: boolean, notes: string, version: number) => ({ draft: { vatUnreliable, notes }, version });

describe("a draft as newer records arrive", () => {
  it("is replaced by the newer record while nothing is typed", () => {
    expect(followRecord(v(false, "", 3), v(false, "", 3), v(true, "", 4))).toEqual(v(true, "", 4));
  });

  it("keeps the version it was started from when the fields it saves changed meanwhile, so its save is refused", () => {
    // Someone switched "Unreliable VAT payer" on (v4) while notes were typed here on v3.
    expect(followRecord(v(false, "call first", 3), v(false, "", 3), v(true, "", 4))).toEqual(v(false, "call first", 3));
    // A later change of nothing it saves does not move it past the one it missed.
    expect(followRecord(v(false, "call first", 3), v(true, "", 4), v(true, "", 5))).toEqual(v(false, "call first", 3));
  });

  it("moves onto the new version, as typed, when the newer record changed none of the fields it saves", () => {
    expect(followRecord(v(false, "call first", 3), v(false, "", 3), v(false, "", 4))).toEqual(v(false, "call first", 4));
  });
});
