import { describe, expect, it } from "vitest";
import { checkSailingInput, linkRefusal, moveRefusal, oddInBox, sailingDetailsProblem, sailingEdit, SAILING_CONTAINER_TYPES, sailingWeek, VESSEL_MAX } from "../lib/coLoadingSailing";

const PORTS = { pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC" };
// A sailing made without them has one container and no cut-off.
const ONE_BOX = { containerCount: 1, cutoffDate: null, departureDate: null };
// The day the rules are judged on: every date below is read against it, never against the clock.
const TODAY = "2026-11-23";

describe("a Co-Loading Concept sailing", () => {
  it("is saved trimmed, with its vessel and voyage", () => {
    expect(checkSailingInput({ vessel: "  MSC   Anna ", voyage: " 445W ", ...PORTS, pol: " Shanghai (CNSHA) " }, TODAY)).toEqual({
      values: { vessel: "MSC Anna", voyage: "445W", ...PORTS, ...ONE_BOX },
    });
  });

  it("takes the week it sails for a vessel not known yet, written WEEK 44, and then needs no voyage", () => {
    for (const typed of ["WEEK 44", "week 44", "Week44", "wk 44", "WK44", "w44", "Wk. 44"]) {
      expect(checkSailingInput({ vessel: typed, ...PORTS }, TODAY), typed).toEqual({ values: { vessel: "WEEK 44", voyage: "", ...PORTS, ...ONE_BOX } });
    }
    expect(checkSailingInput({ vessel: "week 3", voyage: "001E", ...PORTS }, TODAY)).toEqual({ values: { vessel: "WEEK 3", voyage: "001E", ...PORTS, ...ONE_BOX } });
    expect(sailingWeek("WEEK 0")).toBeNull();
    expect(sailingWeek("WEEK 54")).toBeNull();
    expect(sailingWeek("Westwood")).toBeNull();
  });

  it("needs a voyage with a named vessel", () => {
    expect(checkSailingInput({ vessel: "MSC Anna", voyage: "  ", ...PORTS }, TODAY)).toHaveProperty("error");
    expect(checkSailingInput({ vessel: "MSC Anna", ...PORTS }, TODAY)).toEqual({
      error: "Give the voyage, or write the week in Vessel (WEEK 44) while the vessel is not known.",
    });
  });

  it("needs the vessel, both ports, the HUB and a container type it knows", () => {
    expect(checkSailingInput({ vessel: " ", ...PORTS }, TODAY)).toEqual({ error: "Give the vessel, or the week it sails (WEEK 44)." });
    expect(checkSailingInput({ vessel: "x".repeat(VESSEL_MAX + 1), voyage: "1", ...PORTS }, TODAY)).toHaveProperty("error");
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, pol: "" }, TODAY)).toEqual({ error: "Give the Port of Loading." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, pod: "" }, TODAY)).toEqual({ error: "Give the Port of Discharge." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, hub: " " }, TODAY)).toEqual({ error: "Give the HUB." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, containerType: "40 HC" }, TODAY)).toEqual({ error: "Pick the container type." });
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
    // Only what the box is for goes in: another mode of transport, or a full load in a consolidation box, is refused.
    const lcl = { ...free, freightMode: "Sea Freight", loadType: "Part Load" };
    expect(linkRefusal(lcl, "ISHA", SAILING, "sea_lcl")).toBeNull();
    expect(linkRefusal({ ...lcl, freightMode: "Air Freight" }, "ISHA", SAILING, "sea_lcl")).toBe("CZLCL00000299 is Air Freight: only Sea LCL shipments go on this sailing.");
    expect(linkRefusal({ ...lcl, loadType: "Full Load" }, "ISHA", SAILING, "sea_lcl")).toBe("CZLCL00000299 is Full Load: only Sea LCL shipments go on this sailing.");
    expect(linkRefusal({ ...lcl, loadType: "Full Load" }, "ISHA", SAILING, "sea_fcl")).toBeNull();
    expect(linkRefusal({ ...lcl, freightMode: "" }, "ISHA", SAILING, "sea_lcl")).toBeNull();
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

  it("reads the Freight Mode and the Load Type trimmed and in any case, as a job number's letters do", () => {
    expect(oddInBox("sea_lcl", { freightMode: " SEA FREIGHT ", loadType: "Consolidation" })).toBeNull();
    expect(oddInBox("sea_lcl", { freightMode: "sea freight", loadType: "consolidation" })).toBeNull();
    expect(oddInBox("air", { freightMode: "air freight", loadType: "" })).toBeNull();
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: " full load " })).toBe("Full Load");
    expect(oddInBox("sea_lcl", { freightMode: "Sea Freight", loadType: "PROJECT SHIPMENT" })).toBe("Project Shipment");
    expect(linkRefusal({ jobNumber: "CZLCL00000001", serviceName: "ISHA", freightMode: "sea freight", loadType: "Consolidation", onSailing: null }, "ISHA", "s1", "sea_lcl")).toBeNull();
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
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, containerCount: 2, cutoffDate: "2026-10-26" }, TODAY)).toMatchObject({ values: { containerCount: 2, cutoffDate: "2026-10-26" } });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, cutoffDate: "" }, TODAY)).toMatchObject({ values: { containerCount: 1, cutoffDate: null } });
  });

  it("are refused when they are wrong", () => {
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, containerCount: 0 }, TODAY)).toEqual({ error: "Give the number of containers, from 1 to 20." });
    expect(checkSailingInput({ vessel: "WEEK 44", ...PORTS, cutoffDate: "26.10.2026" }, TODAY)).toEqual({ error: "The cut-off is not a date." });
  });
});

describe("what Edit sailing changes", () => {
  it("takes 1 to 20 containers and a cut-off day, or none", () => {
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null }, TODAY)).toBeNull();
    expect(sailingDetailsProblem({ containerCount: 20, cutoffDate: "2026-12-14" }, TODAY)).toBeNull();
    // The departure date: a date, not before the cut-off; left out, it is not judged.
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: "2026-12-14", departureDate: "2026-12-18" }, TODAY)).toBeNull();
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null, departureDate: null }, TODAY)).toBeNull();
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null, departureDate: "18.12.2026" }, TODAY)).toBe("The departure date is not a date.");
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: "2026-12-19", departureDate: "2026-12-18" }, TODAY)).toBe("The cut-off cannot be after the departure date.");
    // A slip of the year is caught: more than two years from today either way.
    const far = "The departure date is more than two years from today: check the year.";
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null, departureDate: "2206-12-18" }, TODAY)).toBe(far);
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null, departureDate: "0202-12-18" }, TODAY)).toBe(far);
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null, departureDate: "2025-12-18" }, TODAY)).toBeNull();
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: null, departureDate: "2028-11-01" }, TODAY)).toBeNull();
    for (const count of [0, 21, 1.5, Number.NaN]) expect(sailingDetailsProblem({ containerCount: count, cutoffDate: null }, TODAY), String(count)).toContain("from 1 to 20");
    for (const day of ["14.12.2026", "2026-13-40", "soon", ""]) expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: day }, TODAY), day).toBe("The cut-off is not a date.");
  });

  it("checks the cut-off against the stored departure date when none is sent", () => {
    const stored = { departureDate: "2026-12-10" };
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: "2026-12-31" }, TODAY, stored)).toBe("The cut-off cannot be after the departure date.");
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: "2026-12-08" }, TODAY, stored)).toBeNull();
    // A departure date sent, null among it, is the one judged.
    expect(sailingDetailsProblem({ containerCount: 1, cutoffDate: "2026-12-31", departureDate: null }, TODAY, stored)).toBeNull();
  });

  it("asks for the year only of a departure date that changes: a sailing that left long ago stays editable", () => {
    const left = { departureDate: "2024-10-01" };
    expect(sailingDetailsProblem({ containerCount: 2, cutoffDate: "2024-09-28", departureDate: "2024-10-01" }, TODAY, left)).toBeNull();
    expect(sailingDetailsProblem({ containerCount: 2, cutoffDate: null }, TODAY, left)).toBeNull();
    expect(sailingDetailsProblem({ containerCount: 2, cutoffDate: null, departureDate: "2024-10-02" }, TODAY, left)).toBe("The departure date is more than two years from today: check the year.");
  });
});

describe("Edit sailing, judged on the sailing as it is", () => {
  const stored = { containerCount: 1, cutoffDate: null, departureDate: null };
  const anyone = { today: TODAY, costedContainers: [], mayMoveCosts: false };

  it("gives the changes that move the box costs, for the record", () => {
    expect(sailingEdit(stored, { containerCount: 2, cutoffDate: null, departureDate: "2026-12-10" }, anyone)).toEqual({
      changes: [
        { kind: "containers", oldAmount: 1, newAmount: 2, oldNote: "", newNote: "" },
        { kind: "departure", oldAmount: null, newAmount: null, oldNote: "", newNote: "2026-12-10" },
      ],
    });
    expect(sailingEdit(stored, { containerCount: 1, cutoffDate: "2026-12-01" }, anyone)).toEqual({ changes: [] });
  });

  it("lets only managers move the box costs once a container has some (K13); the cut-off stays anyone's", () => {
    const costed = { ...anyone, costedContainers: [1] };
    expect(sailingEdit(stored, { containerCount: 2, cutoffDate: null }, costed)).toEqual({
      denied: "This sailing has box costs: only managers and admins change its number of containers or its departure date.",
    });
    expect(sailingEdit(stored, { containerCount: 1, cutoffDate: null, departureDate: "2026-12-10" }, costed)).toHaveProperty("denied");
    expect(sailingEdit(stored, { containerCount: 1, cutoffDate: "2026-12-01" }, costed)).toEqual({ changes: [] });
    expect(sailingEdit(stored, { containerCount: 2, cutoffDate: null }, { ...costed, mayMoveCosts: true })).toHaveProperty("changes");
  });

  it("refuses details that cannot be saved, before who may change them", () => {
    expect(sailingEdit({ ...stored, departureDate: "2026-12-10" }, { containerCount: 1, cutoffDate: "2026-12-31" }, { ...anyone, costedContainers: [1] })).toEqual({
      invalid: "The cut-off cannot be after the departure date.",
    });
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
