import { describe, expect, it } from "vitest";
import { asCompanyDetails } from "./companyDetails";
import { quoteDocument } from "./printQuote";

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
});
