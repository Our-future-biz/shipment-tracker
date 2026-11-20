import { describe, expect, it } from "vitest";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { DEFAULT_SHIPMENT_COLUMNS, withCreatedOn } from "./useColumnPrefs";

describe("DEFAULT_SHIPMENT_COLUMNS", () => {
  it("shows the ports, Closing, ETD, ETA and Shipment Status to a user with no saved set (O15)", () => {
    expect(DEFAULT_SHIPMENT_COLUMNS).toEqual(expect.arrayContaining(["pol", "pod", "closingDate", "estimatedDeparture", "estimatedArrival", "status"]));
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
