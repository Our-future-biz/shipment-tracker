import { describe, expect, it } from "vitest";
import { jobNumberDigits, jobNumberFor, jobNumberLetters } from "../lib/jobNumber";

describe("jobNumberLetters", () => {
  it("names the job by its Freight Mode and Load Type", () => {
    expect(jobNumberLetters("Air Freight", "")).toBe("AIR");
    expect(jobNumberLetters("Air Freight", "Full Load")).toBe("AIR");
    expect(jobNumberLetters("Sea Freight", "Full Load")).toBe("FCL");
    expect(jobNumberLetters("Sea Freight", "Consolidation")).toBe("LCL");
    expect(jobNumberLetters("Sea Break Bulk", "Full Load")).toBe("BB");
    expect(jobNumberLetters("Rail Freight", "Consolidation")).toBe("RAIL");
    expect(jobNumberLetters("Road Freight", "Full Load")).toBe("ROAD");
  });

  it("makes a Project Shipment CZPROJECT by any freight mode", () => {
    for (const mode of ["Air Freight", "Sea Freight", "Sea Break Bulk", "Rail Freight", "Road Freight", ""]) {
      expect(jobNumberLetters(mode, "Project Shipment")).toBe("PROJECT");
    }
  });

  it("gives no letters while they can't be told", () => {
    expect(jobNumberLetters("Sea Freight", "")).toBe("");
    expect(jobNumberLetters("", "Full Load")).toBe("");
    expect(jobNumberLetters(null, null)).toBe("");
  });
});

describe("jobNumberFor", () => {
  it("puts the letters in and keeps the number", () => {
    expect(jobNumberFor("CZ00000023", "Sea Freight", "Full Load")).toBe("CZFCL00000023");
    expect(jobNumberFor("CZFCL00000023", "Sea Freight", "Consolidation")).toBe("CZLCL00000023");
    expect(jobNumberFor("CZLCL00000023", "Air Freight", "Consolidation")).toBe("CZAIR00000023");
    expect(jobNumberFor("CZAIR00000023", "Air Freight", "Project Shipment")).toBe("CZPROJECT00000023");
    expect(jobNumberFor("CZPROJECT00000023", "Sea Break Bulk", "")).toBe("CZBB00000023");
    expect(jobNumberFor("CZBB00000023", "Rail Freight", "")).toBe("CZRAIL00000023");
    expect(jobNumberFor("CZRAIL00000023", "Road Freight", "")).toBe("CZROAD00000023");
  });

  it("drops the letters again while they can't be told", () => {
    expect(jobNumberFor("CZFCL00000023", "Sea Freight", "")).toBe("CZ00000023");
  });

  it("leaves text that is no CZ reference as it is", () => {
    expect(jobNumberFor("CZQ123", "Air Freight", "")).toBe("CZQ123");
    expect(jobNumberFor("MCZ00000004", "Air Freight", "")).toBe("MCZ00000004");
  });
});

describe("jobNumberDigits", () => {
  it("reads the number with or without letters", () => {
    expect(jobNumberDigits("CZ00000023")).toBe("00000023");
    expect(jobNumberDigits("CZPROJECT00000023")).toBe("00000023");
    expect(jobNumberDigits("CZXYZ00000023")).toBeNull();
    expect(jobNumberDigits("")).toBeNull();
  });
});
