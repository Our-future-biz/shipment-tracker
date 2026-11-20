import { describe, expect, it } from "vitest";
import { pickerStored, pickerValue } from "./pickerDate";

describe("record form dates (user council W20)", () => {
  it("reads a stored day or day and time, and gives it back as the server stores it", () => {
    expect(pickerStored(pickerValue("2026-11-20"), "date")).toBe("2026-11-20");
    expect(pickerStored(pickerValue("2026-11-20T09:30"), "datetime")).toBe("2026-11-20T09:30");
  });

  it("shows nothing for an empty or unreadable value, and stores a cleared one as empty", () => {
    expect(pickerValue("")).toBeNull();
    expect(pickerValue(null)).toBeNull();
    expect(pickerValue("not a date")).toBeNull();
    expect(pickerStored(null, "date")).toBe("");
  });
});
