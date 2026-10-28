import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { chosenPortsAndDirections, portsAndDirectionsOf } from "../lib/tariffPorts";

describe("chosenPortsAndDirections", () => {
  it("keeps each port and direction once, in the list's order", () => {
    expect(chosenPortsAndDirections(["SIKOP", "BEANR", "SIKOP"], ["export", "import", "export"])).toEqual({ ports: ["BEANR", "SIKOP"], directions: ["import", "export"] });
  });

  it.each([
    ["no port", [], ["import"], "at least one port"],
    ["no direction", ["DEHAM"], undefined, "import, export or both"],
    ["a port not in the list", ["DEHAM", "ITTRS"], ["import"], "ITTRS"],
    ["a direction that is neither", ["DEHAM"], ["both"], "both"],
  ])("refuses %s", (_, ports, directions, message) => {
    expect(() => chosenPortsAndDirections(ports, directions)).toThrow(expect.objectContaining({ code: "invalid_argument", message: expect.stringContaining(message) }));
  });
});

describe("portsAndDirectionsOf", () => {
  it("joins several tariffs' ports and directions, each once, in the list's order", () => {
    const tariffs = [
      { ports: ["DEWVN", "DEHAM"], directions: ["export"] },
      { ports: ["SIKOP", "DEHAM"], directions: ["export"] },
    ];
    expect(portsAndDirectionsOf(tariffs)).toEqual({ ports: ["DEHAM", "DEWVN", "SIKOP"], directions: ["export"] });
  });

  it("is empty for an operator without tariffs", () => {
    expect(portsAndDirectionsOf([])).toEqual({ ports: [], directions: [] });
  });
});
