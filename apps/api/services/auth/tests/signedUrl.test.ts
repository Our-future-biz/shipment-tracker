import { describe, expect, it, vi } from "vitest";
import { signContentToken, verifyContentToken } from "../../../lib/signedUrl";

const claim = { kind: "shipment-attachment", id: "a1", companyId: "c1" };

describe("signed content tokens", () => {
  it("accept their own token", () => {
    expect(verifyContentToken("s", signContentToken("s", claim), "shipment-attachment")).toEqual(claim);
  });

  it("refuse a token signed with another secret, of another kind, tampered or expired", () => {
    const token = signContentToken("s", claim);
    expect(verifyContentToken("other", token, "shipment-attachment")).toBeNull();
    expect(verifyContentToken("s", token, "quote-attachment")).toBeNull();
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claim, companyId: "c2", exp: 9e9 })).toString("base64url");
    expect(verifyContentToken("s", `${forged}.${sig}`, "shipment-attachment")).toBeNull();
    expect(verifyContentToken("s", `${payload}x.${sig}`, "shipment-attachment")).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
    expect(verifyContentToken("s", token, "shipment-attachment")).toBeNull();
    vi.useRealTimers();
  });

  it("refuse junk", () => {
    expect(verifyContentToken("s", undefined, "k")).toBeNull();
    expect(verifyContentToken("s", "nodot", "k")).toBeNull();
  });
});
