import { describe, expect, it } from "vitest";
import { appUrl, LOCAL_APP_URL, resolveAppUrl } from "../appUrl";

describe("APP_URL", () => {
  it("falls back to localhost only in local development and tests", () => {
    expect(resolveAppUrl(undefined, { type: "development", cloud: "local" })).toBe(LOCAL_APP_URL);
    expect(resolveAppUrl("", { type: "test", cloud: "encore" })).toBe(LOCAL_APP_URL);
    expect(resolveAppUrl(undefined, null)).toBe(LOCAL_APP_URL);
    expect(appUrl()).toBe(process.env.APP_URL?.replace(/\/+$/, "") || LOCAL_APP_URL);
  });

  it("is required (and https) everywhere else: the service refuses to start", () => {
    expect(() => resolveAppUrl(undefined, { type: "production", cloud: "encore" })).toThrow("APP_URL is not set");
    expect(() => resolveAppUrl("  ", { type: "development", cloud: "gcp" })).toThrow("APP_URL is not set");
    expect(() => resolveAppUrl("http://app.example.com", { type: "production", cloud: "aws" })).toThrow("https://");
    expect(() => resolveAppUrl("not a url", { type: "production", cloud: "aws" })).toThrow("is not a URL");
    expect(resolveAppUrl("https://shipment-tracker-web.vercel.app/", { type: "production", cloud: "encore" })).toBe("https://shipment-tracker-web.vercel.app");
  });
});
