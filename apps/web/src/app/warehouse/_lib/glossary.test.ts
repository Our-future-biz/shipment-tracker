import { describe, expect, it } from "vitest";
import { DIRECTIONS, directionOf, directionOfHandling, directionOfVisit, GLOSSARY, handlingOfDirection, releaseGatesText, TERMS } from "./glossary";

describe("direction mapping", () => {
  it("maps visits", () => {
    expect(directionOfVisit("příjem")).toBe("Inbound");
    expect(directionOfVisit("výdej")).toBe("Outbound");
    expect(directionOfVisit("")).toBe("");
  });
  it("maps handling both ways and leaves other values alone", () => {
    expect(directionOfHandling("Import")).toBe("Outbound");
    expect(directionOfHandling("Export")).toBe("Inbound");
    expect(directionOfHandling("Transit")).toBe("Transit");
    expect(handlingOfDirection("Outbound")).toBe("Import");
    expect(handlingOfDirection("Inbound")).toBe("Export");
    expect(handlingOfDirection("Transit")).toBe("Transit");
  });
});

describe("releaseGatesText", () => {
  it("reads clear / blocked / released for outbound, n/a for inbound", () => {
    expect(releaseGatesText({ visit: "příjem", armed: true, impRelease: null })).toBe("n/a — inbound");
    expect(releaseGatesText({ visit: "výdej", armed: true, impRelease: null })).toBe("Clear");
    expect(releaseGatesText({ visit: "výdej", armed: false, impRelease: null })).toBe("Blocked");
    expect(releaseGatesText({ visit: "výdej", armed: false, impRelease: "2026-10-14T08:00:00Z" })).toBe("Released");
  });
});

describe("glossary", () => {
  it("explains the pick-up PIN", () => {
    expect(TERMS.pickupPin).toBe("Pick-up PIN");
    const entry = GLOSSARY.find((g) => g.term === TERMS.pickupPin);
    expect(entry?.meaning).toMatch(/Six digits/);
    expect(entry?.meaning).toMatch(/Pick-up PIN verified/);
  });

  it("explains the new references, archiving and voiding", () => {
    expect(GLOSSARY.find((g) => g.term === TERMS.warehouseRef)?.meaning).toMatch(/WCZ2026000001/);
    expect(GLOSSARY.find((g) => g.term === TERMS.archived)?.meaning).toMatch(/only by a manager/);
    expect(GLOSSARY.find((g) => g.term === TERMS.voidStamp)?.meaning).toMatch(/not changed back/);
  });

  it("explains floor mode, the offline queue and dock slots", () => {
    expect(TERMS.floorMode).toBe("Floor mode");
    expect(GLOSSARY.find((g) => g.term === TERMS.floorMode)?.meaning).toMatch(/phone camera/);
    const waiting = GLOSSARY.find((g) => g.term === TERMS.waitingToSend)?.meaning;
    expect(waiting).toMatch(/PIN check and the WH release need a connection/);
    expect(waiting).toMatch(/12 hours/);
    expect(GLOSSARY.find((g) => g.term === TERMS.dockSlot)?.meaning).toMatch(/cannot be booked twice/);
  });
});

describe("containers, the tally, stuffing and the re-weigh", () => {
  const meaning = (term: string) => GLOSSARY.find((g) => g.term === term)?.meaning ?? "";
  it("explains the re-weigh as the warehouse means VGM", () => {
    expect(TERMS.reweigh).toBe("Re-weigh (VGM)");
    expect(meaning(TERMS.reweigh)).toMatch(/every LCL shipment/);
    expect(meaning(TERMS.reweigh)).toMatch(/more than 5 % off/);
    expect(meaning(TERMS.reweigh)).toMatch(/latest counts/);
  });
  it("explains the tick-off as the receipt and the stuffed container's gate-out as the release", () => {
    expect(meaning(TERMS.tickOff)).toMatch(/free time starts/);
    expect(meaning(TERMS.tickOff)).toMatch(/WCZ reference/);
    expect(meaning(`${TERMS.containerGateIn} / ${TERMS.containerGateOut}`)).toMatch(/storage clock stops/);
    expect(meaning(`${TERMS.stuffed} / ${TERMS.closeContainer}`)).toMatch(/seal number/);
    expect(meaning(TERMS.stuffingPlan)).toMatch(/capacity/);
    expect(meaning(TERMS.lifecycle)).toMatch(/Expected → Arrived/);
  });
  it("says where the storage clock starts and stops with containers", () => {
    const free = meaning("Free time / storage");
    expect(free).toMatch(/tick-off at the stripping tally/);
    expect(free).toMatch(/gate-out of the export container/);
  });
});

describe("glossary — stock, KPIs and supplier e-mail", () => {
  it("explains the customs deadline, the bonded register and manual lines", () => {
    expect(GLOSSARY.find((g) => g.term === TERMS.customsDeadline)?.meaning).toMatch(/90 days/);
    expect(GLOSSARY.find((g) => g.term === TERMS.customsDeadline)?.meaning).toMatch(/UCC art\. 149/);
    expect(GLOSSARY.find((g) => g.term === TERMS.customsWarehouse)?.meaning).toMatch(/no 90-day limit/);
    expect(GLOSSARY.find((g) => g.term === TERMS.bondedRegister)?.meaning).toMatch(/discharged/);
    expect(GLOSSARY.find((g) => g.term === TERMS.manualLine)?.meaning).toMatch(/picker/);
  });

  it("states where each KPI starts and stops", () => {
    expect(GLOSSARY.find((g) => g.term === TERMS.dwellTime)?.meaning).toMatch(/WH release/);
    expect(GLOSSARY.find((g) => g.term === TERMS.gateToReceipt)?.meaning).toMatch(/tally tick/);
    expect(GLOSSARY.find((g) => g.term === TERMS.reweighVarianceRate)?.meaning).toMatch(/5 %/);
  });

  it("explains Warehouse settings and recorded-only sends", () => {
    expect(GLOSSARY.find((g) => g.term === TERMS.warehouseSettings)?.meaning).toMatch(/only a manager/);
    expect(GLOSSARY.find((g) => g.term === TERMS.supplierEmail)?.meaning).toMatch(/Retry/);
    expect(GLOSSARY.find((g) => g.term === TERMS.recordedOnly)?.meaning).toMatch(/nothing is e-mailed/);
  });
});

describe("Domestic positions", () => {
  it("show as Domestic and map back to the stored handling", () => {
    expect(directionOf({ visit: "příjem", handling: "Domestic" })).toBe("Domestic");
    expect(directionOf({ visit: "příjem", handling: "Export" })).toBe("Inbound");
    expect(directionOf({ visit: "výdej", handling: "Import" })).toBe("Outbound");
    expect(directionOfHandling("Domestic")).toBe("Domestic");
    expect(handlingOfDirection("Domestic")).toBe("Domestic");
    expect(DIRECTIONS).toContain("Domestic");
  });

  it("count their release gates (they leave through the WH release); other inbound cargo stays n/a", () => {
    expect(releaseGatesText({ visit: "příjem", handling: "Domestic", armed: true, impRelease: null })).toBe("Clear");
    expect(releaseGatesText({ visit: "příjem", handling: "Domestic", armed: true, impRelease: "2026-10-15T08:00:00Z" })).toBe("Released");
    expect(releaseGatesText({ visit: "příjem", handling: "Export", armed: true, impRelease: null })).toBe("n/a — inbound");
  });
});
