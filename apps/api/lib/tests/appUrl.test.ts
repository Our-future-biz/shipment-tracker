import { describe, expect, it } from "vitest";
import { appUrl, appUrlProblem, CLOUD_APP_URL, LOCAL_APP_URL, resolveAppUrl } from "../appUrl";

describe("APP_URL", () => {
  it("falls back to localhost only in local development and tests", () => {
    expect(resolveAppUrl(undefined, { type: "development", cloud: "local" })).toBe(LOCAL_APP_URL);
    expect(resolveAppUrl("", { type: "test", cloud: "encore" })).toBe(LOCAL_APP_URL);
    expect(resolveAppUrl(undefined, null)).toBe(LOCAL_APP_URL);
    expect(appUrl()).toBe(process.env.APP_URL?.replace(/\/+$/, "") || LOCAL_APP_URL);
  });

  it("never throws elsewhere: falls back to the production web app and reports why", () => {
    const prod = { type: "production", cloud: "encore" };
    expect(resolveAppUrl(undefined, prod)).toBe(CLOUD_APP_URL);
    expect(appUrlProblem(undefined, prod)).toBe("APP_URL is not set");
    expect(resolveAppUrl("http://app.example.com", { type: "production", cloud: "aws" })).toBe(CLOUD_APP_URL);
    expect(appUrlProblem("http://app.example.com", { type: "production", cloud: "aws" })).toMatch("https://");
    expect(resolveAppUrl("not a url", prod)).toBe(CLOUD_APP_URL);
    expect(appUrlProblem("not a url", prod)).toMatch("is not a URL");
    expect(resolveAppUrl("https://shipment-tracker-web.vercel.app/", prod)).toBe("https://shipment-tracker-web.vercel.app");
    expect(appUrlProblem("https://shipment-tracker-web.vercel.app", prod)).toBeNull();
  });
});
