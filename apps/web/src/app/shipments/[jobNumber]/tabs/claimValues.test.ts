import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { claimChanges, claimFilled } from "./claimValues";

const claim = {
  id: "c1",
  shipmentId: "s1",
  kind: "cargo",
  cargoState: "Damaged",
  note: "Box crushed",
  supplier: "",
  invoiceNumber: "",
  reason: "",
  amount: "",
  noticeDate: null,
  createdAt: "2026-11-01T10:00:00.000Z",
} as interfaces.ClaimItem;

describe("a changed claim", () => {
  it("sends only the fields that changed", () => {
    expect(claimChanges(claim, { cargoState: "Damaged", note: "Box crushed, two pallets", noticeDate: "" })).toEqual({ note: "Box crushed, two pallets" });
  });

  it("sends nothing when nothing changed, an empty date included", () => {
    expect(claimChanges(claim, { cargoState: "Damaged", note: "Box crushed", noticeDate: "" })).toEqual({});
  });

  it("sends a date set or cleared", () => {
    expect(claimChanges(claim, { noticeDate: "2026-11-03" })).toEqual({ noticeDate: "2026-11-03" });
    expect(claimChanges({ ...claim, noticeDate: "2026-11-03" }, { noticeDate: "" })).toEqual({ noticeDate: "" });
  });
});

describe("a new claim", () => {
  it("sends every field", () => {
    const values = { cargoState: "", note: "Wet", noticeDate: "" };
    expect(claimChanges(undefined, values)).toBe(values);
  });

  it("needs something filled in", () => {
    expect(claimFilled({ cargoState: "", note: "  ", noticeDate: "" })).toBe(false);
    expect(claimFilled({ supplier: "", invoiceNumber: "FA-12", reason: "", amount: "" })).toBe(true);
  });
});
