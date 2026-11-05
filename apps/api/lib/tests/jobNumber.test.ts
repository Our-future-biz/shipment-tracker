import { describe, expect, it } from "vitest";
import { JOB_NUMBER_PATTERN, compareJobNumbers, jobNumberDigits, namesReferenceNumber, referenceSearchDigits } from "../jobNumber";

describe("jobNumberDigits", () => {
  it("reads the number with or without letters", () => {
    expect(jobNumberDigits("CZ00000023")).toBe("00000023");
    expect(jobNumberDigits("CZPROJECT00000023")).toBe("00000023");
    expect(jobNumberDigits(" CZFCL00000023 ")).toBe("00000023");
  });

  it("gives none for other text: unknown letters, a quote's CZQ…, an MCZ, nothing", () => {
    expect(jobNumberDigits("CZXYZ00000023")).toBeNull();
    expect(jobNumberDigits("CZQ00000023")).toBeNull();
    expect(jobNumberDigits("MCZ00000004")).toBeNull();
    expect(jobNumberDigits("CZFCL")).toBeNull();
    expect(jobNumberDigits("")).toBeNull();
  });

  it("is one pattern for Postgres too: its only capture group is the digits", () => {
    expect(new RegExp(JOB_NUMBER_PATTERN).exec("CZBB00000023")?.slice(1)).toEqual(["00000023"]);
  });
});

describe("compareJobNumbers", () => {
  it("orders references by their number, whatever their letters", () => {
    const refs = ["CZROAD00000025", "CZAIR00000024", "CZFCL00000023", "CZ00000026", "CZPROJECT00000002", "CZ00000103"];
    expect([...refs].sort(compareJobNumbers)).toEqual(["CZPROJECT00000002", "CZFCL00000023", "CZAIR00000024", "CZROAD00000025", "CZ00000026", "CZ00000103"]);
  });

  it("puts text that is no reference after the references", () => {
    expect(["CZQ1", "", "CZ00000001"].sort(compareJobNumbers)).toEqual(["CZ00000001", "", "CZQ1"]);
  });
});

describe("referenceSearchDigits", () => {
  it("reads a search word written as a reference, in any case and with any letters", () => {
    expect(referenceSearchDigits("CZ00000023")).toBe("00000023");
    expect(referenceSearchDigits("cz00000023")).toBe("00000023");
    expect(referenceSearchDigits("czfcl00000023")).toBe("00000023");
    expect(referenceSearchDigits("CZPROJECT0000002")).toBe("0000002");
  });

  it("gives none for any other word", () => {
    for (const word of ["00000023", "CZ", "CZFCL", "czq00000023", "QCZ20261010001", "Shanghai", "CZ 00000023"]) {
      expect(referenceSearchDigits(word)).toBeNull();
    }
  });
});

describe("namesReferenceNumber", () => {
  it("finds a reference by the number, whatever the letters of either", () => {
    expect(namesReferenceNumber("CZFCL00000023", "CZ00000023")).toBe(true);
    expect(namesReferenceNumber("CZ00000023", "CZROAD00000023")).toBe(true);
    expect(namesReferenceNumber("CZLCL00000023", "czfcl00000023")).toBe(true);
    expect(namesReferenceNumber("CZLCL00000023", " CZ00000023 ")).toBe(true);
  });

  it("finds the numbers digits still being typed start", () => {
    expect(namesReferenceNumber("CZAIR00000023", "CZ0000002")).toBe(true);
    expect(namesReferenceNumber("CZAIR00000031", "CZ0000002")).toBe(false);
  });

  it("finds nothing by another number, by a search that is no reference, or for a stored text that is none", () => {
    expect(namesReferenceNumber("CZFCL00000023", "CZ00000024")).toBe(false);
    expect(namesReferenceNumber("CZFCL00000023", "00000023")).toBe(false);
    expect(namesReferenceNumber("CZFCL00000023", "CZQ00000023")).toBe(false);
    expect(namesReferenceNumber("IMPORT-1", "CZ1")).toBe(false);
    expect(namesReferenceNumber("", "CZ00000023")).toBe(false);
  });
});
