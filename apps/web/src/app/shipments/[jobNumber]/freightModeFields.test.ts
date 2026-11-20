import { describe, expect, it } from "vitest";
import { carrierCardTitle, fieldsForMode, showsContainerTab } from "./freightModeFields";

const CARRIER = [
  { key: "bookingNumber", label: "Booking Number" },
  { key: "vessel", label: "Vessel" },
  { key: "voyage", label: "Voyage" },
  { key: "containerNumber", label: "Container Number", ro: true },
  { key: "houseBolNumber", label: "House BoL Number" },
  { key: "masterBolNumber", label: "Master BoL Number" },
];
const none = () => "";

describe("a job page's rows by freight mode (user council O17)", () => {
  it("keep their sea names and every row on a sea, rail or road job, or one with no mode", () => {
    for (const mode of ["Sea Freight", "Rail Freight", "Road", "", null, undefined]) {
      expect(fieldsForMode(CARRIER, mode, none)).toEqual(CARRIER);
    }
  });

  it("take the air names on an air job and leave out the empty sea-only rows, in the card's order", () => {
    expect(fieldsForMode(CARRIER, "Air Freight", none)).toEqual([
      { key: "bookingNumber", label: "Booking Number" },
      { key: "vessel", label: "Flight" },
      { key: "houseBolNumber", label: "HAWB Number" },
      { key: "masterBolNumber", label: "MAWB Number" },
    ]);
    const routing = [
      { key: "pol", label: "Port of Loading" },
      { key: "pod", label: "Port of Discharge" },
      { key: "origin", label: "Origin" },
    ];
    expect(fieldsForMode(routing, " air ", none).map((f) => f.label)).toEqual(["Airport of Departure", "Airport of Destination", "Origin"]);
  });

  it("never hide a sea-only row that holds a value on an air job: it shows under its sea name", () => {
    const valueOf = (k: string) => ({ voyage: "123W", containerNumber: "  ", totalTeu: "2" })[k] ?? "";
    const shown = fieldsForMode([...CARRIER, { key: "totalTeu", label: "Total TEU", ro: true }], "Air Freight", valueOf);
    expect(shown.find((f) => f.key === "voyage")).toEqual({ key: "voyage", label: "Voyage" });
    expect(shown.find((f) => f.key === "totalTeu")).toEqual({ key: "totalTeu", label: "Total TEU", ro: true });
    // Blank is no value.
    expect(shown.some((f) => f.key === "containerNumber")).toBe(false);
  });

  it("keep a row's other settings (read-only, highlight) under its air name", () => {
    const rows = [{ key: "masterBolType", label: "Master BoL Type", ro: true, highlight: true }];
    expect(fieldsForMode(rows, "Air Freight", none)).toEqual([{ key: "masterBolType", label: "MAWB Type", ro: true, highlight: true }]);
    // The card's own list is left as it was.
    expect(rows[0]?.label).toBe("Master BoL Type");
  });

  it("leave out the VGM on air while it holds only its untouched starting value (step 3 review M1)", () => {
    const rows = [{ key: "vgm", label: "VGM" }];
    expect(fieldsForMode(rows, "Air Freight", () => "Pending (Red)")).toEqual([]);
    expect(fieldsForMode(rows, "Air Freight", () => " Pending (Red) ")).toEqual([]);
    // A VGM someone set stays, and a sea job shows the starting value as ever.
    expect(fieldsForMode(rows, "Air Freight", () => "Confirmed (Green)")).toEqual(rows);
    expect(fieldsForMode(rows, "Sea Freight", () => "Pending (Red)")).toEqual(rows);
    // Only the VGM's own starting value counts as empty: on another sea-only row it is a value.
    expect(fieldsForMode([{ key: "voyage", label: "Voyage" }], "Air Freight", () => "Pending (Red)")).toHaveLength(1);
  });

  it("hide the VGM and SI closings and the VGM check on air, but keep Shipping Instructions", () => {
    const rows = ["vgmClosing", "siClosing", "vgm", "shippingInstructions", "closingDate"].map((key) => ({ key, label: key }));
    expect(fieldsForMode(rows, "Air Freight", none).map((f) => f.key)).toEqual(["shippingInstructions", "closingDate"]);
  });
});

describe("the Carrier card's title and the Container Details tab", () => {
  it("name the air waybill on an air job only", () => {
    expect(carrierCardTitle("Air Freight")).toBe("Carrier & Air Waybill");
    expect(carrierCardTitle("Sea Freight")).toBe("Carrier & Bill of Lading");
    expect(carrierCardTitle(null)).toBe("Carrier & Bill of Lading");
  });

  it("show Container Details on every job but an air job without a container", () => {
    expect(showsContainerTab("Sea Freight", 0)).toBe(true);
    expect(showsContainerTab(undefined, 0)).toBe(true);
    expect(showsContainerTab("Air Freight", 0)).toBe(false);
    expect(showsContainerTab("Air Freight", 0, " ")).toBe(false);
    // One entered before the mode changed can still be reached.
    expect(showsContainerTab("Air Freight", 1)).toBe(true);
    expect(showsContainerTab("Air Freight", 0, "MSKU1234565")).toBe(true);
  });
});
