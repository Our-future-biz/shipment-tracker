import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  attentionReasons,
  cleanFields,
  cleanPin,
  consignmentStatus,
  formatTruckingRef,
  marginOf,
  approvalCovers,
  normalisePlate,
  stampRefusal,
  stampTime,
  transportOrderRefusal,
  tripStatus,
  truckingRefYear,
  voidRefusal,
  type ConsignmentFacts,
} from "../lib/consignmentRules";
import { hashToken, linkExpiry, looksLikeToken, newToken, tokenMatches } from "../lib/haulierToken";
import { load, stop } from "./truckingFakes";

const none: ConsignmentFacts = { cancelledAt: null, tripId: null, orderSentAt: null, confirmedAt: null, pickedUpAt: null, deliveredAt: null, podReceivedAt: null, readyToBillAt: null };
const t = (iso: string) => new Date(iso);

describe("status machine", () => {
  it("follows the latest step reached", () => {
    expect(consignmentStatus(none)).toBe("BOOKED");
    expect(consignmentStatus({ ...none, tripId: "t" })).toBe("PLANNED");
    expect(consignmentStatus({ ...none, tripId: "t", orderSentAt: t("2026-10-15") })).toBe("ORDERED");
    expect(consignmentStatus({ ...none, tripId: "t", orderSentAt: t("2026-10-15"), confirmedAt: t("2026-10-15") })).toBe("CONFIRMED");
    expect(consignmentStatus({ ...none, pickedUpAt: t("2026-10-15") })).toBe("PICKED_UP");
    expect(consignmentStatus({ ...none, pickedUpAt: t("2026-10-15"), deliveredAt: t("2026-10-15") })).toBe("DELIVERED");
    expect(consignmentStatus({ ...none, deliveredAt: t("2026-10-15"), podReceivedAt: t("2026-10-15") })).toBe("POD_RECEIVED");
    expect(consignmentStatus({ ...none, podReceivedAt: t("2026-10-15"), readyToBillAt: t("2026-10-15") })).toBe("READY_TO_BILL");
    expect(consignmentStatus({ ...none, cancelledAt: t("2026-10-15"), pickedUpAt: t("2026-10-15") })).toBe("CANCELLED");
  });

  it("gives the FTL trip its status from the order and its consignment", () => {
    const trip = { cancelledAt: null, orderSentAt: null, confirmedAt: null };
    expect(tripStatus(trip, null)).toBe("DRAFT");
    expect(tripStatus({ ...trip, orderSentAt: t("2026-10-15") }, null)).toBe("ORDERED");
    expect(tripStatus({ ...trip, orderSentAt: t("2026-10-15"), confirmedAt: t("2026-10-15") }, null)).toBe("CONFIRMED");
    expect(tripStatus(trip, { pickedUpAt: t("2026-10-15"), deliveredAt: null })).toBe("IN_TRANSIT");
    expect(tripStatus(trip, { pickedUpAt: t("2026-10-15"), deliveredAt: t("2026-10-15") })).toBe("DONE");
    expect(tripStatus({ ...trip, cancelledAt: t("2026-10-15") }, null)).toBe("CANCELLED");
  });
});

describe("stamp order", () => {
  const opts = { hasPod: false, manager: false };
  const ordered = { ...none, tripId: "t", orderSentAt: t("2026-10-15") };
  it("needs the transport order for confirmed / picked up, the pick-up for delivered, the delivery for POD", () => {
    expect(stampRefusal("confirmed", none, opts)).toBe("Send the transport order first");
    expect(stampRefusal("pickedUp", { ...none, tripId: "t" }, opts)).toMatch(/transport order/);
    expect(stampRefusal("pickedUp", ordered, opts)).toBeNull();
    expect(stampRefusal("delivered", ordered, opts)).toBe("Stamp the pick-up first");
    expect(stampRefusal("podReceived", { ...ordered, pickedUpAt: t("2026-10-15") }, opts)).toBe("Stamp the delivery first");
    const delivered = { ...ordered, pickedUpAt: t("2026-10-15"), deliveredAt: t("2026-10-15") };
    expect(stampRefusal("podReceived", delivered, opts)).toMatch(/Upload the POD/);
    expect(stampRefusal("podReceived", delivered, { hasPod: true, manager: false })).toBeNull();
    expect(stampRefusal("podReceived", delivered, { hasPod: false, manager: true })).toBeNull();
    expect(stampRefusal("pickedUp", { ...ordered, cancelledAt: t("2026-10-15") }, opts)).toBe("The consignment is cancelled");
  });

  it("voids the latest stamp first", () => {
    const all = { ...none, confirmedAt: t("2026-10-15"), pickedUpAt: t("2026-10-15"), deliveredAt: t("2026-10-15"), podReceivedAt: t("2026-10-15") };
    expect(voidRefusal("delivered", all)).toBe("Void the later stamp first");
    expect(voidRefusal("podReceived", all)).toBeNull();
    expect(voidRefusal("confirmed", { ...none, confirmedAt: t("2026-10-15") })).toBeNull();
  });

  it("takes now, or a past time within 7 days", () => {
    const now = t("2026-10-15T10:00:00Z");
    expect(stampTime(null, now)).toBe(now);
    expect(stampTime("2026-10-09T10:00:00Z", now).toISOString()).toBe("2026-10-09T10:00:00.000Z");
    expect(() => stampTime("2026-10-08T09:00:00Z", now)).toThrow(/7 days/);
    expect(() => stampTime("2026-10-15T11:00:00Z", now)).toThrow(/future/);
    expect(() => stampTime("yesterday", now)).toThrow();
  });
});

describe("margin, gates and attention", () => {
  const floor = { percent: 8, minAmountCzk: 300 };
  it("is below the floor under the percent or the minimum amount", () => {
    expect(marginOf(12000, 9000, floor)).toEqual({ marginCzk: 3000, marginPercent: 25, belowFloor: false });
    expect(marginOf(10000, 9500, floor).belowFloor).toBe(true);
    expect(marginOf(2000, 1750, floor).belowFloor).toBe(true);
    expect(marginOf(12000, null, floor)).toEqual({ marginCzk: null, marginPercent: null, belowFloor: false });
  });

  it("an approval covers the approved margin or a better one", () => {
    expect(approvalCovers({ marginCzk: 300 }, 300)).toBe(true);
    expect(approvalCovers({ marginCzk: 300 }, 500)).toBe(true);
    expect(approvalCovers({ marginCzk: 300 }, 200)).toBe(false);
    expect(approvalCovers(null, 300)).toBe(false);
  });

  it("refuses the transport order below the floor without approval, or for a blocked haulier", () => {
    const ok = { consignmentCancelled: false, tripCancelled: false, belowFloor: false, marginApproved: false, haulierName: "Bravo", haulierBlockIssues: [] };
    expect(transportOrderRefusal(ok)).toBeNull();
    expect(transportOrderRefusal({ ...ok, belowFloor: true })).toMatch(/manager must approve/);
    expect(transportOrderRefusal({ ...ok, belowFloor: true, marginApproved: true })).toBeNull();
    expect(transportOrderRefusal({ ...ok, haulierBlockIssues: ["Insurance expired"] })).toBe("Bravo cannot be used: Insurance expired");
  });

  it("names what needs attention", () => {
    const base = { ...none, status: "BOOKED" as const, pickupDate: "2026-10-16", promisedDate: null, belowFloor: false, marginApproved: false, marginCzk: 1000, tripRejectedAt: null };
    const now = t("2026-10-15T10:00:00Z");
    expect(attentionReasons(base, "2026-10-15", now)).toEqual(["Pick-up within 24 h and no trip"]);
    expect(attentionReasons({ ...base, pickupDate: "2026-10-20" }, "2026-10-15", now)).toEqual([]);
    expect(attentionReasons({ ...base, pickupDate: "2026-10-20", belowFloor: true, marginCzk: -10 }, "2026-10-15", now)).toEqual([
      "Margin below the floor: needs a manager's approval",
      "Negative margin",
    ]);
    const delivered = { ...base, status: "DELIVERED" as const, deliveredAt: t("2026-10-12T10:00:00Z") };
    expect(attentionReasons(delivered, "2026-10-15", now)).toEqual(["POD missing for more than 2 days"]);
    expect(attentionReasons({ ...base, cancelledAt: now }, "2026-10-15", now)).toEqual([]);
  });

  it("shows notices (also on a cancelled consignment) and fallback findings until the job is billed", () => {
    const now = t("2026-10-15T10:00:00Z");
    const quiet = { ...none, status: "BOOKED" as const, pickupDate: "2026-10-20", promisedDate: null, belowFloor: false, marginApproved: false, marginCzk: 1000, tripRejectedAt: null };
    const findings = ["No fuel index for 2026-10: the fuel surcharge is priced at 0"];
    expect(attentionReasons({ ...quiet, findings }, "2026-10-15", now)).toEqual(["Priced on a fallback: No fuel index for 2026-10: the fuel surcharge is priced at 0"]);
    expect(attentionReasons({ ...quiet, findings, readyToBillAt: now }, "2026-10-15", now)).toEqual([]);
    const notices = ["Price change after invoice: -12 000 CZK"];
    expect(attentionReasons({ ...quiet, notices }, "2026-10-15", now)).toEqual(notices);
    expect(attentionReasons({ ...quiet, notices, cancelledAt: now }, "2026-10-15", now)).toEqual(notices);
  });
});

describe("input rules", () => {
  const fields = { quoteNumber: null, serviceLevel: "D1" as const, pickupDate: "2026-10-16", pickupTime: null, pickup: stop(), delivery: stop(), load: load(), price: { source: "TARIFF" as const } };
  it("normalises CZ postcodes, announces B2C deliveries and checks ADR", () => {
    const f = cleanFields({ ...fields, load: load({ b2c: true }) });
    expect(f.pickup.postcode).toBe("11000");
    expect(f.delivery.avizaceRequired).toBe(true);
    expect(() => cleanFields({ ...fields, load: load({ adr: true, adrUn: "12", adrClass: "3" }) })).toThrow(/UN number/);
    expect(cleanFields({ ...fields, load: load({ adr: true, adrUn: "UN 1203", adrClass: "3" }) }).load.adrUn).toBe("1203");
    expect(() => cleanFields({ ...fields, pickup: stop({ postcode: "1100" }) })).toThrow(/postcode/);
    expect(cleanFields({ ...fields, delivery: stop({ country: "de", postcode: "10115" }) }).delivery).toMatchObject({ country: "DE", postcode: "10115" });
    expect(() => cleanFields({ ...fields, serviceLevel: null })).toThrow(/service level/);
    expect(() => cleanFields({ ...fields, price: { source: "QUOTE" } })).toThrow(/quote number/);
  });

  it("plates upper case without spaces; a PIN of 4 to 8 digits", () => {
    expect(normalisePlate(" 1ab 23-45 ")).toBe("1AB2345");
    expect(cleanPin(null)).toBeNull();
    expect(cleanPin(" 004211 ")).toBe("004211");
    expect(() => cleanPin("12a4")).toThrow();
  });

  it("numbers TCZ / LCZ per Prague year with six digits", () => {
    expect(formatTruckingRef("TCZ", 2026, 1)).toBe("TCZ2026000001");
    expect(formatTruckingRef("LCZ", 2026, 123456)).toBe("LCZ2026123456");
    expect(truckingRefYear(t("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});

describe("haulier link token", () => {
  it("is 32 random bytes; only the hash is kept; compared in constant time", () => {
    const { token, hash } = newToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(looksLikeToken(token)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
    expect(tokenMatches(hash, token)).toBe(true);
    expect(tokenMatches(hash, newToken().token)).toBe(false);
    expect(newToken().token).not.toBe(token);
    expect(looksLikeToken("abc")).toBe(false);
  });

  it("expires 30 days after the planned pick-up", () => {
    expect(linkExpiry("2026-10-16").toISOString()).toBe("2026-11-15T22:59:59.000Z");
  });
});
