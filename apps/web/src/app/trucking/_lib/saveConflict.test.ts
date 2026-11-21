import { describe, expect, it } from "vitest";
import { APIError, ErrCode } from "@/lib/api/client";
import { followRecord, isVersionConflict } from "./saveConflict";

// Mock test S18-159: every 409 was read as "changed by someone else", so "one consignment per
// quote" (already_exists, also 409) was hidden behind a reload request.
describe("a version conflict", () => {
  it("is an aborted save, or a failed precondition that says so in words", () => {
    expect(isVersionConflict(new APIError(409, { code: ErrCode.Aborted, message: "The consignment was changed by someone else" }))).toBe(true);
    expect(isVersionConflict(new APIError(400, { code: ErrCode.FailedPrecondition, message: "The trip was changed by someone else. Reload and try again." }))).toBe(true);
  });

  it("is not another refusal with a 409, nor any other error", () => {
    const taken = new APIError(409, { code: ErrCode.AlreadyExists, message: "Quote QCZ20261010001 is already on consignment TCZ2026000001: one consignment per quote" });
    expect(isVersionConflict(taken)).toBe(false);
    expect(isVersionConflict(new APIError(400, { code: ErrCode.FailedPrecondition, message: "After the pick-up the price cannot change" }))).toBe(false);
    expect(isVersionConflict(new Error("Network down"))).toBe(false);
  });
});

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
