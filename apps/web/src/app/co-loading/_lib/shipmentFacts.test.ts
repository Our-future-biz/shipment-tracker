import { describe, expect, it } from "vitest";
import { copyResultWords, differsWords, factShown } from "./shipmentFacts";

describe("a sailing's facts beside a shipment's (Council Outlay 14, A3)", () => {
  it("shows a date the app's way, a text as it is, a dash for nothing", () => {
    expect(factShown("estimatedDeparture", "2026-11-20")).toBe("20.11.2026");
    expect(factShown("closingDate", "2026-12-01")).toBe("01.12.2026");
    expect(factShown("vessel", "MSC Anna")).toBe("MSC Anna");
    expect(factShown("estimatedDeparture", "")).toBe("—");
  });

  it("says how a shipment differs, with dates the app's way - never raw ISO", () => {
    const words = differsWords({
      changes: [
        { field: "estimatedDeparture", label: "ETD", old: "2026-11-20", next: "2026-12-01" },
        { field: "closingDate", label: "Closing Date", old: "", next: "2026-11-27" },
      ],
      mismatches: [{ label: "Port of Loading", shipment: "Ningbo (CNNGB)", sailing: "Shanghai (CNSHA)" }],
      skipped: null,
    });
    expect(words).toBe("Port of Loading: Ningbo (CNNGB), the sailing's is Shanghai (CNSHA) · ETD: 20.11.2026, the sailing's is 01.12.2026 · Closing Date: empty, the sailing's is 27.11.2026");
    expect(words).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("names only the ports of a shipment the copy leaves alone, and nothing for one that agrees", () => {
    const skipped = { changes: [{ field: "vessel", label: "Vessel", old: "X", next: "MSC Anna" }], mismatches: [{ label: "Port of Discharge", shipment: "Bremen", sailing: "Hamburg (DEHAM)" }], skipped: "Cancelled." };
    expect(differsWords(skipped)).toBe("Port of Discharge: Bremen, the sailing's is Hamburg (DEHAM)");
    expect(differsWords({ changes: [], mismatches: [], skipped: null })).toBe("");
  });

  it("says what a copy did, with each refusal and why", () => {
    expect(copyResultWords({ copied: 3, refused: [] })).toBe("Copied to 3 shipments.");
    expect(copyResultWords({ copied: 1, refused: [] })).toBe("Copied to 1 shipment.");
    expect(copyResultWords({ copied: 0, refused: [{ jobNumber: "CZLCL00000002", reason: "It is invoiced" }] })).toBe("Nothing was copied. 1 not changed: CZLCL00000002 (It is invoiced)");
    expect(copyResultWords({ copied: 2, refused: [{ jobNumber: "A", reason: "x" }, { jobNumber: "B", reason: "y" }] })).toBe("Copied to 2 shipments. 2 not changed: A (x); B (y)");
  });
});
