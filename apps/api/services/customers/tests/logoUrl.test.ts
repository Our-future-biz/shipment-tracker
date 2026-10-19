import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { companyOfLogoToken, customerLogoUrl } from "../lib/logoUrl";
import { toCustomerItem } from "../lib/mappers";
import type { CustomerItemRow } from "../schemas/customer.schema";

const CUSTOMER = "1b0c2a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const tokenOf = (url: string) => new URL(url, "http://x").searchParams.get("t");

describe("customer logo links", () => {
  it("serve only the customer and company they were made for", () => {
    const url = customerLogoUrl(CUSTOMER, COMPANY, "2026-10-19-1234");
    expect(url.startsWith(`/customers/${CUSTOMER}/logo/image?t=`)).toBe(true);
    expect(companyOfLogoToken(tokenOf(url), CUSTOMER)).toBe(COMPANY);
    expect(companyOfLogoToken(tokenOf(url), "another-customer")).toBeNull();
    expect(companyOfLogoToken("forged.token", CUSTOMER)).toBeNull();
  });

  it("stay the same within the hour, so the browser keeps the image cached", () => {
    expect(customerLogoUrl(CUSTOMER, COMPANY, "v1")).toBe(customerLogoUrl(CUSTOMER, COMPANY, "v1"));
    expect(customerLogoUrl(CUSTOMER, COMPANY, "v1")).not.toBe(customerLogoUrl(CUSTOMER, COMPANY, "v2"));
  });

  it("are what an item carries instead of the logo's bytes, and empty without a logo", () => {
    const at = new Date("2026-10-19T10:00:00Z");
    const row = { id: CUSTOMER, companyId: COMPANY, logoUpdatedAt: "2026-10-19", roles: ["customer"], createdAt: at, updatedAt: at } as unknown as CustomerItemRow;
    expect(toCustomerItem({ ...row, logoLength: 1234 }).logoUrl).toContain(`/customers/${CUSTOMER}/logo/image?t=`);
    expect(toCustomerItem({ ...row, logoLength: 0 }).logoUrl).toBe("");
    expect(toCustomerItem({ ...row, logoLength: 1234 })).not.toHaveProperty("logoData");
  });
});
