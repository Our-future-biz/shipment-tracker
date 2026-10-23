import { describe, expect, it } from "vitest";
import { CONTAINER_TYPES } from "./cargo";
import { containerTypeFrom } from "@/app/documents/_lib/extraction";

describe("CONTAINER_TYPES", () => {
  it("offers the agreed equipment: no 20' HC, 20' HR or 40' RF; the 40' high-cube reefer is HRF", () => {
    expect(CONTAINER_TYPES).toEqual([
      "20' GP", "20' RF", "20' OT", "20' HOT", "20' FR",
      "40' GP", "40' HC", "40' HRF", "40' OT", "40' HOT", "40' FR", "40' HFR",
      "45' HQ",
    ]);
  });
});

describe("containerTypeFrom", () => {
  it("reads a 40' reefer as the high-cube reefer and a 20' one as RF", () => {
    expect(containerTypeFrom("40", "REEFER")).toBe("40' HRF");
    expect(containerTypeFrom("40", "RH")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "HR")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "REEFER")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "DRY")).toBe("40' HC");
    expect(containerTypeFrom("20", "RF")).toBe("20' RF");
  });

  it("leaves out equipment that isn't offered", () => {
    expect(containerTypeFrom("20HC", "DRY")).toBe("");
  });
});
