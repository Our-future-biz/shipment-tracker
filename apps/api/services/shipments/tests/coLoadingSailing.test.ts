import { describe, expect, it } from "vitest";
import { checkSailingInput, linkRefusal, moveRefusal, oddInBox, sailingDetailsProblem, SAILING_CONTAINER_TYPES, sailingWeek, VESSEL_MAX } from "../lib/coLoadingSailing";

const PORTS = { pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC" };
// A sailing made without them has one container and no cut-off.
const ONE_BOX = { containerCount: 1, cutoffDate: null };

describe("a Co-Loading Concept sailing", () => {
  it("is saved trimmed, with its vessel and voyage", () => {
    expect(checkSailingInput({ vessel: "  MSC   Anna ", voyage: " 445W ", ...PORTS, pol: " Shanghai (CNSHA) " })).toEqual({
      values: { vessel: "MSC Anna", voyage: "445W", ...PORTS, ...ONE_BOX },
    });
  });

  it("takes the week it sails for a vessel not known yet, written WEEK 44, and then needs no voyage", () => {
    for (const typed of ["WEEK 44", "week 44", "Week44", "wk 44", "WK44", "w44", "Wk. 44"]) {
      expect(checkSailingInput({ vessel: typed, ...PORTS }), typed).toEqual({ values: { vessel: "WEEK 44", voyage: "", ...PORTS, ...ONE_BOX } });
    }
    expect(checkSailingInput({ vessel: "week 3", voyage: "001E", ...PORTS })).toEqual({ values: { vessel: "WEEK 3", voyage: "001E", ...PORTS, ...ONE_BOX } });
    expect(sailingWeek("WEEK 0")).toBeNull();
    expect(sailingWeek("WEEK 54")).toBeNull();
    expect(sailingWeek("Westwood")).toBeNull();
  });

  it("needs a voyage with a named vessel", () => {
    expect(checkSailingInput({ vessel: "MSC Anna", voyage: "  ", ...PORTS })).toHaveProperty("error");
    expect(checkSailingInput({ vessel: "MSC Anna", ...PORTS })).toEqual({
      error: "Give the voyage, or write the week in Vessel (WEEK 44) while the vessel is not known.",
    });
  });

  it("needs the vessel, both ports, the HUB and a container type it knows", () => {
    expect(checkSailingInput({ vessel: " ", ...PORTS })).toEqual({ error: "Give the vessel, or the week it sails (WEEK 44)." });
    expect(checkSailingInput({ vessel: "x".repeat(VESSEL_MAX + 1), voyage: "1", ...PORTS })).toHaveProperty("error");
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, pol: "" })).toEqual({ error: "Give the Port of Loading." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, pod: "" })).toEqual({ error: "Give the Port of Discharge." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, hub: " " })).toEqual({ error: "Give the HUB." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, containerType: "40 HC" })).toEqual({ error: "Pick the container type." });
  });

  it("takes the container types quotes and shipments use", () => {
    expect(SAILING_CONTAINER_TYPES).toEqual(["20' DC", "20' RF", "20' OT", "20' HOT", "20' FR", "40' DC", "40' HC", "40' HRF", "40' OT", "40' HOT", "40' FR", "40' HFR", "45' HQ"]);
  });
});

describe("linking a shipment to a sailing", () => {
  const SAILING = "sailing-1";
  const free = { jobNumber: "CZLCL00000299", serviceName: "ISHA", onSailing: null };

  it("takes the service's own shipments, by Service Name trimmed and in any case", () => {
    expect(linkRefusal(free, "ISHA", SAILING)).toBeNull();
    expect(linkRefusal({ ...free, serviceName: " isha " }, "ISHA", SAILING)).toBeNull();
    expect(linkRefusal({ ...free, serviceName: "Domestic" }, "ISHA", SAILING)).toBe(
      'CZLCL00000299 has the Service Name "Domestic": only ISHA shipments go on this sailing.',
    );
    expect(linkRefusal({ ...free, serviceName: "" }, "ISHA", SAILING)).toBe('CZLCL00000299 has the Service Name "none": only ISHA shipments go on this sailing.');
    // A service without a Service Name takes none.
    expect(linkRefusal(free, "", SAILING)).not.toBeNull();
  });

  it("puts a shipment on one sailing at a time", () => {
    expect(linkRefusal({ ...free, onSailing: { id: SAILING, name: "WEEK 51" } }, "ISHA", SAILING)).toBe("CZLCL00000299 is on this sailing already.");
    expect(linkRefusal({ ...free, onSailing: { id: "other", name: "MSC Anna 445W" } }, "ISHA", SAILING)).toBe(
      "CZLCL00000299 is on MSC Anna 445W: remove it from there first.",
    );
  });
});

describe("a shipment of another kind than the box is for", () => {
  it("belongs in a sea consolidation box when it is sea freight and not a full load", () => {
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "Consolidation" })).toBeNull();
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "" })).toBeNull();
    expect(oddInBox("sea_lcl", { freightMode: "", loadType: "" })).toBeNull();
  });

  it("is remarked on by its mode of transport, or by having a container of its own", () => {
    expect(oddInBox("sea_lcl", { freightMode: "Air Freight", loadType: "Consolidation" })).toBe("Air Freight");
    expect(oddInBox("sea_lcl", { freightMode: "Road Freight", loadType: "Full Load" })).toBe("Road Freight");
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "Full Load" })).toBe("Full Load");
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "Project Shipment" })).toBe("Project Shipment");
  });

  it("goes by the service's own mode", () => {
    expect(oddInBox("sea_fcl", { freightMode: "Sea Freight", loadType: "Full Load" })).toBeNull();
    expect(oddInBox("air", { freightMode: "Air Freight", loadType: "" })).toBeNull();
    expect(oddInBox("air", { freightMode: "Sea Freight", loadType: "Consolidation" })).toBe("Sea Freight");
    expect(oddInBox("road", { freightMode: "Road Freight", loadType: "Full Load" })).toBeNull();
    expect(oddInBox("rail", { freightMode: "Road Freight", loadType: "" })).toBe("Road Freight");
  });
});

describe("a new sailing's containers and cut-off", () => {
  it("are saved as given", () => {
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, containerCount: 2, cutoffDate: "2026-10-26" })).toMatchObject({ values: { containerCount: 2, cutoffDate: "2026-10-26" } });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, cutoffDate: "" })).toMatchObject({ values: { containerCount: 1, cutoffDate: null } });
  });

  it("are refused when they are wrong", () => {
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, containerCount: 0 })).toEqual({ error: "Give the number of containers, from 1 to 20." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, cutoffDate: "26.10.2026" })).toEqual({ error: "The cut-off is not a date." });
  });
});

describe("what Edit sailing changes", () => {
  it("takes 1 to 20 containers and a cut-off day, or none", () => {
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null })).toBeNull();
    expect(sailingDetailsProblem({ containerCount: 20, cutoffDate: "2026-12-14" })).toBeNull();
    for (const count of [0, 21, 1.5, Number.NaN]) expect(sailingDetailsProblem({ containerCount: count, cutoffDate: null }), String(count)).toContain("from 1 to 20");
    for (const day of ["14.12.2026", "2026-13-40", "soon", ""]) expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: day }), day).toBe("The cut-off is not a date.");
  });
});

describe("moving a shipment to another sailing", () => {
  const from = { id: "a", serviceId: "s1" };

  it("goes to another sailing of the same service, with a reason", () => {
    expect(moveRefusal(from, { id: "b", serviceId: "s1" }, "Box full, rolled to next week")).toBeNull();
  });

  it("is refused without a target, to the same sailing, to another service, or without a reason", () => {
    expect(moveRefusal(from, null, "x")).toBe("The sailing to move it to was not found.");
    expect(moveRefusal(from, { id: "a", serviceId: "s1" }, "x")).toBe("Pick another sailing to move it to.");
    expect(moveRefusal(from, { id: "b", serviceId: "s2" }, "x")).toBe("A shipment moves only to another sailing of the same service.");
    expect(moveRefusal(from, { id: "b", serviceId: "s1" }, "   ")).toBe("Say why the shipment is moved.");
    expect(moveRefusal(from, { id: "b", serviceId: "s1" }, "x".repeat(301))).toContain("at most 300");
  });
});
