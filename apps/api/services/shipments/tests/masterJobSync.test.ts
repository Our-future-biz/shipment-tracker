import { describe, expect, it } from "vitest";
import {
  agreedHouseValues,
  containersFromHouses,
  isLoadTypeChange,
  houseContainerLines,
  legacyContainerGroups,
  syncedShipmentData,
} from "../lib/masterJobSync";
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

  it("copies the HUB onto a linked shipment, and a cleared HUB clears it", () => {
    expect(syncedShipmentData({ hub: "Prague (CZPRG)" })).toEqual({ hub: "Prague (CZPRG)" });
    expect(syncedShipmentData({ hub: "" })).toEqual({});
    expect(syncedShipmentData({}, { hub: "" })).toEqual({ hub: "" });
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

// A master job made from houses starts with what they all agree on (User Council O10, owner's answer Q6).
describe("agreedHouseValues", () => {
  const house = (over: Record<string, unknown> = {}) => ({
    jobNumber: "CZLCL00000089",
    customer: "Alfa s.r.o.",
    freightMode: "Sea Freight",
    tradeDirection: "Import",
    loadType: "Consolidation",
    pol: "CNNGB",
    pod: "DEHAM",
    vessel: "MSC ANNA",
    voyage: "",
    estimatedDeparture: "2026-11-24",
    estimatedArrival: null,
    closingDate: "2026-11-20",
    closingTime: "12:00",
    ...over,
  });

  it("takes each field the houses all have filled in alike, and leaves out one they differ on or leave empty", () => {
    expect(agreedHouseValues([house(), house({ jobNumber: "CZLCL00000090", vessel: "MSC BELLA" })])).toEqual({
      freightMode: "Sea Freight",
      tradeDirection: "Import",
      loadType: "Consolidation",
      pol: "CNNGB",
      pod: "DEHAM",
      estimatedDeparture: "2026-11-24",
      closingDate: "2026-11-20",
      closingTime: "12:00",
    });
  });

  it("leaves out a field one house has empty, so linking writes nothing over the others", () => {
    expect(agreedHouseValues([house(), house({ pol: "" }), house({ pol: null })])).not.toHaveProperty("pol");
  });

  it("takes only the master job's own fields: no customer, no job number", () => {
    const values = agreedHouseValues([house()]);
    expect(values).not.toHaveProperty("customer");
    expect(values).not.toHaveProperty("jobNumber");
    expect(values).toMatchObject({ vessel: "MSC ANNA", freightMode: "Sea Freight" });
  });

  it("takes a time only with its date", () => {
    const values = agreedHouseValues([house(), house({ closingDate: "2026-11-21" })]);
    expect(values).not.toHaveProperty("closingDate");
    expect(values).not.toHaveProperty("closingTime");
  });

  it("is nothing for no houses", () => {
    expect(agreedHouseValues([])).toEqual({});
  });

  it("never takes the Master B/L: houses agreeing on one carry another master job's (step 3 review M3)", () => {
    const values = agreedHouseValues([house({ masterBolNumber: "MEDU1234567", masterBolType: "OBL" }), house({ masterBolNumber: "MEDU1234567", masterBolType: "OBL" })]);
    expect(values).not.toHaveProperty("masterBolNumber");
    expect(values).not.toHaveProperty("masterBolType");
    // So linking them writes no Master B/L onto them either.
    expect(syncedShipmentData(values)).not.toHaveProperty("masterBolNumber");
  });

  it("agrees on a port by its code, with the text of the house written last (step 3 review, minor 2)", () => {
    const older = house({ pol: "Shanghai Hongqiao International Apt (CNSHA)", pod: "Hamburg (DEHAM)", updatedAt: new Date("2026-10-01T08:00:00Z") });
    const newer = house({ pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", updatedAt: new Date("2026-11-19T08:00:00Z") });
    expect(agreedHouseValues([older, newer])).toMatchObject({ pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)" });
    expect(agreedHouseValues([newer, older])).toMatchObject({ pol: "Shanghai (CNSHA)" });
    // Another code is another port; text without a code compares as it is.
    expect(agreedHouseValues([older, house({ pol: "Ningbo (CNNGB)" })])).not.toHaveProperty("pol");
    expect(agreedHouseValues([house({ pol: "Shanghai" }), house({ pol: "Shanghai (CNSHA)" })])).not.toHaveProperty("pol");
    // Only places compare by a code: other text must match exactly.
    expect(agreedHouseValues([house({ vessel: "MSC ANNA (CNSHA)" }), house({ vessel: "MSC BELLA (CNSHA)" })])).not.toHaveProperty("vessel");
  });

  it("writes onto a linked house only what it has already", () => {
    const houses = [house(), house({ vessel: "MSC BELLA", estimatedDeparture: null })];
    const onLink = syncedShipmentData(agreedHouseValues(houses));
    expect(Object.keys(onLink).length).toBeGreaterThan(0);
    for (const h of houses) for (const [key, value] of Object.entries(onLink)) expect((h as Record<string, unknown>)[key]).toBe(value);
  });
});
