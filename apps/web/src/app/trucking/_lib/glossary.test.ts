import { describe, expect, it } from "vitest";
import { GLOSSARY, TERMS } from "./glossary";
import { TRUCKING_TABS } from "./tabs";

describe("trucking glossary", () => {
  it("explains every term once", () => {
    const terms = GLOSSARY.map((g) => g.term);
    expect(new Set(terms).size).toBe(terms.length);
    expect([...terms].sort()).toEqual(Object.values(TERMS).sort());
  });

  it("lists the Czech words each term replaces", () => {
    const replaces = (term: string) => GLOSSARY.find((g) => g.term === term)?.replaces;
    expect(replaces(TERMS.consignment)).toBe("zásilka");
    expect(replaces(TERMS.pickupRun)).toBe("svoz");
    expect(replaces(TERMS.deliveryRun)).toBe("rozvoz");
    expect(replaces(TERMS.zone)).toBe("pásmo");
    expect(replaces(TERMS.pod)).toMatch(/doručenka/);
    expect(replaces(TERMS.tailLift)).toBe("hydraulické čelo");
    expect(replaces(TERMS.marginApproval)).toMatch(/schválení marže/);
  });

  it("explains overrides and the margin floor approval of quotes", () => {
    const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning;
    expect(meaning(TERMS.override)).toMatch(/changed by hand/);
    expect(meaning(TERMS.marginApproval)).toMatch(/below the margin floor/);
    expect(meaning(TERMS.marginApproval)).toMatch(/a worse margin needs a new approval/);
  });

  it("states the pick-up PIN rule, recorded-only sending and the haulier link", () => {
    const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning;
    expect(meaning(TERMS.pickupPin)).toMatch(/printed and never stored or logged/);
    expect(meaning(TERMS.recordedOnly)).toMatch(/nothing is e-mailed/);
    expect(meaning(TERMS.haulierLink)).toMatch(/without signing in/i);
  });

  it("states the service levels and where their clock starts", () => {
    const meaning = GLOSSARY.find((g) => g.term === TERMS.serviceLevel)?.meaning;
    expect(meaning).toMatch(/\+1 … \+4/);
    expect(meaning).toMatch(/LTL the gate-in confirmed by the warehouse/);
    expect(meaning).toMatch(/FTL the planned pick-up/);
    expect(meaning).toMatch(/same day, by 10:00, by 12:00 or on a fixed date/);
  });
});

describe("trucking tabs", () => {
  it("follow the work and name the phase that brings each", () => {
    expect(TRUCKING_TABS.map((t) => `${t.label}:${t.phase}`)).toEqual([
      "Consignments:4",
      "Planning:5",
      "Trips:4",
      "Hauliers:1",
      "Tariffs:2",
      "Rate calculator:2",
      "Reports:7",
    ]);
  });

  it("mark the built ones live", () => {
    expect(TRUCKING_TABS.filter((t) => "live" in t && t.live).map((t) => t.key)).toEqual(["consignments", "trips", "hauliers", "tariffs", "calculator"]);
  });
});
