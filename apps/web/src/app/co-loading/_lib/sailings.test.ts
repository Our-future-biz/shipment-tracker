import { describe, expect, it } from "vitest";
import { CONTAINER_TYPES } from "@/lib/cargo";
// The server's list of the types a sailing takes (shipments lib/coLoadingSailing): pure, so it is read here.
import { SAILING_CONTAINER_TYPES } from "../../../../../api/services/shipments/lib/coLoadingSailing";
import {
  SAILING_TABS,
  sailingFormError,
  sailingHref,
  sailingTabOf,
  sailingTabsFor,
  sailingTitle,
  sailingWeek,
  voyageNeeded,
} from "./sailings";

const FILLED = {
  vessel: "MSC Anna",
  voyage: "445W",
  pol: "Shanghai (CNSHA)",
  pod: "Hamburg (DEHAM)",
  hub: "Praha (CZPRG)",
  containerType: "40' HC",
};

describe("a Co-Loading Concept sailing", () => {
  it("takes the week it sails as the vessel, written in any of the usual ways", () => {
    for (const typed of ["WEEK 44", "week 44", "Week44", "wk 44", "w44", "Wk. 44"])
      expect(sailingWeek(typed), typed).toBe("WEEK 44");
    for (const typed of ["MSC Anna", "WEEK 0", "WEEK 54", "Westwood", ""])
      expect(sailingWeek(typed), typed).toBeNull();
  });

  it("needs a voyage with a vessel's name, not with a week", () => {
    expect(voyageNeeded("MSC Anna")).toBe(true);
    expect(voyageNeeded("week 44")).toBe(false);
    expect(sailingFormError(FILLED)).toBeNull();
    // The cut-off may not be after the departure date; either alone, or the same day, is fine.
    expect(sailingFormError({ ...FILLED, cutoffDate: "2026-12-19", departureDate: "2026-12-18" })).toBe("The cut-off cannot be after the departure date.");
    expect(sailingFormError({ ...FILLED, cutoffDate: "2026-12-18", departureDate: "2026-12-18" })).toBeNull();
    expect(sailingFormError({ ...FILLED, cutoffDate: "2026-12-19", departureDate: null })).toBeNull();
    expect(sailingFormError({ ...FILLED, voyage: " " })).toBe(
      "Give the voyage, or write the week in Vessel (WEEK 44) while the vessel is not known.",
    );
    expect(sailingFormError({ ...FILLED, vessel: "WEEK 44", voyage: "" })).toBeNull();
  });

  it("needs the vessel, both ports, the HUB and the container type", () => {
    expect(sailingFormError({ ...FILLED, vessel: "" })).toBe(
      "Give the vessel, or the week it sails (WEEK 44).",
    );
    expect(sailingFormError({ ...FILLED, pol: "" })).toBe("Give the Port of Loading.");
    expect(sailingFormError({ ...FILLED, pod: "" })).toBe("Give the Port of Discharge.");
    expect(sailingFormError({ ...FILLED, hub: "" })).toBe("Give the HUB.");
    expect(sailingFormError({ ...FILLED, containerType: "" })).toBe("Pick the container type.");
  });

  it("offers the container types the server takes (api lib/coLoadingSailing SAILING_CONTAINER_TYPES)", () => {
    // The server's own list, not a copy of it: a type added or dropped on either side fails here.
    expect([...CONTAINER_TYPES]).toEqual([...SAILING_CONTAINER_TYPES]);
    expect(CONTAINER_TYPES).toHaveLength(13);
  });
});

describe("a sailing's page", () => {
  it("is under its service's, named by its vessel and voyage", () => {
    expect(sailingHref({ id: "s1", serviceId: "svc" })).toBe("/co-loading/svc/sailings/s1");
    expect(sailingTitle({ vessel: "MSC Anna", voyage: "445W" })).toBe("MSC Anna 445W");
    expect(sailingTitle({ vessel: "WEEK 44", voyage: "" })).toBe("WEEK 44");
  });

  it("has Box utilization, Linked shipments and Earnings, opening on the first", () => {
    expect(SAILING_TABS.map((t) => t.label)).toEqual([
      "Box utilization",
      "Linked shipments",
      "Earnings",
    ]);
    expect(sailingTabOf(null)).toBe("box");
    expect(sailingTabOf("earnings")).toBe("earnings");
    expect(sailingTabOf("nonsense")).toBe("box");
    // Earnings is the managers' tab: nobody else sees it or opens it by its address.
    expect(sailingTabsFor(true).map((t) => t.key)).toEqual(["box", "shipments", "earnings"]);
    expect(sailingTabsFor(false).map((t) => t.key)).toEqual(["box", "shipments"]);
    expect(sailingTabOf("earnings", false)).toBe("box");
  });
});
