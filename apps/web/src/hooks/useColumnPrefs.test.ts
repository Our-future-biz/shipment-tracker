import { describe, expect, it } from "vitest";
import { withCreatedOn } from "./useColumnPrefs";

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
