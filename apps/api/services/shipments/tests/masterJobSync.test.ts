import { describe, expect, it } from "vitest";
import {
  containersFromHouses,
  formatMczNumber,
  isLoadTypeChange,
  houseContainerLines,
  legacyContainerGroups,
  mczSequence,
  syncedShipmentData,
} from "../services/masterJobSync";
import type { ContainerLine } from "../interfaces/interfaces";

const line = (containerNumber: string, extra: Partial<ContainerLine> = {}): ContainerLine => ({
  containerNumber,
  sealNumber: "",
  type: "",
  teu: "",
  packages: "",
  packageType: "",
  grossWeight: "",
  volume: "",
  ...extra,
});

describe("syncedShipmentData", () => {
  const masterJob = { vessel: "MSC ANNA", voyage: "", pol: "CNSHA", shipper: "ACME", estimatedDeparture: null };

  it("copies only filled-in synced fields when a shipment is linked", () => {
    expect(syncedShipmentData(masterJob)).toEqual({ vessel: "MSC ANNA", pol: "CNSHA" });
  });

  it("copies the booking confirmation's booking number, closings and release reference", () => {
    expect(
      syncedShipmentData({
        bookingNumber: "BK1",
        closingDate: "2026-11-19",
        vgmClosing: "2026-11-18",
        siClosing: "2026-11-17",
        releaseReference: "REL1",
      }),
    ).toEqual({
      bookingNumber: "BK1",
      closingDate: "2026-11-19",
      vgmClosing: "2026-11-18",
      siClosing: "2026-11-17",
      releaseReference: "REL1",
    });
  });

  it("never copies master-job-only fields", () => {
    expect(syncedShipmentData(masterJob)).not.toHaveProperty("shipper");
    expect(syncedShipmentData(masterJob, { shipper: "X", destination: "Y" })).toEqual({});
  });

  it("writes every synced field of a save, blanks included", () => {
    expect(syncedShipmentData(masterJob, { voyage: "", estimatedDeparture: null, vessel: "MSC ANNA" })).toEqual({
      voyage: "",
      estimatedDeparture: null,
      vessel: "MSC ANNA",
    });
  });
});

describe("MCZ numbers", () => {
  it("formats and parses the per-company sequence", () => {
    expect(formatMczNumber(12)).toBe("MCZ00000012");
    expect(mczSequence("MCZ00000012")).toBe(12);
    expect(mczSequence("CZ00000012")).toBe(0);
    expect(mczSequence("MCZabc")).toBe(0);
  });
});

describe("houseContainerLines", () => {
  const mbl = [
    { containerNumber: "MSKU1234567", sealNumber: "S1", type: "40' HC", shipmentIds: ["a", "b"] },
    { containerNumber: "TGHU7654321", sealNumber: "S2", type: "20' GP", shipmentIds: ["b"] },
  ];

  it("gives a house the containers assigned to it", () => {
    expect(houseContainerLines("a", [], mbl)).toEqual([
      line("MSKU1234567", { sealNumber: "S1", type: "40' HC" }),
    ]);
  });

  it("keeps the house row id and cargo figures of a matching container", () => {
    const house = [line("msku 1234567", { id: "c1", packages: "10", sealNumber: "OLD" })];
    expect(houseContainerLines("a", house, mbl)).toEqual([
      line("MSKU1234567", { id: "c1", packages: "10", sealNumber: "S1", type: "40' HC" }),
    ]);
  });

  it("drops a master-job container no longer assigned to the house, keeps the house's own ones", () => {
    const house = [line("TGHU7654321", { id: "c2" }), line("ABCU1111111", { id: "own" })];
    expect(houseContainerLines("a", house, mbl)).toEqual([
      line("MSKU1234567", { sealNumber: "S1", type: "40' HC" }),
      line("ABCU1111111", { id: "own" }),
    ]);
  });

  it("leaves a house alone when the master job has nothing for it", () => {
    expect(houseContainerLines("c", [line("ABCU1111111")], mbl)).toBeNull();
    expect(houseContainerLines("c", [], [])).toBeNull();
  });
});

describe("legacyContainerGroups", () => {
  it("groups container types into the four Count/Length/Type columns", () => {
    const groups = legacyContainerGroups(["40' HC", "20' GP", "40' HC"]);
    expect(groups).toMatchObject({
      containerCount1: "2",
      containerLength1: "40",
      containerType1: "HC",
      containerCount2: "1",
      containerLength2: "20",
      containerType2: "GP",
      containerCount3: "",
      containerLength3: "",
      containerType3: "",
    });
  });

  it("clears every group when there are no containers", () => {
    expect(Object.values(legacyContainerGroups([])).every((v) => v === "")).toBe(true);
  });
});

describe("containersFromHouses", () => {
  it("lists each container once, assigned to every house that carries it", () => {
    expect(
      containersFromHouses([
        { shipmentId: "a", containerNumber: "msku 1234567", sealNumber: "", type: "40' HC" },
        { shipmentId: "b", containerNumber: "MSKU1234567", sealNumber: "S1", type: "" },
        { shipmentId: "b", containerNumber: "TGHU7654321", sealNumber: "S2", type: "20' GP" },
      ]),
    ).toEqual([
      { containerNumber: "MSKU1234567", sealNumber: "S1", type: "40' HC", shipmentIds: ["a", "b"] },
      { containerNumber: "TGHU7654321", sealNumber: "S2", type: "20' GP", shipmentIds: ["b"] },
    ]);
  });

  it("leaves out containers without a number", () => {
    expect(containersFromHouses([{ shipmentId: "a", containerNumber: " ", sealNumber: "S", type: "20' GP" }])).toEqual([]);
  });
});

describe("isLoadTypeChange", () => {
  it("allows choosing a load type once", () => {
    expect(isLoadTypeChange("", "Full Load")).toBe(false);
    expect(isLoadTypeChange("Full Load", "Full Load")).toBe(false);
    expect(isLoadTypeChange("Full Load", undefined)).toBe(false);
  });

  it("refuses switching or clearing a chosen one", () => {
    expect(isLoadTypeChange("Full Load", "Consolidation")).toBe(true);
    expect(isLoadTypeChange("Consolidation", "")).toBe(true);
  });
});
