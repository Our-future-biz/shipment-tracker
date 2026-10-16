import { describe, expect, it } from "vitest";
import { periodBasisLabel, provisionalText } from "./jobPeriod";

describe("job period basis", () => {
  it("names sea / air dates by their codes and road jobs by delivery", () => {
    expect(periodBasisLabel("ata")).toBe("ATA");
    expect(periodBasisLabel("etd")).toBe("ETD");
    expect(periodBasisLabel("delivery")).toBe("Delivered");
    expect(periodBasisLabel("planned delivery")).toBe("Planned delivery");
  });

  it("says why a provisional period may move", () => {
    expect(provisionalText("planned delivery")).toMatch(/planned delivery date/);
    expect(provisionalText("eta")).toMatch(/ETA \/ ETD/);
  });
});
