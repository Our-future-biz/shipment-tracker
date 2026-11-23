import { describe, expect, it } from "vitest";
import { checkSailingInput, SAILING_CONTAINER_TYPES, sailingWeek, VESSEL_MAX } from "../lib/coLoadingSailing";

const PORTS = { pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC" };

describe("a Co-Loading Concept sailing", () => {
  it("is saved trimmed, with its vessel and voyage", () => {
    expect(checkSailingInput({ vessel: "  MSC   Anna ", voyage: " 445W ", ...PORTS, pol: " Shanghai (CNSHA) " })).toEqual({
      values: { vessel: "MSC Anna", voyage: "445W", ...PORTS },
    });
  });

  it("takes the week it sails for a vessel not known yet, written WEEK 44, and then needs no voyage", () => {
    for (const typed of ["WEEK 44", "week 44", "Week44", "wk 44", "WK44", "w44", "Wk. 44"]) {
      expect(checkSailingInput({ vessel: typed, ...PORTS }), typed).toEqual({ values: { vessel: "WEEK 44", voyage: "", ...PORTS } });
    }
    expect(checkSailingInput({ vessel: "week 3", voyage: "001E", ...PORTS })).toEqual({ values: { vessel: "WEEK 3", voyage: "001E", ...PORTS } });
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
