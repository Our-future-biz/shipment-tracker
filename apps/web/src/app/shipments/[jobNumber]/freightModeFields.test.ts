import { describe, expect, it } from "vitest";
import { SEA_STAGES, airChargeableWeight, carrierCardTitle, currentStageOf, equipmentCardTitle, fieldsForMode, houseReleaseWords, masterBolWord, modeLabel, progressStagesFor, showsChargeableWeight, showsContainerTab, workflowHeading } from "./freightModeFields";

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
  it("keep their sea names and every row on a sea or rail job, or one with no mode", () => {
    for (const mode of ["Sea Freight", "Rail Freight", "", null, undefined, { freightMode: "Sea Freight", tradeDirection: "Import", department: "" }]) {
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

describe("a road job's rows (user council T9)", () => {
  const SEA_ROWS = [
    "bookingNumber", "vessel", "voyage", "containerNumber", "containerTypeSummary", "totalTeu", "houseBolNumber", "houseBolType",
    "masterBolType", "houseBolRelease", "vgm", "vgmClosing", "siClosing", "shippingInstructions", "bolDraft", "ams", "isf",
    "amsDeadline", "isfDeadline", "insurance", "bookingConfirmation", "customsStatus", "pol",
  ].map((key) => ({ key, label: key }));
  // CZROAD00000061 as the server seeded it: the starting states, and no paperwork in.
  const seeded: Record<string, string> = {
    vgm: "Pending (Red)", shippingInstructions: "Not Queried", bolDraft: "Not Processed", ams: "Not Applicable", isf: "Not Applicable",
    insurance: "No", bookingConfirmation: "Pending", customsStatus: "Waiting For Commercial Paperwork",
  };
  const seededOf = (k: string) => seeded[k] ?? "";
  const domestic = { freightMode: "Road Freight", tradeDirection: "Domestic", department: "" };

  it("leave out a Trucking job's empty sea rows and its untouched starting states, and the customs status while no paperwork is in", () => {
    expect(fieldsForMode(SEA_ROWS, domestic, seededOf).map((f) => f.key)).toEqual(["bookingNumber", "houseBolNumber", "insurance", "bookingConfirmation", "pol"]);
  });

  it("tell a road job the way the server does: Domestic, the Road Department, or a Freight Mode saying road", () => {
    const keysOf = (mode: Parameters<typeof fieldsForMode>[1]) => fieldsForMode([{ key: "vgm", label: "VGM" }], mode, seededOf).length;
    expect(keysOf({ freightMode: "Sea Freight", tradeDirection: " domestic " })).toBe(0);
    expect(keysOf({ freightMode: "", tradeDirection: "Import", department: "Road Department" })).toBe(0);
    expect(keysOf({ freightMode: "Road Freight", tradeDirection: "Export" })).toBe(0);
    expect(keysOf("Road")).toBe(0);
    expect(keysOf({ freightMode: "Sea Freight", tradeDirection: "Import", department: "Ocean Freight" })).toBe(1);
  });

  it("never hide a row that holds a value of its own on a road job", () => {
    const valueOf = (k: string) => ({ ...seeded, vgm: "Confirmed (Green)", vessel: "MSC ANNA", houseBolType: "Seaway", houseBolRelease: "jan — 20. 11. 2026", customsStatus: "Paperwork Verification Pending" })[k] ?? "";
    const keys = fieldsForMode(SEA_ROWS, domestic, valueOf).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["vgm", "vessel", "houseBolType", "houseBolRelease", "customsStatus"]));
    expect(keys).not.toContain("shippingInstructions");
  });

  it("leave out an OBL as untouched on a road export only, as the server seeded it there before (exportBolDefaults), and keep the BoL types while the job waits for an original B/L", () => {
    const rows = [{ key: "houseBolType", label: "House BoL Type" }, { key: "masterBolType", label: "Master BoL Type" }];
    const roadImport = { freightMode: "Road Freight", tradeDirection: "Import" };
    // A road import at OBL reads red and says its House or Master BoL Type is OBL (waitsForOriginalBl): both rows show.
    expect(fieldsForMode(rows, roadImport, (k) => ({ houseBolType: "OBL" })[k]).map((f) => f.key)).toEqual(["houseBolType", "masterBolType"]);
    // With the B/L in hand it waits for none: the OBL is still a value of its own, the empty type is left out.
    const inHand = (k: string) => ({ houseBolType: "OBL", telexReleaseReceivedDate: "2026-11-20" })[k];
    expect(fieldsForMode(rows, roadImport, inHand).map((f) => f.key)).toEqual(["houseBolType"]);
    expect(fieldsForMode(rows, { ...roadImport, tradeDirection: "Domestic" }, () => "OBL")).toHaveLength(2);
    // A road export's OBL is the one the server started it with, before it stopped seeding it on road.
    expect(fieldsForMode(rows, { freightMode: "Road Freight", tradeDirection: "Export" }, () => " obl ")).toEqual([]);
    expect(fieldsForMode(rows, { freightMode: "Road Freight", tradeDirection: "Export" }, () => "Seaway")).toHaveLength(2);
  });

  it("keep the customs status on a road job that goes through customs: an international one, or a Trucking job with an MRN or a customs deadline", () => {
    const has = (mode: Parameters<typeof fieldsForMode>[1]) => fieldsForMode(SEA_ROWS, mode, seededOf).some((f) => f.key === "customsStatus");
    expect(has({ freightMode: "Road Freight", tradeDirection: "Import" })).toBe(true);
    expect(has({ ...domestic, mrn: "26CZ000000000001A0" })).toBe(true);
    expect(has({ ...domestic, customsDeadline: "2026-11-25" })).toBe(true);
    expect(has({ ...domestic, mrn: " " })).toBe(false);
  });

  it("keep the sea names on a road job: road comes before air, as on the server", () => {
    expect(fieldsForMode([{ key: "pol", label: "Port of Loading" }], { freightMode: "Air Freight", tradeDirection: "Domestic" }, none)).toEqual([{ key: "pol", label: "Port of Loading" }]);
    expect(carrierCardTitle({ freightMode: "Air Freight", tradeDirection: "Domestic" })).toBe("Carrier & Bill of Lading");
  });
});

describe("the progress bar's stages (user council T9)", () => {
  const labels = (mode: Parameters<typeof progressStagesFor>[0]) => progressStagesFor(mode).map((s) => s.label);

  it("are the six sea stages on a sea job or one with no mode", () => {
    expect(progressStagesFor("Sea Freight")).toEqual(SEA_STAGES);
    expect(progressStagesFor(undefined)).toEqual(SEA_STAGES);
  });

  it("arrive at the destination airport on air and at the terminal on rail", () => {
    expect(labels("Air Freight")).toEqual(["Booking confirmed", "Cargo ready", "In transit", "Arrive at destination airport", "Customs clearance", "Delivered"]);
    expect(labels("Rail Freight")[3]).toBe("Arrive at destination terminal");
  });

  it("have no port on a road job, and no customs on a Trucking job that goes through none", () => {
    expect(labels({ freightMode: "Road Freight", tradeDirection: "Domestic" })).toEqual(["Booking confirmed", "Cargo ready", "In transit", "Delivered"]);
    expect(progressStagesFor({ freightMode: "Road Freight", tradeDirection: "Domestic" }).map((s) => s.index)).toEqual([0, 1, 2, 5]);
    expect(labels({ freightMode: "Road Freight", tradeDirection: "Import" })).toEqual(["Booking confirmed", "Cargo ready", "In transit", "Customs clearance", "Delivered"]);
    expect(labels({ tradeDirection: "Import", department: "Road Department", mrn: "26CZ000000000001A0" })).toContain("Customs clearance");
  });

  it("move on past a stage left out to the next one shown", () => {
    const truck = progressStagesFor({ tradeDirection: "Domestic" });
    expect(currentStageOf(truck, 2)).toBe(2);
    // "Booked for further transport" (stage 4) ticked, or the ATA in (stage 4 by the facts): Delivered is next.
    expect(currentStageOf(truck, 3)).toBe(5);
    expect(currentStageOf(truck, 4)).toBe(5);
    // All done.
    expect(currentStageOf(truck, 6)).toBeUndefined();
    expect(currentStageOf(SEA_STAGES, 3)).toBe(3);
  });
});

describe("the Tasks card's heading (user council T9)", () => {
  it("names the checklist it shows", () => {
    expect(workflowHeading("Export")).toBe("Export Workflow");
    expect(workflowHeading("Import")).toBe("Import Workflow");
    expect(workflowHeading(" Domestic ")).toBe("Domestic Workflow");
    expect(workflowHeading(null)).toBe("Import Workflow");
    // A Road Department job gets a truck's tasks whatever its direction (Domestic keeps its own name).
    expect(workflowHeading("Import", "Road Department")).toBe("Road Workflow");
    expect(workflowHeading("Export", " road department ")).toBe("Road Workflow");
    expect(workflowHeading("Domestic", "Road Department")).toBe("Domestic Workflow");
    expect(workflowHeading("Export", "Sea Department")).toBe("Export Workflow");
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

// Mock council S4-3, S4-4: an air job's (and air master job's) rows say air waybill, flight and airports.
describe("an air job's release and its master job's rows", () => {
  it("names the House BoL release by the air waybill on air, and as before on sea and road", () => {
    expect(houseReleaseWords("Air Freight")).toEqual({ label: "HAWB Release", button: "Release Air Waybill", document: "Air Waybill" });
    expect(houseReleaseWords("Sea Freight")).toEqual({ label: "House BoL Release", button: "Release Bill of Lading", document: "Bill of Lading" });
    expect(fieldsForMode([{ key: "houseBolRelease", label: "House BoL Release" }], "Air Freight", none)[0]!.label).toBe("HAWB Release");
  });

  it("gives a row its air name on air, its own elsewhere", () => {
    expect(modeLabel("masterBolNumber", "Master BoL Number", "Air Freight")).toBe("MAWB Number");
    expect(modeLabel("vessel", "Vessel", "Air Freight")).toBe("Flight");
    expect(modeLabel("pol", "Port of Loading", "Air Freight")).toBe("Airport of Departure");
    expect(modeLabel("pol", "Port of Loading", "Sea Freight")).toBe("Port of Loading");
    expect(modeLabel("hub", "HUB", "Air Freight")).toBe("HUB");
  });
});

// Mock council S4-Q2 / R17: an air job shows its chargeable weight, read only.
describe("an air job's chargeable weight", () => {
  it("is the greater of the gross weight and the volumetric weight (m³ × 1,000,000 ÷ 6000), as the quote's", () => {
    expect(airChargeableWeight("Air Freight", "640", "1.2")).toBe("640.0 kg");
    expect(airChargeableWeight("Air Freight", "100", "3")).toBe("500.0 kg");
    expect(airChargeableWeight("Air Freight", "", "")).toBe("—");
  });

  it("is shown on air jobs only", () => {
    expect(showsChargeableWeight("Air Freight")).toBe(true);
    expect(showsChargeableWeight("Sea Freight")).toBe(false);
    expect(showsChargeableWeight({ freightMode: "Air Freight", tradeDirection: "Domestic" })).toBe(false);
    expect(airChargeableWeight("Sea Freight", "640", "1.2")).toBe("");
  });
});

// Mock test S21-044: an air job (and air master job) shows no empty container or US ocean-filing rows.
describe("an air job's container rows and AMS / ISF deadlines (mock test S21-044)", () => {
  const EQUIP = ["releaseReference", "releaseDepot", "plateNumber", "redeliveryReference", "redeliveryDepot", "equipmentDelivery", "equipmentDeliveryDate"].map((key) => ({ key, label: key }));
  const DATES = ["estimatedDeparture", "pickupDate", "amsDeadline", "isfDeadline"].map((key) => ({ key, label: key }));

  it("leaves out the empty release / redelivery and equipment delivery rows on air, but keeps the truck's Plate Number", () => {
    expect(fieldsForMode(EQUIP, "Air Freight", none).map((f) => f.key)).toEqual(["plateNumber"]);
    // A master job's Equipment row too.
    expect(fieldsForMode([{ key: "equipment", label: "Equipment" }], "Air Freight", none)).toEqual([]);
  });

  it("leaves out the empty AMS and ISF deadlines on air", () => {
    expect(fieldsForMode(DATES, "Air Freight", none).map((f) => f.key)).toEqual(["estimatedDeparture", "pickupDate"]);
  });

  it("leaves out the ISF on air while it is Not Applicable as the server starts it, but keeps the AMS (US air cargo has one)", () => {
    const rows = [{ key: "ams", label: "AMS (if any)" }, { key: "isf", label: "ISF (if any)" }];
    expect(fieldsForMode(rows, "Air Freight", () => "Not Applicable").map((f) => f.key)).toEqual(["ams"]);
    expect(fieldsForMode(rows, "Air Freight", () => "Pending").map((f) => f.key)).toEqual(["ams", "isf"]);
    expect(fieldsForMode(rows, "Sea Freight", () => "Not Applicable")).toEqual(rows);
  });

  it("keeps any of them that holds a value, under its sea name", () => {
    const valueOf = (k: string) => ({ releaseDepot: "CTD Praha", isfDeadline: "2026-11-30", equipment: "1x40HC" })[k] ?? "";
    expect(fieldsForMode(EQUIP, "Air Freight", valueOf).map((f) => f.key)).toEqual(["releaseDepot", "plateNumber"]);
    expect(fieldsForMode(DATES, "Air Freight", valueOf).map((f) => f.key)).toEqual(["estimatedDeparture", "pickupDate", "isfDeadline"]);
    expect(fieldsForMode([{ key: "equipment", label: "Equipment" }], "Air Freight", valueOf)).toEqual([{ key: "equipment", label: "Equipment" }]);
  });

  it("leaves sea, rail and road jobs as they were", () => {
    for (const mode of ["Sea Freight", "Rail Freight", "", null]) {
      expect(fieldsForMode(EQUIP, mode, none)).toEqual(EQUIP);
      expect(fieldsForMode(DATES, mode, none)).toEqual(DATES);
    }
    // A road job keeps its equipment rows and leaves out the AMS / ISF deadlines by its own rule (T9).
    expect(fieldsForMode(EQUIP, "Road Freight", none)).toEqual(EQUIP);
    expect(fieldsForMode(DATES, "Road Freight", none).map((f) => f.key)).toEqual(["estimatedDeparture", "pickupDate"]);
  });

  it("names the Equipment & Depot card after the truck on air while its container rows are empty", () => {
    expect(equipmentCardTitle("Air Freight", none)).toBe("Truck");
    // The plate is the truck's: it keeps the name.
    expect(equipmentCardTitle("Air Freight", (k) => (k === "plateNumber" ? "1AB 2345" : ""))).toBe("Truck");
    // A container row filled in shows, so the card keeps its sea name.
    expect(equipmentCardTitle("Air Freight", (k) => (k === "redeliveryDepot" ? "CTD" : ""))).toBe("Equipment & Depot");
    expect(equipmentCardTitle("Sea Freight", none)).toBe("Equipment & Depot");
    expect(equipmentCardTitle("Road Freight", none)).toBe("Equipment & Depot");
    expect(equipmentCardTitle({ freightMode: "Air Freight", tradeDirection: "Domestic" }, none)).toBe("Equipment & Depot");
  });

  it("calls a master job's document the MAWB on air, the MBL elsewhere", () => {
    expect(masterBolWord("Air Freight")).toBe("MAWB");
    expect(masterBolWord("Sea Freight")).toBe("MBL");
    expect(masterBolWord("")).toBe("MBL");
  });
});
