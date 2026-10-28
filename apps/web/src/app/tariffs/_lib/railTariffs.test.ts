import { describe, expect, it } from "vitest";
import { directionsText, portsAndDirectionsProblem, portsText, tariffForText } from "./railTariffs";

describe("what a tariff is for", () => {
  it("names the ports, and shows a code it does not know as it is", () => {
    expect(portsText(["DEHAM", "DEBRV", "DEWVN"])).toBe("Hamburg, Bremerhaven, Wilhelmshaven");
    expect(portsText(["SIKOP", "PLGDN"])).toBe("Koper, PLGDN");
  });

  it("says import, export or both, whatever the order", () => {
    expect(directionsText(["import"])).toBe("Import");
    expect(directionsText(["export"])).toBe("Export");
    expect(directionsText(["export", "import"])).toBe("Import & export");
    expect(directionsText([])).toBe("");
  });

  it("joins both for a tariff picker", () => {
    expect(tariffForText({ ports: ["BEANR", "NLRTM"], directions: ["import", "export"] })).toBe("Antwerp, Rotterdam · Import & export");
    expect(tariffForText({ ports: [], directions: [] })).toBe("");
  });

  it("needs at least one port and one direction", () => {
    expect(portsAndDirectionsProblem({ ports: [], directions: ["import"] })).toBe("Choose at least one port");
    expect(portsAndDirectionsProblem({ ports: ["DEHAM"], directions: [] })).toBe("Choose import, export or both");
    expect(portsAndDirectionsProblem({ ports: ["DEHAM"], directions: ["export"] })).toBeNull();
  });
});
