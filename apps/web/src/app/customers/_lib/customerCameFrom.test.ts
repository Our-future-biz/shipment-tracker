import { describe, expect, it } from "vitest";
import { cameFromLabel, nextCameFrom as next, openMasterJobOf } from "@/lib/cameFrom";

// The way back from a record's page (lib/cameFrom), as a customer's and a shipment's page use it.
const nextCameFrom = (stored: Parameters<typeof next>[1], previous: string | null, current: string) => next("customers", stored, previous, current);

const ALZA = "/customers/alza-id/";
const noted = { id: "alza-id", href: "/shipments/ship-id/?tab=costs" };

describe("where a customer's page was opened from", () => {
  it("notes the page left, with its tab, when a customer's page opens", () => {
    expect(nextCameFrom(null, "/shipments/ship-id/?tab=costs", ALZA)).toEqual(noted);
  });

  it("replaces an earlier note when the customer is opened from somewhere else", () => {
    expect(nextCameFrom(noted, "/invoicing/", ALZA)).toEqual({ id: "alza-id", href: "/invoicing/" });
  });

  it("keeps the note while moving between the customer's own tabs", () => {
    expect(nextCameFrom(noted, ALZA, `${ALZA}?tab=contacts`)).toBe(noted);
  });

  it("keeps the note on a reload, when no earlier page is known", () => {
    expect(nextCameFrom(noted, null, ALZA)).toBe(noted);
  });

  it("has nothing to offer when opened from the Customer Database list or another customer", () => {
    expect(nextCameFrom(noted, "/customers/?q=alza", ALZA)).toBeNull();
    expect(nextCameFrom(noted, "/customers/other-id/", ALZA)).toBeNull();
  });

  it("leaves the note alone on pages that are not a customer's", () => {
    expect(nextCameFrom(noted, ALZA, "/shipments/")).toBe(noted);
    expect(nextCameFrom(noted, "/shipments/", "/customers/")).toBe(noted);
  });
});

describe("what the way back is called", () => {
  const superadmin = { role: "superadmin" };

  it("is the quote's number on a quote", () => {
    expect(cameFromLabel("/sales/quote/QCZ00000012/?from=followup", superadmin)).toBe("QCZ00000012");
  });

  it("is the menu's name for the page anywhere else", () => {
    expect(cameFromLabel("/shipments/?status=open", superadmin)).toBe("Shipments");
    expect(cameFromLabel("/sales/pipeline/", superadmin)).toBe("Pipeline");
    expect(cameFromLabel("/trucking/hauliers/some-id/", superadmin)).toBe("Trucking Concept");
    expect(cameFromLabel("/warehouse-concept/managers/", superadmin)).toBe("Managers");
  });

  it("is the name in the user's own menu", () => {
    expect(cameFromLabel("/warehouse-concept/managers/?tab=approvals", { role: "admin" })).toBe("Warehouse Managers");
  });

  it("falls back to a plain name for a page outside the menu", () => {
    expect(cameFromLabel("/somewhere/else/", superadmin)).toBe("Previous page");
  });
});

describe("where a shipment's page was opened from", () => {
  const SHIPMENT = "/shipments/ship-id/";
  const fromMasterJob = "/master-jobs/?open=mj-id&tab=shipments";

  it("notes the master job, on its Linked Shipments tab, when a shipment is opened from it", () => {
    expect(next("shipments", null, fromMasterJob, SHIPMENT)).toEqual({ id: "ship-id", href: fromMasterJob });
  });

  it("keeps it while moving between the shipment's own tabs, and drops it when opened from the Shipments list", () => {
    const noted = { id: "ship-id", href: fromMasterJob };
    expect(next("shipments", noted, SHIPMENT, `${SHIPMENT}?tab=cargo`)).toBe(noted);
    expect(next("shipments", noted, "/shipments/?q=CZ", SHIPMENT)).toBeNull();
  });

  it("knows which master job the page had open", () => {
    expect(openMasterJobOf(fromMasterJob)).toBe("mj-id");
    expect(openMasterJobOf("/master-jobs/")).toBeNull();
    expect(openMasterJobOf("/shipments/?open=mj-id")).toBeNull();
  });
});
