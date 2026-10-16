import { describe, expect, it } from "vitest";
import { GLOSSARY, TERMS } from "./glossary";
import { TRUCKING_TABS, tabSearch } from "./tabs";

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

describe("Phase 5 terms", () => {
  it("explain legs, the hub, the partner network, the manifest and the fill", () => {
    const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning;
    expect(meaning(TERMS.leg)).toMatch(/pick-up .* line haul .* delivery/);
    expect(meaning(TERMS.hub)).toMatch(/Gate Log/);
    expect(meaning(TERMS.partnerNetwork)).toMatch(/per consignment/);
    expect(GLOSSARY.find((g) => g.term === TERMS.manifest)?.replaces).toMatch(/nakládací list/);
    expect(meaning(TERMS.fill)).toMatch(/fuller of the two sets the colour/);
  });
});

describe("Phase 6 terms", () => {
  it("explain avizace, exceptions, haulier invoices and internal billing", () => {
    const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning;
    expect(meaning(TERMS.avizaceRecord)).toMatch(/never the Pick-up PIN/);
    expect(meaning(TERMS.avizaceRecord)).toMatch(/never a block/);
    expect(meaning(TERMS.exceptionDecision)).toMatch(/manager's call/);
    expect(meaning(TERMS.exactMatch)).toMatch(/to the cent/);
    expect(meaning(TERMS.vatBankAccountCheck)).toMatch(/cannot override/);
    expect(meaning(TERMS.internalStatement)).toMatch(/ICZ/);
    expect(meaning(TERMS.monthClose)).toMatch(/never changes/);
  });
});

describe("Phase 7 terms", () => {
  it("explain the report measures", () => {
    const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning;
    expect(meaning(TERMS.onTime)).toMatch(/on or before its promised date/);
    expect(meaning(TERMS.firstAttempt)).toMatch(/no failed-delivery exception/);
    expect(meaning(TERMS.daysToPod)).toMatch(/Working days/);
    expect(meaning(TERMS.fill)).toMatch(/line-haul fill/);
    expect(meaning(TERMS.coverageGap)).toMatch(/no tariff could price/);
    expect(meaning(TERMS.departmentResult)).toMatch(/minus all haulier cost/);
  });
});

describe("trucking tabs", () => {
  it("follow the work, each with its purpose for the Read me", () => {
    expect(TRUCKING_TABS.map((t) => t.label)).toEqual(["Consignments", "Planning", "Trips", "Haulier invoices", "Internal billing", "Hauliers", "Tariffs", "Rate calculator", "Reports"]);
    expect(TRUCKING_TABS.every((t) => t.purpose.length > 0)).toBe(true);
  });

  it("carry no phase scaffolding: every tab is live", () => {
    for (const t of TRUCKING_TABS) expect(Object.keys(t).sort()).toEqual(["key", "label", "purpose"]);
  });

  it("drop a tab's own filters, the planning day and the job filter included, when another tab opens", () => {
    expect(tabSearch("tab=planning&date=2026-10-23&kind=LINEHAUL", "trips")).toBe("tab=trips");
    expect(tabSearch("job=abc&view=attention&status=BOOKED", "planning")).toBe("tab=planning");
    expect(tabSearch("tab=trips&view=draft", "consignments")).toBe("");
  });
});

describe("glossary gaps", () => {
  it("explain every word the screens use without an entry before", () => {
    const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning;
    expect(meaning(TERMS.partnerDelivery)).toMatch(/per consignment/);
    expect(meaning(TERMS.gateIn)).toMatch(/Only the warehouse stamps it/);
    expect(meaning(TERMS.readyToBill)).toMatch(/Billing/);
    expect(meaning(TERMS.exception)).toMatch(/who bears it/);
    expect(meaning(TERMS.scope)).toMatch(/LTL .* FTL .* line haul/);
    expect(meaning(TERMS.domesticOrder)).toMatch(/creates its Road job/);
    expect(meaning(TERMS.planTrip)).toMatch(/FTL/);
    expect(meaning(TERMS.newTrip)).toMatch(/Planning tab/);
    expect(meaning(TERMS.liabilityInsurance)).toMatch(/industry term/);
  });

  it("call the internal side another department, and the pick-up stamp Picked up", () => {
    expect(GLOSSARY.map((g) => g.meaning).join(" ")).not.toMatch(/Operations|stamp Loaded/);
  });
});

describe("haulier portal terms", () => {
  it("explain the portal, its users and the one-time link", () => {
    const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning;
    expect(meaning(TERMS.haulierPortal)).toMatch(/only the trips and partner deliveries given to their haulier/);
    expect(meaning(TERMS.portalUser)).toMatch(/Not an app user/);
    expect(meaning(TERMS.invitationLink)).toMatch(/shown once and never again, works once and is valid 72 hours/);
  });
});
