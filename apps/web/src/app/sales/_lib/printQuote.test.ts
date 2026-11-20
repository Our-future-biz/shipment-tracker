import { describe, expect, it } from "vitest";
import { asCompanyDetails, quoteSender } from "./companyDetails";
import { quoteDocument, routeEnds, sellingLineLabel } from "./printQuote";

// Only what decides whether the quotation waits for the users: nothing else is looked at here.
const exchange: Parameters<typeof quoteDocument>[2] = { rates: { CZK: 1 }, isError: false, isLoading: false, roePct: 100, fixingDate: "" };
const company = { status: "ready" as const, details: asCompanyDetails({}) };
const LOADING = "The company's users are still loading. Try again in a moment.";
const noWhere = { where: {}, isLoading: false };
const usersIn = { users: [], isLoading: false };

describe("quoteDocument", () => {
  it("waits for the company's users when the owner is recorded by e-mail: the customer reads a name, never the e-mail", () => {
    expect(quoteDocument("Q1", { salesOwner: "lukas@ourfuture.biz" }, exchange, company, { users: [], isLoading: true }, noWhere)).toEqual({ html: null, blocked: LOADING });
  });

  it("does not wait for them for an old typed name, or once they are in", () => {
    expect(quoteDocument("Q1", { salesOwner: "Austromar" }, exchange, company, { users: [], isLoading: true }, noWhere).blocked).not.toBe(LOADING);
    expect(quoteDocument("Q1", { salesOwner: "lukas@ourfuture.biz" }, exchange, company, usersIn, noWhere).blocked).not.toBe(LOADING);
  });

  it("says where the Origin and Destination are, as the Routing does", () => {
    const where = { "Hamburg (USHG7)": "New York, US", "Lincoln Park, Chicago (USLPD)": "Illinois, US" };
    const { html } = quoteDocument("Q1", { origin: "Hamburg (USHG7)", destination: "Lincoln Park, Chicago (USLPD)" }, exchange, company, usersIn, { where, isLoading: false });
    expect(html).toContain(`Hamburg (USHG7)<span class="where">New York, US</span><span class="arrow">`);
    expect(html).toContain(`Lincoln Park, Chicago (USLPD)<span class="where">Illinois, US</span></div>`);
  });

  it("still names a place it can't say more about", () => {
    const { html } = quoteDocument("Q1", { origin: "Somewhere old", destination: "" }, exchange, company, usersIn, noWhere);
    expect(html).toContain(`<div class="route">Somewhere old<span class="arrow">→</span>—</div>`);
  });

  it("reads an Origin or Destination left blank as the port of loading or discharge in the headline", () => {
    const { html } = quoteDocument("Q1", { origin: "Brno (CZBRQ)", destination: "", pol: "Hamburg (DEHAM)", pod: "Shanghai (CNSGH)" }, exchange, company, usersIn, noWhere);
    expect(html).toContain(`<div class="route">Brno (CZBRQ)<span class="arrow">→</span>Shanghai (CNSGH)</div>`);
    expect(routeEnds({ origin: " ", pol: "Hamburg (DEHAM)", destination: "Ostrava (CZOSR)" })).toEqual(["Hamburg (DEHAM)", "Ostrava (CZOSR)"]);
    expect(routeEnds({})).toEqual(["", ""]);
  });

  it("waits for the route's places", () => {
    expect(quoteDocument("Q1", { origin: "Hamburg (USHG7)" }, exchange, company, usersIn, { where: {}, isLoading: true }).blocked).toMatch(/route's places/);
  });

  it("names the route's places but not the pickup and delivery addresses", () => {
    const { html } = quoteDocument(
      "Q1",
      { origin: "Hamburg (USHG7)", destination: "Lincoln Park, Chicago (USLPD)", pol: "Bremerhaven (DEBRV)", pod: "Chicago (USCHI)", pickup: "Alza, V jame, Praha", delivery: "Dock 9, Chicago" },
      exchange,
      company,
      usersIn,
      noWhere,
    );
    for (const place of ["Hamburg (USHG7)", "Lincoln Park, Chicago (USLPD)", "Bremerhaven (DEBRV)", "Chicago (USCHI)"]) expect(html).toContain(place);
    for (const gone of ["Pickup Address", "Delivery Address", "Alza, V jame", "Dock 9"]) expect(html).not.toContain(gone);
  });

  it("prints its days as every screen does, DD.MM.YYYY (User Council S24)", () => {
    const { html } = quoteDocument("Q1", { quoteStatus: "quoted", sentAt: "2026-11-20T10:00:00Z", validUntil: "2026-12-04", readyDate: "2026-11-25" }, exchange, company, usersIn, noWhere);
    expect(html).toContain("Issued 20.11.2026");
    expect(html).toContain("Valid until 04.12.2026");
    expect(html).toContain("25.11.2026");
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("names the price of one container beside the all-in sum of several (User Council S13)", () => {
    const line = { type: "ocean_freight", chargeCode: "ocean_freight", description: "Ocean freight", currency: "EUR", basis: "container" as const, containerType: "40' HC", qty: 2, value: 2, unitPrice: 1670, amount: 3340 };
    const { html } = quoteDocument(
      "Q1",
      { serviceType: "Sea FCL", currency: "EUR", allIn: true, containers: [{ qty: 2, type: "40' HC" }], fclPricing: { blocks: {} }, sellingLines: [line] },
      { ...exchange, rates: { CZK: 1, EUR: 25 } },
      company,
      usersIn,
      noWhere,
    );
    expect(html).toContain("40&#39; HC · 2 containers");
    expect(html).toContain("All-in rate (1,670.00 EUR per container × 2)");
  });
});

describe("who a quote is from", () => {
  const issuer = { companyName: "CTO Global Logistics s.r.o.", street: "Jankovcova 1522/53", city: "Praha", postalCode: "170 00", country: "Czech Republic", ico: "123", dic: "CZ123", email: "", phone: "", web: "" };
  const stored = (details = {}) => ({ status: "ready" as const, details: asCompanyDetails(details) });

  it("is the company's invoicing details while Sales Settings has none (User Council S24)", () => {
    expect(quoteSender(stored(), { profile: issuer, isLoading: false })).toEqual({
      status: "ready",
      details: asCompanyDetails({ name: "CTO Global Logistics s.r.o.", address: "Jankovcova 1522/53\n170 00 Praha\nCzech Republic", companyId: "123", vatId: "CZ123" }),
    });
  });

  it("is what Sales Settings has where it has any", () => {
    expect(quoteSender(stored({ name: "Sales name" }), { profile: issuer, isLoading: false }).details.name).toBe("Sales name");
  });

  it("is not known while the invoicing details load, and is none with neither", () => {
    expect(quoteSender(stored(), { profile: undefined, isLoading: true }).status).toBe("loading");
    expect(quoteSender(stored(), { profile: undefined, isLoading: false })).toEqual(stored());
    expect(quoteSender({ status: "error", details: asCompanyDetails({}) }, { profile: issuer, isLoading: false }).status).toBe("error");
  });
});

describe("a selling line on the customer document", () => {
  const kg = { type: "Air freight", description: "Air freight PRG → ORD", currency: "EUR", amount: 1344, basis: "kg" as const, qty: 640, unit: "chargeable kg", unitPrice: 2.1 };

  it("names the rate per chargeable kg and the weight on a kg line in the quote's currency (R6)", () => {
    expect(sellingLineLabel(kg, "EUR")).toBe("Air freight PRG → ORD (2.10 EUR per chargeable kg × 640 kg)");
    expect(sellingLineLabel({ ...kg, qty: 640.5, amount: 1345.05 }, "EUR")).toBe("Air freight PRG → ORD (2.10 EUR per chargeable kg × 640.5 kg)");
  });

  it("keeps the text alone in another currency, as a lump sum, or with no rate yet", () => {
    expect(sellingLineLabel(kg, "CZK")).toBe("Air freight PRG → ORD");
    expect(sellingLineLabel({ ...kg, basis: "lumpsum" }, "EUR")).toBe("Air freight PRG → ORD");
    expect(sellingLineLabel({ ...kg, unitPrice: 0 }, "EUR")).toBe("Air freight PRG → ORD");
    expect(sellingLineLabel({ ...kg, description: "" }, "EUR")).toBe("Air freight (2.10 EUR per chargeable kg × 640 kg)");
  });
});
