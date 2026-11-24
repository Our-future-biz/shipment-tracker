import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { boxOverNotice } from "../lib/coLoadingBoxOverNotice";
import { boxIsOver, overStep, overWords, sinceLinked, sinceLinkedWords } from "../lib/coLoadingCargoChange";

describe("cargo changed since linked (Council Outlay 14, C4)", () => {
  it("says what a shipment's cargo changed by since it was linked", () => {
    expect(sinceLinked({ weightKg: 4750, volumeCbm: 6.4 }, { weightKg: 4400, volumeCbm: 4 })).toEqual({ weightKg: 350, volumeCbm: 2.4 });
    expect(sinceLinked({ weightKg: 4000, volumeCbm: 4 }, { weightKg: 4400, volumeCbm: 4 })).toEqual({ weightKg: -400, volumeCbm: 0 });
    // Rounding is no change; a link from before this was remembered says nothing.
    expect(sinceLinked({ weightKg: 4400.4, volumeCbm: 4.004 }, { weightKg: 4400, volumeCbm: 4 })).toBeNull();
    expect(sinceLinked({ weightKg: 4750, volumeCbm: 6.4 }, { weightKg: null, volumeCbm: null })).toBeNull();
  });

  it("puts the change in words", () => {
    expect(sinceLinkedWords({ weightKg: 350, volumeCbm: 2.4 })).toBe("+2.4 cbm, +350 kg since linked");
    expect(sinceLinkedWords({ weightKg: -400, volumeCbm: 0 })).toBe("−400 kg since linked");
    expect(sinceLinkedWords(null)).toBe("");
  });

  const meter = (used: number, limit: number, state: string) => ({ used, limit, state });
  const over = { volume: meter(66.2, 64.9, "over"), weight: meter(20000, 26200, "room") };

  it("knows a box that is over, and by what", () => {
    expect(boxIsOver(over)).toBe(true);
    expect(boxIsOver({ volume: meter(60, 64.9, "nearly_full"), weight: null })).toBe(false);
    expect(boxIsOver({ volume: null, weight: meter(29000, 26200, "beyond") })).toBe(true);
    expect(overWords(over)).toBe("volume 66.2 of 64.9 cbm");
    expect(overWords({ volume: over.volume, weight: meter(27100, 26200, "over") })).toBe("volume 66.2 of 64.9 cbm, weight 27,100 of 26,200 kg");
  });

  it("tells about an over box once, and again only after it was back within its limits", () => {
    expect(overStep(true, false)).toBe("tell");
    expect(overStep(true, true)).toBe("keep");
    expect(overStep(false, true)).toBe("clear");
    expect(overStep(false, false)).toBe("keep");
  });

  it("writes the chat line, tagging the Person in Charge, the Holiday Cover and the sailing's maker, never the one who changed it", () => {
    const users = [
      { id: "u-pic", email: "pic@x.cz", displayName: "Jana Nová" },
      { id: "u-cover", email: "cover@x.cz", displayName: "" },
      { id: "u-maker", email: "maker@x.cz", displayName: "Petr Malý" },
    ];
    const shipment = { jobNumber: "CZLCL1", personInCharge: "PIC@x.cz", holidayCover: "cover@x.cz — Cover" };
    const cargo = { now: { weightKg: 4750, volumeCbm: 6.4 }, change: { weightKg: 350, volumeCbm: 2.4 } };
    const notice = boxOverNotice(shipment, { name: "WEEK 51", createdById: "u-maker" }, users, over, cargo, "u-other");
    expect(notice.tagged.map((u) => u.id)).toEqual(["u-pic", "u-cover", "u-maker"]);
    expect(notice.message).toBe(
      "Co-Loading sailing WEEK 51 is now over its limit: volume 66.2 of 64.9 cbm.\nCZLCL1 counts 4,750 kg · 6.4 cbm in the box (+2.4 cbm, +350 kg since linked).\n@Jana Nová @cover@x.cz @Petr Malý",
    );
    // The Person in Charge changed it and also made the sailing: only the cover is told.
    const own = boxOverNotice(shipment, { name: "WEEK 51", createdById: "u-pic" }, users, over, { ...cargo, change: null }, "u-pic");
    expect(own.tagged.map((u) => u.id)).toEqual(["u-cover"]);
    expect(own.message).toContain("counts 4,750 kg · 6.4 cbm in the box.");
  });
});
