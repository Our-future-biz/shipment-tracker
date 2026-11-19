import { describe, expect, it } from "vitest";
import { houseLoadTypeProblem, linkKindProblem, loadTypeKindProblem, masterJobKind } from "../../lib/masterJobKind";

const consol = { mczNumber: "MCZCONSOL00000003", loadType: "Consolidation" };
const full = { mczNumber: "MCZFULL00000006", loadType: "Full Load" };
const plain = { mczNumber: "MCZ00000008", loadType: null };
const lcl = { jobNumber: "CZLCL00000089", loadType: "Consolidation" };
const fcl = { jobNumber: "CZFCL00000019", loadType: "Full Load" };
const airConsol = { jobNumber: "CZAIR00000018", loadType: "Consolidation" };
const blank = { jobNumber: "CZ00000011", loadType: null };

describe("masterJobKind", () => {
  it("is the master job's own Load Type, else the first filled one of its shipments, else nothing", () => {
    expect(masterJobKind(consol, [fcl])).toEqual({ loadType: "Consolidation", from: "MCZCONSOL00000003" });
    expect(masterJobKind(plain, [blank, fcl])).toEqual({ loadType: "Full Load", from: "CZFCL00000019" });
    expect(masterJobKind(plain, [blank])).toBeNull();
  });
});

describe("linkKindProblem", () => {
  it("lets a CZLCL job on a CZCONSOL master and a CZFCL job on a CZFULL one", () => {
    expect(linkKindProblem(consol, [], [lcl])).toBeNull();
    expect(linkKindProblem(full, [], [fcl])).toBeNull();
  });

  it("refuses a CZFCL job on a CZCONSOL master, and the other way round, naming both", () => {
    expect(linkKindProblem(consol, [], [fcl])).toBe(
      "CZFCL00000019 is Full Load and can't go on MCZCONSOL00000003: MCZCONSOL00000003 is a Consolidation master job - a shipment goes only on a master job of its own Load Type",
    );
    expect(linkKindProblem(full, [], [lcl])).toMatch(/^CZLCL00000089 is Consolidation and can't go on MCZFULL00000006/);
  });

  it("goes by the Load Type, not the letters: an air Consolidation fits a CZCONSOL master", () => {
    expect(linkKindProblem(consol, [], [airConsol])).toBeNull();
    expect(linkKindProblem(full, [], [airConsol])).not.toBeNull();
  });

  it("lets a shipment without a Load Type on any master job, as it takes the master job's", () => {
    expect(linkKindProblem(consol, [], [blank])).toBeNull();
    expect(linkKindProblem(full, [], [blank])).toBeNull();
  });

  it("keeps a plain master job to the filling of the shipments on it, and of those linked with it", () => {
    expect(linkKindProblem(plain, [lcl], [fcl])).toBe(
      "CZFCL00000019 is Full Load and can't go on MCZ00000008: MCZ00000008 holds Consolidation shipments (CZLCL00000089) - a shipment goes only on a master job of its own Load Type",
    );
    expect(linkKindProblem(plain, [], [lcl, fcl])).not.toBeNull();
    expect(linkKindProblem(plain, [], [lcl, airConsol, blank])).toBeNull();
  });

  it("lets a plain master job that already holds two fillings (from before the rule) take no more of either, saying so", () => {
    expect(linkKindProblem(plain, [lcl, fcl], [airConsol])).toBe(
      "CZAIR00000018 can't go on MCZ00000008: it already holds shipments of different Load Types (Consolidation, Full Load) - take off those that don't belong first",
    );
    expect(linkKindProblem(plain, [lcl, fcl], [blank])).toBeNull();
    expect(masterJobKind(plain, [lcl, fcl])).toBeNull();
  });

  it("names an air Full Load a Single Shipment, as the screen does", () => {
    const airFull = { mczNumber: "MCZFULL00000007", loadType: "Full Load", freightMode: "Air Freight" };
    expect(linkKindProblem(airFull, [], [airConsol])).toBe(
      "CZAIR00000018 is Consolidation and can't go on MCZFULL00000007: MCZFULL00000007 is a Single Shipment master job - a shipment goes only on a master job of its own Load Type",
    );
    const airSingle = { jobNumber: "CZAIR00000019", loadType: "Full Load", freightMode: "Air Freight" };
    expect(linkKindProblem({ ...consol, freightMode: "Air Freight" }, [], [airSingle])).toMatch(/^CZAIR00000019 is Single Shipment and can't go on/);
    // A sea Full Load stays a Full Load.
    expect(linkKindProblem({ ...consol, freightMode: "Sea Freight" }, [], [{ ...fcl, freightMode: "Sea Freight" }])).toMatch(/^CZFCL00000019 is Full Load/);
  });

  it("compares Load Types without regard to case or spaces", () => {
    expect(linkKindProblem({ ...consol, loadType: " consolidation" }, [], [lcl])).toBeNull();
  });
});

describe("loadTypeKindProblem", () => {
  it("refuses a Load Type a shipment on the master job does not have, listing them", () => {
    expect(loadTypeKindProblem("MCZ00000008", "Consolidation", [lcl, fcl, blank])).toBe(
      "MCZ00000008 can't become Consolidation: CZFCL00000019 on it is Full Load - take it off the master job first.",
    );
    const fcl2 = { jobNumber: "CZFCL00000020", loadType: "Full Load" };
    expect(loadTypeKindProblem("MCZ00000008", "Consolidation", [fcl, fcl2])).toBe(
      "MCZ00000008 can't become Consolidation: CZFCL00000019, CZFCL00000020 on it are Full Load - take them off the master job first.",
    );
    const project = { jobNumber: "CZ00000021", loadType: "Project Shipment" };
    expect(loadTypeKindProblem("MCZ00000008", "Consolidation", [fcl, project])).toBe(
      "MCZ00000008 can't become Consolidation: on it, CZFCL00000019 is Full Load and CZ00000021 is Project Shipment - take them off the master job first.",
    );
  });

  it("names an air Full Load a Single Shipment, as the screen does", () => {
    expect(loadTypeKindProblem("MCZ00000008", "Consolidation", [{ ...fcl, freightMode: "Air Freight" }], "Air Freight")).toBe(
      "MCZ00000008 can't become Consolidation: CZFCL00000019 on it is Single Shipment - take it off the master job first.",
    );
    expect(loadTypeKindProblem("MCZ00000008", "Full Load", [lcl], "Air Freight")).toMatch(/^MCZ00000008 can't become Single Shipment:/);
  });

  it("allows one all its filled shipments share, and a blank one", () => {
    expect(loadTypeKindProblem("MCZ00000008", "Consolidation", [lcl, airConsol, blank])).toBeNull();
    expect(loadTypeKindProblem("MCZ00000008", null, [lcl, fcl])).toBeNull();
  });
});

describe("houseLoadTypeProblem", () => {
  it("keeps a shipment on a master job to the master job's Load Type", () => {
    expect(houseLoadTypeProblem({ ...lcl, loadType: "Full Load" }, consol, [])).toBe(
      "CZLCL00000089 is on MCZCONSOL00000003, a Consolidation master job, so its Load Type stays Consolidation - take it off the master job first",
    );
    expect(houseLoadTypeProblem(lcl, consol, [])).toBeNull();
    expect(houseLoadTypeProblem({ ...lcl, loadType: null }, consol, [])).toBeNull();
  });

  it("on a plain master job, to the filling of the others", () => {
    expect(houseLoadTypeProblem({ ...lcl, loadType: "Full Load" }, plain, [airConsol])).toMatch(/which holds Consolidation shipments \(CZAIR00000018\)/);
    expect(houseLoadTypeProblem({ ...lcl, loadType: "Full Load" }, plain, [blank])).toBeNull();
  });

  it("names an air Full Load master job's filling a Single Shipment", () => {
    const airFull = { mczNumber: "MCZFULL00000007", loadType: "Full Load", freightMode: "Air Freight" };
    expect(houseLoadTypeProblem({ ...airConsol }, airFull, [])).toBe(
      "CZAIR00000018 is on MCZFULL00000007, a Single Shipment master job, so its Load Type stays Single Shipment - take it off the master job first",
    );
  });
});
