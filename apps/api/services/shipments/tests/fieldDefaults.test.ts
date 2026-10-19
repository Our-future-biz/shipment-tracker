import { describe, expect, it } from "vitest";
import {
  actionStamp,
  cfsDefault,
  creationStamp,
  exportBolDefaults,
  isCreditApproval,
  startingStateDefaults,
} from "../lib/fieldDefaults";

describe("exportBolDefaults", () => {
  it("seeds both BoL types for an export shipment", () => {
    expect(exportBolDefaults("Export", {})).toEqual({ houseBolType: "OBL", masterBolType: "OBL" });
    expect(exportBolDefaults("Export", { houseBolType: "", masterBolType: "" })).toEqual({
      houseBolType: "OBL",
      masterBolType: "OBL",
    });
  });

  it("never overwrites a type that was already chosen", () => {
    expect(exportBolDefaults("Export", { houseBolType: "SWB", masterBolType: "Telex" })).toEqual({});
    // Only the blank one is seeded.
    expect(exportBolDefaults("Export", { houseBolType: "SWB" })).toEqual({ masterBolType: "OBL" });
  });

  it("leaves non-export shipments alone", () => {
    expect(exportBolDefaults("Import", {})).toEqual({});
    expect(exportBolDefaults("", {})).toEqual({});
    expect(exportBolDefaults(null, {})).toEqual({});
  });
});

describe("startingStateDefaults", () => {
  const fresh = {
    creditCheck: "Red",
    vgm: "Pending (Red)",
    bookingConfirmation: "Pending",
    invoicingStatus: "Not Invoiced",
  };

  it("starts a shipment with nothing approved, confirmed, received or invoiced", () => {
    expect(startingStateDefaults({})).toEqual(fresh);
    expect(
      startingStateDefaults({ creditCheck: "", vgm: null, bookingConfirmation: "  ", invoicingStatus: "" }),
    ).toEqual(fresh);
  });

  it("keeps states that were already set", () => {
    expect(
      startingStateDefaults({
        creditCheck: "Green",
        vgm: "Customer",
        bookingConfirmation: "Received",
        invoicingStatus: "Invoiced",
      }),
    ).toEqual({});
    // Only the blank ones are seeded.
    expect(
      startingStateDefaults({ creditCheck: "Yellow", bookingConfirmation: "Received", invoicingStatus: "Invoiced" }),
    ).toEqual({ vgm: "Pending (Red)" });
  });
});

describe("isCreditApproval", () => {
  it("fires when the check moves to Green", () => {
    expect(isCreditApproval("Green", "Red")).toBe(true);
    expect(isCreditApproval("Green", "")).toBe(true);
  });

  it("does not re-fire while it stays Green", () => {
    expect(isCreditApproval("Green", "Green")).toBe(false);
  });

  it("ignores other transitions", () => {
    expect(isCreditApproval("Yellow", "Red")).toBe(false);
    expect(isCreditApproval("Red", "Green")).toBe(false);
    expect(isCreditApproval(undefined, "Red")).toBe(false);
  });
});

describe("actionStamp", () => {
  const at = new Date("2026-08-17T12:32:00Z");

  it("records who approved it and when", () => {
    const stamp = actionStamp("Jan Novák", at);
    expect(stamp.startsWith("Jan Novák — ")).toBe(true);
    expect(stamp).toContain("2026");
  });

  it("falls back to the timestamp when the approver is unknown", () => {
    expect(actionStamp("", at)).not.toContain("—");
  });
});

describe("creationStamp", () => {
  const at = new Date("2026-08-17T12:32:00Z");

  it("puts the time first and then who created it, like every Created By already stored", () => {
    const stamp = creationStamp("Jan Novák", at);
    expect(stamp.endsWith(" — Jan Novák")).toBe(true);
    expect(stamp).toContain("2026");
  });

  it("is the time alone when the creator cannot be named", () => {
    expect(creationStamp(" ", at)).not.toContain("—");
  });
});

describe("cfsDefault", () => {
  it("fills a blank CFS with the HUB", () => {
    expect(cfsDefault("Prague", "")).toEqual({ cfs: "Prague" });
    expect(cfsDefault("Prague", undefined)).toEqual({ cfs: "Prague" });
  });

  it("never overwrites a CFS that was already chosen", () => {
    expect(cfsDefault("Prague", "Brno")).toEqual({});
  });

  it("leaves the CFS alone while there is no HUB", () => {
    expect(cfsDefault("", "")).toEqual({});
    expect(cfsDefault(null, "Vienna")).toEqual({});
  });
});
