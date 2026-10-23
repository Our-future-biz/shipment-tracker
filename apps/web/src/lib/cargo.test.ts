import { describe, expect, it } from "vitest";
import { CONTAINER_TYPES, NOT_STACKABLE, STACKABLE, shipmentStackability, withShipmentStackability } from "./cargo";
import { containerTypeFrom } from "@/app/documents/_lib/extraction";

describe("CONTAINER_TYPES", () => {
  it("offers the agreed equipment: no 20' HC, 20' HR or 40' RF; the 40' high-cube reefer is HRF", () => {
    expect(CONTAINER_TYPES).toEqual([
      "20' GP", "20' RF", "20' OT", "20' HOT", "20' FR",
      "40' GP", "40' HC", "40' HRF", "40' OT", "40' HOT", "40' FR", "40' HFR",
      "45' HQ",
    ]);
  });
});

describe("containerTypeFrom", () => {
  it("reads a 40' reefer as the high-cube reefer and a 20' one as RF", () => {
    expect(containerTypeFrom("40", "REEFER")).toBe("40' HRF");
    expect(containerTypeFrom("40", "RH")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "HR")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "REEFER")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "DRY")).toBe("40' HC");
    expect(containerTypeFrom("20", "RF")).toBe("20' RF");
  });

  it("leaves out equipment that isn't offered", () => {
    expect(containerTypeFrom("20HC", "DRY")).toBe("");
  });
});

describe("shipmentStackability", () => {
  const row = (stackable: string) => ({ stackable });
  it("is not stackable when any row is not stackable", () => {
    expect(shipmentStackability([row(STACKABLE), row(NOT_STACKABLE)])).toBe(NOT_STACKABLE);
  });
  it("is stackable when a row is stackable and none is not", () => {
    expect(shipmentStackability([row(""), row(STACKABLE)])).toBe(STACKABLE);
  });
  it("is empty when no row says", () => {
    expect(shipmentStackability([row("")])).toBe("");
    expect(shipmentStackability([])).toBe("");
  });
});

describe("withShipmentStackability", () => {
  const line = (stackable: string, containerId: string | null = "c1") => ({
    containerId, pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "300", packageType: "Pallet(s)", stackable,
  });

  it("puts the picked value on every row and keeps the rest of each row", () => {
    const out = withShipmentStackability([line(STACKABLE), line("")], NOT_STACKABLE);
    expect(out.map((r) => r.stackable)).toEqual([NOT_STACKABLE, NOT_STACKABLE]);
    expect(out[0]).toMatchObject({ pieces: "2", lengthCm: "120", containerId: "c1" });
  });

  it("gives a shipment without rows one row holding only the stackability", () => {
    expect(withShipmentStackability([], STACKABLE, "c9")).toEqual([
      { containerId: "c9", pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: STACKABLE },
    ]);
  });

  it("adds no row when clearing a shipment without rows", () => {
    expect(withShipmentStackability([], "")).toEqual([]);
  });
});
