import { describe, expect, it } from "vitest";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { DEFAULT_SHIPMENT_COLUMNS, withCreatedOn } from "./useColumnPrefs";

describe("DEFAULT_SHIPMENT_COLUMNS", () => {
  it("shows the ports, Closing, ETD, ETA and Shipment Status to a user with no saved set (O15)", () => {
    expect(DEFAULT_SHIPMENT_COLUMNS).toEqual(expect.arrayContaining(["pol", "pod", "closingDate", "estimatedDeparture", "estimatedArrival", "status"]));
  });

  it("puts the morning check right after Customer, Shipment Status first, on the first screen at 1440 px (mock council S9-1 and its review)", () => {
    expect(DEFAULT_SHIPMENT_COLUMNS.slice(0, 8)).toEqual(["jobNumber", "customer", "status", "pol", "pod", "closingDate", "estimatedDeparture", "estimatedArrival"]);
    // At a 1440 px window the 260 px menu and px-8 each side leave the grid 1116 px, less the card's 1 px
    // border each side; the row tick box takes 44 on the left, and the Documents, Chat and warning icon
    // columns pinned on the right (ShipmentsTable: 30 + 24 + 28) take 82, so a column ending under them is
    // cut (mock test S21-058). The table holds these widths (fixed layout), so all eight - ETD and ETA too -
    // end on the first screen (retest of S21-058).
    const pinnedRight = 30 + 24 + 28;
    const screen = 1440 - 260 - 2 * 32 - 2 - pinnedRight;
    const ends = new Map<string, number>();
    let left = 44;
    for (const key of DEFAULT_SHIPMENT_COLUMNS.slice(0, 8)) {
      left += COLUMN_MAP.get(key)!.width;
      ends.set(key, left);
    }
    for (const key of DEFAULT_SHIPMENT_COLUMNS.slice(0, 8)) expect(ends.get(key)).toBeLessThanOrEqual(screen);
  });

  it("no longer shows Shipments Month, Year and Department at first", () => {
    for (const key of ["shipmentsDate", "shipmentsYear", "department"]) expect(DEFAULT_SHIPMENT_COLUMNS).not.toContain(key);
    for (const key of ["personInCharge", "holidayCover", "customerPic", "masterJob"]) expect(DEFAULT_SHIPMENT_COLUMNS).toContain(key);
  });

  it("names only columns that exist, each once", () => {
    for (const key of DEFAULT_SHIPMENT_COLUMNS) expect(COLUMN_MAP.has(key)).toBe(true);
    expect(new Set(DEFAULT_SHIPMENT_COLUMNS).size).toBe(DEFAULT_SHIPMENT_COLUMNS.length);
  });
});

describe("withCreatedOn", () => {
  it("puts Created on right after Created by", () => {
    expect(withCreatedOn(["jobNumber", "createdBy", "platform"])).toEqual(["jobNumber", "createdBy", "createdOn", "platform"]);
  });

  it("leaves a list without Created by, or with Created on already, as it is", () => {
    const without = ["jobNumber"];
    expect(withCreatedOn(without)).toBe(without);
    const already = ["createdOn", "createdBy"];
    expect(withCreatedOn(already)).toBe(already);
  });
});
