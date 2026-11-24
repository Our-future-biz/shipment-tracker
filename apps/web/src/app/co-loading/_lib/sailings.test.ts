import { describe, expect, it } from "vitest";
import { CONTAINER_TYPES } from "@/lib/cargo";
// The server's list of the types a sailing takes (shipments lib/coLoadingSailing): pure, so it is read here.
import { SAILING_CONTAINER_TYPES } from "../../../../../api/services/shipments/lib/coLoadingSailing";
import { sailingAttention } from "./attention";
import {
  linkNeedsReason,
  SAILING_STAGES,
  stageBehind,
  stageHasLeft,
  stageOf,
  statusBeforeDeparture,
  cutoffState,
  isoWeek,
  nextSailingAfter,
  nextSailingStart,
  cutoffWords,
  sailingDeparted,
  sailingEditOf,
  sailingsInOrder,
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
      "Checklist and history",
      "Earnings",
    ]);
    expect(sailingTabOf("log", false)).toBe("log");
    expect(sailingTabOf(null)).toBe("box");
    expect(sailingTabOf("earnings")).toBe("earnings");
    expect(sailingTabOf("nonsense")).toBe("box");
    // Earnings is the managers' tab: nobody else sees it or opens it by its address.
    expect(sailingTabsFor(true).map((t) => t.key)).toEqual(["box", "shipments", "log", "earnings"]);
    expect(sailingTabsFor(false).map((t) => t.key)).toEqual(["box", "shipments", "log"]);
    expect(sailingTabOf("earnings", false)).toBe("box");
  });
});

describe("the order of a service's sailings (Council Outlay 14, A2)", () => {
  const TODAY = "2026-11-24";
  const s = (vessel: string, departureDate: string | null, createdAt = "2026-11-01T08:00:00Z") => ({ vessel, departureDate, createdAt });

  it("counts a sailing as left only once its departure date is before today", () => {
    expect(sailingDeparted(s("a", "2026-11-23"), TODAY)).toBe(true);
    expect(sailingDeparted(s("a", TODAY), TODAY)).toBe(false);
    expect(sailingDeparted(s("a", null), TODAY)).toBe(false);
  });

  it("lists the ones to come by departure, the soonest first and the undated last, whenever they were typed in", () => {
    const list = [s("WEEK 53", null, "2026-11-05T08:00:00Z"), s("WEEK 52", "2026-12-24", "2026-11-01T08:00:00Z"), s("WEEK 51", "2026-12-17", "2026-11-20T08:00:00Z"), s("WEEK 54", null, "2026-11-02T08:00:00Z")];
    expect(sailingsInOrder(list, TODAY).coming.map((x) => x.vessel)).toEqual(["WEEK 51", "WEEK 52", "WEEK 54", "WEEK 53"]);
    expect(sailingsInOrder(list, TODAY).departed).toEqual([]);
  });

  it("puts the ones that left apart, the last to leave first", () => {
    const list = [s("WEEK 45", "2026-11-05"), s("WEEK 47", "2026-11-19"), s("WEEK 48", TODAY)];
    const { coming, departed } = sailingsInOrder(list, TODAY);
    expect(coming.map((x) => x.vessel)).toEqual(["WEEK 48"]);
    expect(departed.map((x) => x.vessel)).toEqual(["WEEK 47", "WEEK 45"]);
  });
});

describe("a cut-off beside today", () => {
  const TODAY = "2026-11-24";
  it("is said in days", () => {
    expect(cutoffWords("2026-11-24", TODAY)).toBe("today");
    expect(cutoffWords("2026-11-25", TODAY)).toBe("tomorrow");
    expect(cutoffWords("2026-11-23", TODAY)).toBe("yesterday");
    expect(cutoffWords("2026-12-03", TODAY)).toBe("in 9 days");
    expect(cutoffWords("2026-11-18", TODAY)).toBe("6 days ago");
    expect(cutoffWords(null, TODAY)).toBe("");
  });

  it("turns amber from 3 days before and red once passed (D9)", () => {
    expect(cutoffState("2026-11-28", TODAY)).toBe("far");
    expect(cutoffState("2026-11-27", TODAY)).toBe("near");
    expect(cutoffState(TODAY, TODAY)).toBe("near");
    expect(cutoffState("2026-11-23", TODAY)).toBe("passed");
    expect(cutoffState(null, TODAY)).toBe("");
  });
});

describe("what Edit sailing sends", () => {
  const details = { containerCount: 1, cutoffDate: null, departureDate: null };
  it("sends only the facts that changed, trimmed, with the three details always", () => {
    expect(sailingEditOf(FILLED, { ...FILLED, ...details })).toEqual(details);
    expect(sailingEditOf({ ...FILLED, vessel: "WEEK 51", voyage: "" }, { ...FILLED, vessel: " MSC Anna ", ...details, cutoffDate: "2026-12-03" })).toEqual({
      containerCount: 1,
      cutoffDate: "2026-12-03",
      departureDate: null,
      vessel: "MSC Anna",
      voyage: "445W",
    });
  });
});

describe("the next sailing, pre-filled (Council Outlay 14, A4)", () => {
  const last = { vessel: "WEEK 51", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC", containerCount: 2, cutoffDate: "2026-12-10", departureDate: "2026-12-17", createdAt: "2026-11-20T08:00:00Z" };

  it("knows the ISO week of a day", () => {
    expect(isoWeek("2026-12-17")).toBe(51);
    expect(isoWeek("2026-12-31")).toBe(53);
    expect(isoWeek("2027-01-07")).toBe(1);
    expect(isoWeek("2027-01-03")).toBe(53);
  });

  it("has nothing to start from on a service with no sailing", () => {
    expect(nextSailingStart([], "weekly", "2026-11-24")).toBeNull();
  });

  it("takes the last sailing's ports and box, and moves the week and the dates on by a week", () => {
    expect(nextSailingStart([{ ...last, vessel: "WEEK 50", departureDate: "2026-12-10", cutoffDate: "2026-12-03" }, last], "weekly", "2026-11-24")).toEqual({
      from: "WEEK 51",
      values: { vessel: "WEEK 52", voyage: "", pol: last.pol, pod: last.pod, hub: last.hub, containerType: "40' HC", containerCount: 2, cutoffDate: "2026-12-17", departureDate: "2026-12-24" },
    });
  });

  it("moves on by two weeks on a bi-weekly service, into the next year's weeks", () => {
    expect(nextSailingStart([{ ...last, vessel: "WEEK 53", cutoffDate: null, departureDate: "2026-12-31" }], "bi_weekly", "2026-11-24")?.values).toMatchObject({ vessel: "WEEK 2", cutoffDate: null, departureDate: "2027-01-14" });
  });

  it("counts the week on without dates, back to 1 after the year's last week", () => {
    const undated = { ...last, cutoffDate: null, departureDate: null };
    // 2026 has 53 weeks, 2027 has 52.
    expect(nextSailingStart([{ ...undated, vessel: "WEEK 52" }], "weekly", "2026-11-24")?.values).toMatchObject({ vessel: "WEEK 53", cutoffDate: null, departureDate: null });
    expect(nextSailingStart([{ ...undated, vessel: "WEEK 53" }], "weekly", "2026-11-24")?.values).toMatchObject({ vessel: "WEEK 1" });
    expect(nextSailingStart([{ ...undated, vessel: "WEEK 52" }], "weekly", "2027-11-24")?.values).toMatchObject({ vessel: "WEEK 1" });
  });

  it("starts from a sailing with no date yet when it was made after the last dated one, not from an old one", () => {
    const week52 = { ...last, vessel: "WEEK 52", cutoffDate: null, departureDate: null, createdAt: "2026-11-23T08:00:00Z" };
    expect(nextSailingStart([last, week52], "weekly", "2026-11-24")?.from).toBe("WEEK 52");
    expect(nextSailingStart([last, { ...week52, vessel: "WEEK 30", createdAt: "2026-07-01T08:00:00Z" }], "weekly", "2026-11-24")?.from).toBe("WEEK 51");
  });

  it("carries no vessel's name over, and no week or dates on a service that sails as needed", () => {
    expect(nextSailingStart([{ ...last, vessel: "MSC Anna" }], "weekly", "2026-11-24")?.values).toMatchObject({ vessel: "", voyage: "", departureDate: "2026-12-24" });
    expect(nextSailingStart([last], "ad_hoc", "2026-11-24")?.values).toMatchObject({ vessel: "", cutoffDate: null, departureDate: null, pol: last.pol, containerCount: 2 });
  });
});

describe("the sailing cargo is rolled to (Council Outlay 14, A9)", () => {
  const TODAY = "2026-11-24";
  const s = (id: string, departureDate: string | null, createdAt = "2026-11-01T08:00:00Z") => ({ id, departureDate, createdAt });
  const all = [s("w48", "2026-11-26"), s("w49", "2026-12-03"), s("w50", "2026-12-10"), s("w47", "2026-11-19"), s("later", null)];

  it("is the first one to leave after this one", () => {
    expect(nextSailingAfter(all[1]!, all, TODAY)?.id).toBe("w50");
    expect(nextSailingAfter(all[2]!, all, TODAY)?.id).toBe("later");
  });

  it("is the soonest one still to come for a sailing that has left", () => {
    expect(nextSailingAfter(all[3]!, all, TODAY)?.id).toBe("w48");
  });

  it("is, for a sailing with no date, one made after it - never an earlier week", () => {
    const week52 = s("w52", null, "2026-11-23T08:00:00Z");
    const week53 = s("w53", null, "2026-11-24T08:00:00Z");
    expect(nextSailingAfter(week52, [week52, week53], TODAY)?.id).toBe("w53");
    expect(nextSailingAfter(week53, [week52, week53], TODAY)).toBeNull();
  });

  it("is none when nothing else is to come", () => {
    expect(nextSailingAfter(all[0]!, [all[0]!, all[3]!], TODAY)).toBeNull();
  });
});

describe("a sailing's stage (Council Outlay 14, C3)", () => {
  const TODAY = "2026-11-24";
  it("reads a sailing with no stage as open, and knows the stages that have left", () => {
    expect(stageOf({})).toBe("open");
    expect(stageOf({ stage: "nonsense" })).toBe("open");
    expect(SAILING_STAGES.filter((stage) => stageHasLeft({ stage }))).toEqual(["departed", "arrived", "devanned"]);
    expect(SAILING_STAGES.filter((stage) => linkNeedsReason({ stage }))).toEqual(["closed", "departed", "arrived", "devanned"]);
  });

  it("counts a sailing as left by its stage or by its date", () => {
    expect(sailingDeparted({ departureDate: null, stage: "departed" }, TODAY)).toBe(true);
    expect(sailingDeparted({ departureDate: "2026-12-01", stage: "arrived" }, TODAY)).toBe(true);
    expect(sailingDeparted({ departureDate: "2026-12-01", stage: "closed" }, TODAY)).toBe(false);
    expect(sailingDeparted({ departureDate: "2026-11-20", stage: "open" }, TODAY)).toBe(true);
    // Left by hand with no date: among the departed, first.
    const order = sailingsInOrder(
      [
        { id: "a", departureDate: "2026-11-10", createdAt: "1", stage: "departed" },
        { id: "b", departureDate: null, createdAt: "2", stage: "departed" },
        { id: "c", departureDate: null, createdAt: "3", stage: "closed" },
      ],
      TODAY,
    );
    expect(order.coming.map((s) => s.id)).toEqual(["c"]);
    expect(order.departed.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("says when the date has passed and the stage was not moved on", () => {
    expect(stageBehind({ departureDate: "2026-11-20", stage: "open" }, TODAY)).toBe(true);
    expect(stageBehind({ departureDate: "2026-11-20", stage: "departed" }, TODAY)).toBe(false);
    expect(stageBehind({ departureDate: "2026-11-24", stage: "closed" }, TODAY)).toBe(false);
    expect(sailingAttention({ cutoffDate: null, departureDate: "2026-11-20", stage: "closed" }, TODAY)).toEqual([{ key: "stage", tone: "amber", text: "Departure date passed, still closed for cargo" }]);
    expect(sailingAttention({ cutoffDate: null, departureDate: "2026-11-20", stage: "departed" }, TODAY)).toEqual([]);
  });

  it("knows a shipment status from before departure", () => {
    expect(statusBeforeDeparture("Booking Confirmation Pending [EXP]")).toBe(true);
    expect(statusBeforeDeparture("All Done - Waiting To Be Shipped [IMP]")).toBe(true);
    expect(statusBeforeDeparture("Pre-Alert Sent [EXP]")).toBe(false);
    expect(statusBeforeDeparture(null)).toBe(false);
  });
});
