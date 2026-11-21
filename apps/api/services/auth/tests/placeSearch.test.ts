import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; the repositories are stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const locations = vi.hoisted(() => ({ search: vi.fn(), findByCodes: vi.fn() }));
vi.mock("../repositories/orgUnit.repository", () => ({
  departmentRepository: {},
  branchRepository: {},
  countryRepository: {},
  locationRepository: locations,
}));
vi.mock("../repositories/user.repository", () => ({ userRepository: {} }));
vi.mock("../repositories/locationPick.repository", () => ({ locationPickRepository: {} }));

import { orgUnitService } from "../services/orgUnit.service";
import { CARRIER_PORT_CODES, CARRIER_PORT_NAMES, carrierCodeWhere, carrierPortsNamed, seaPortText } from "../../../lib/geo/carrierPorts";

const JAN = { companyId: "86f202b1-7449-441b-9c5b-5bf4d89f8d88", userId: "11111111-1111-4111-8111-111111111111" };

describe("orgUnitService.searchPlaces", () => {
  beforeEach(() => {
    locations.search.mockReset();
    locations.search.mockResolvedValue([]);
  });

  it("asks for the seaports first by sea (the POL / POD of a sea quote or job: user council O1 / S10, Q3)", async () => {
    await orgUnitService.searchPlaces("Hamburg", undefined, JAN, "sea");
    expect(locations.search).toHaveBeenCalledWith("Hamburg", null, 30, JAN, true);
  });

  it("keeps the plain order for every other picker", async () => {
    await orgUnitService.searchPlaces("Hamburg", "de", JAN);
    expect(locations.search).toHaveBeenCalledWith("Hamburg", "DE", 30, JAN, false);
  });

  it("asks nothing for less than 2 letters, by sea too", async () => {
    expect(await orgUnitService.searchPlaces("H", undefined, JAN, "sea")).toEqual([]);
    expect(locations.search).not.toHaveBeenCalled();
  });
});

// Mock council S4-2, system-21 review: document reading looks codes up whatever the mode.
describe("orgUnitService.placesByCodes", () => {
  beforeEach(() => {
    locations.findByCodes.mockReset();
    locations.findByCodes.mockResolvedValue([]);
  });

  it("names a carrier code as its port only when asked by sea", async () => {
    await orgUnitService.placesByCodes([" cnsha ", "CNSHA", "PVG"]);
    expect(locations.findByCodes).toHaveBeenLastCalledWith(["CNSHA"], false);
    await orgUnitService.placesByCodes(["CNSHA"], true);
    expect(locations.findByCodes).toHaveBeenLastCalledWith(["CNSHA"], true);
  });
});

describe("migration 0024: which places are seaports", () => {
  const sql = readFileSync(new URL("../db/migrations/0024_location_seaports.sql", import.meta.url), "utf8");
  const [, portList = ""] = sql.split(/"code" IN \(/);
  const ports = new Set(portList.slice(0, portList.indexOf(")")).match(/[A-Z]{2}[A-Z0-9]{3}/g));

  it("marks the ports, and the carrier codes the release gives an airport", () => {
    for (const code of ["DEHAM", "CNSGH", "NLRTM", "SGSIN", "CNSHA", "CNNGB", "CNTAO", "CNXMN", "CNSZX"]) expect(ports.has(code), code).toBe(true);
  });

  it("leaves towns, railway stations and airports out", () => {
    // Hamburg, Oregon (the POD of QCZFCL20261024001) and Hamburg, New York; Shanghai Railway Station; Shanghai Pudong airport.
    for (const code of ["USZH8", "USHG7", "CNSHZ", "CNPVG", "CZPRG"]) expect(ports.has(code), code).toBe(false);
  });

  it("marks every carrier code the pickers name as a port", () => {
    for (const code of Object.keys(CARRIER_PORT_NAMES)) expect(ports.has(code), code).toBe(true);
  });

  it("marks the port's own code of every carrier code a seaport too", () => {
    for (const code of Object.values(CARRIER_PORT_CODES)) expect(ports.has(code), code).toBe(true);
  });

  it("is safe to run again, and leaves the release's names as they are", () => {
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "is_seaport"`);
    expect(sql).not.toMatch(/SET "name/);
  });
});

describe("carrier port codes", () => {
  it("are named as the ports the trade means by them", () => {
    expect(CARRIER_PORT_NAMES).toMatchObject({ CNSHA: "Shanghai", CNNGB: "Ningbo", CNTAO: "Qingdao", CNXMN: "Xiamen", CNSZX: "Shenzhen" });
  });

  it("are found by their port's name, also where the release's airport name differs", () => {
    expect(carrierPortsNamed("Shanghai")).toEqual(["CNSHA"]);
    expect(carrierPortsNamed("shant")).toEqual(["CNSWA"]);
    expect(carrierPortsNamed("Hamburg")).toEqual([]);
    expect(carrierPortsNamed(" ")).toEqual([]);
  });

  it("each have their port's own code, the one the tariffs match the port's name to (review of step 3, M2)", () => {
    expect(Object.keys(CARRIER_PORT_CODES).sort()).toEqual(Object.keys(CARRIER_PORT_NAMES).sort());
    expect(CARRIER_PORT_CODES).toMatchObject({ CNSHA: "CNSGH", CNNGB: "CNNBO", CNTAO: "CNQIN", CNXMN: "CNXAM", CNDLC: "CNDAL" });
    // Every pair is in one country, and no code is the twin of two.
    for (const [carrier, port] of Object.entries(CARRIER_PORT_CODES)) expect(port.slice(0, 2), carrier).toBe(carrier.slice(0, 2));
    expect(new Set(Object.values(CARRIER_PORT_CODES)).size).toBe(Object.keys(CARRIER_PORT_CODES).length);
  });

  it("say beside them which row is the carrier code", () => {
    expect(carrierCodeWhere("CNSHA")).toBe("carrier code for Shanghai port CNSGH");
    expect(carrierCodeWhere("CNSGH")).toBeNull();
    expect(carrierCodeWhere("DEHAM")).toBeNull();
  });

  it("show an old sea job's carrier code by its port's name, and leave air, road and other places as stored (mock council S4-1)", () => {
    expect(seaPortText("Shanghai Hongqiao International Apt (CNSHA)", "Sea FCL")).toBe("Shanghai (CNSHA)");
    expect(seaPortText("Ningbo Lishe International Apt (CNNGB)", "Sea Freight")).toBe("Ningbo (CNNGB)");
    expect(seaPortText("Shanghai (CNSHA)", "Sea LCL")).toBe("Shanghai (CNSHA)");
    expect(seaPortText("Shanghai Hongqiao International Apt (CNSHA)", "Air Freight")).toBe("Shanghai Hongqiao International Apt (CNSHA)");
    expect(seaPortText("Shanghai Hongqiao International Apt (CNSHA)", "")).toBe("Shanghai Hongqiao International Apt (CNSHA)");
    expect(seaPortText("Hamburg (DEHAM)", "Sea FCL")).toBe("Hamburg (DEHAM)");
    expect(seaPortText("Shanghai", "Sea FCL")).toBe("Shanghai");
    expect(seaPortText(null, "Sea FCL")).toBe("");
  });
});
