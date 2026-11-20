import { describe, expect, it } from "vitest";
import { lineGivesField, lockedByLines } from "./cargoFromLines";

// User council O2 / E7, locked per field (owner's answer to the step-1 review): a cargo field is
// read-only once the job's lines give it a value, as the server works it out (projectCargo).
describe("the cargo fields worked out from the job's lines", () => {
  const none = { containers: [], cargoItems: [], cargoDimensions: [] };
  const container = (c: { packages?: string; packageType?: string } = {}) => ({ packages: "", packageType: "", ...c });
  const item = (i: { pieces?: string; packageType?: string; hsCode?: string; cargoDescription?: string } = {}) => ({
    pieces: "",
    packageType: "",
    hsCode: "",
    cargoDescription: "",
    ...i,
  });
  const dimension = (pieces = "") => ({ pieces });
  const locked = (s: Parameters<typeof lockedByLines>[0]) =>
    ["pcs", "typeOfPackages", "hsCode", "cargoDescription"].filter((key) => lockedByLines(s, key));

  it("stay editable on a job with no lines, the lists empty or not served", () => {
    expect(locked(none)).toEqual([]);
    expect(locked({ containers: null, cargoItems: null, cargoDimensions: null })).toEqual([]);
    expect(locked({})).toEqual([]);
  });

  it("lock only Colli for a dimension line with pieces: it gives no package type, HS code or description", () => {
    expect(locked({ ...none, cargoDimensions: [{ pieces: "3", packageType: "Pallet(s)" } as never] })).toEqual(["pcs"]);
  });

  it("lock nothing for a dimension line of 0 pieces, or none typed: 0 pieces shows as empty", () => {
    expect(locked({ ...none, cargoDimensions: [dimension("0"), dimension("")] })).toEqual([]);
    expect(lineGivesField({ ...none, cargoDimensions: [dimension("n/a")] }, "pcs")).toBe(false);
  });

  it("take Colli from the containers, else the cargo lines, else the dimension lines", () => {
    expect(lineGivesField({ ...none, containers: [container({ packages: "10" })] }, "pcs")).toBe(true);
    expect(lineGivesField({ ...none, containers: [container()], cargoItems: [item({ pieces: "4" })] }, "pcs")).toBe(true);
    expect(lineGivesField({ ...none, containers: [container()], cargoItems: [item()], cargoDimensions: [dimension("2")] }, "pcs")).toBe(true);
    expect(lineGivesField({ ...none, containers: [container({ packages: "0" })], cargoItems: [item({ pieces: "0" })] }, "pcs")).toBe(false);
  });

  it("lock Type of packages for a package type on a container or a cargo line", () => {
    expect(locked({ ...none, containers: [container({ packageType: "Cartons" })] })).toEqual(["typeOfPackages"]);
    expect(locked({ ...none, cargoItems: [item({ packageType: "Drums" })] })).toEqual(["typeOfPackages"]);
    expect(lineGivesField({ ...none, containers: [container({ packageType: "  " })] }, "typeOfPackages")).toBe(false);
  });

  it("lock HS code and Cargo description only for one on a cargo line", () => {
    expect(locked({ ...none, cargoItems: [item({ hsCode: "84834021" })] })).toEqual(["hsCode"]);
    expect(locked({ ...none, cargoItems: [item({ cargoDescription: "Gears" })] })).toEqual(["cargoDescription"]);
    expect(locked({ ...none, cargoItems: [item({ hsCode: " ", cargoDescription: " " })] })).toEqual([]);
    // A second cargo line that gives them is enough.
    expect(locked({ ...none, cargoItems: [item(), item({ hsCode: "8483", cargoDescription: "Gears" })] })).toEqual(["hsCode", "cargoDescription"]);
  });

  it("lock an empty container line for nothing", () => {
    expect(locked({ ...none, containers: [container()] })).toEqual([]);
  });

  it("lock all four for a cargo line that gives each", () => {
    const full = item({ pieces: "5", packageType: "Boxes", hsCode: "8483", cargoDescription: "Gears" });
    expect(locked({ ...none, cargoItems: [full] })).toEqual(["pcs", "typeOfPackages", "hsCode", "cargoDescription"]);
  });

  it("lock no other field of the card", () => {
    const lines = { ...none, cargoItems: [item({ pieces: "5", packageType: "Boxes", hsCode: "8483", cargoDescription: "Gears" })] };
    for (const key of ["cargoOrigin", "commercialInvoice", "commercialInvoiceValue", "creditCheck"]) expect(lockedByLines(lines, key)).toBe(false);
  });
});
