import { describe, expect, it } from "vitest";
import { asCompanyDetails } from "./companyDetails";
import { quoteDocument } from "./printQuote";

// Only what decides whether the quotation waits for the users: nothing else is looked at here.
const exchange: Parameters<typeof quoteDocument>[2] = { rates: { CZK: 1 }, isError: false, isLoading: false, roePct: 100, fixingDate: "" };
const company = { status: "ready" as const, details: asCompanyDetails({}) };
const LOADING = "The company's users are still loading. Try again in a moment.";

describe("quoteDocument", () => {
  it("waits for the company's users when the owner is recorded by e-mail: the customer reads a name, never the e-mail", () => {
    expect(quoteDocument("Q1", { salesOwner: "lukas@ourfuture.biz" }, exchange, company, { users: [], isLoading: true })).toEqual({ html: null, blocked: LOADING });
  });

  it("does not wait for them for an old typed name, or once they are in", () => {
    expect(quoteDocument("Q1", { salesOwner: "Austromar" }, exchange, company, { users: [], isLoading: true }).blocked).not.toBe(LOADING);
    expect(quoteDocument("Q1", { salesOwner: "lukas@ourfuture.biz" }, exchange, company, { users: [], isLoading: false }).blocked).not.toBe(LOADING);
  });
});
