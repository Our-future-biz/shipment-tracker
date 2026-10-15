import { describe, expect, it } from "vitest";
import {
  CONFIRMATION,
  ORDER_KIND,
  PORTAL_USER_STATUS,
  canRespond,
  canUploadStopPod,
  deliveredProblem,
  needsActionText,
  orderStatusText,
  passwordProblem,
  portalUserProblem,
  stampKinds,
  stampProblem,
  stopAddress,
} from "./portal";

const at = (iso: string) => iso.slice(11, 16);
const order = (status: "AWAITING" | "CONFIRMED" | "REJECTED", stamps: Partial<Record<"loaded" | "departed" | "arrived", string>> = {}) => ({
  kind: "FTL" as const,
  confirmation: { status, at: null, by: null },
  stamps: { loaded: null, departed: null, arrived: null, ...stamps },
});

describe("haulier portal words", () => {
  it("names kinds, confirmations, statuses and user states", () => {
    expect(Object.keys(ORDER_KIND)).toHaveLength(5);
    expect(ORDER_KIND.PICKUP_RUN).toEqual({ cs: "Svoz", en: "Pick-up run" });
    expect(CONFIRMATION.AWAITING.en).toBe("Awaiting your confirmation");
    expect(orderStatusText("IN_TRANSIT")).toEqual({ cs: "Na cestě", en: "In transit" });
    expect(orderStatusText("SOMETHING_NEW")).toEqual({ cs: "SOMETHING_NEW", en: "SOMETHING_NEW" });
    expect(Object.keys(PORTAL_USER_STATUS).sort()).toEqual(["ACTIVE", "DISABLED", "INVITED", "LOCKED"]);
  });

  it("puts the needs-action line in Czech too", () => {
    expect(needsActionText(null)).toBeNull();
    expect(needsActionText("  ")).toBeNull();
    expect(needsActionText("Confirm the order")).toEqual({ cs: "Potvrďte objednávku", en: "Confirm the order" });
    expect(needsActionText("Upload POD for 1 stop")?.cs).toBe("Nahrajte POD (1 zastávka)");
    expect(needsActionText("Upload POD for 2 stops")?.cs).toBe("Nahrajte POD (2 zastávky)");
    expect(needsActionText("Upload POD for 7 stops")?.cs).toBe("Nahrajte POD (7 zastávek)");
    expect(needsActionText("Call the dispatcher")).toEqual({ cs: "Call the dispatcher", en: "Call the dispatcher" });
  });

  it("joins a stop's address", () => {
    expect(stopAddress({ street: "Na Příkopě 1", postcode: "110 00", city: "Praha" })).toBe("Na Příkopě 1, 110 00 Praha");
    expect(stopAddress({ street: "", postcode: "", city: "Brno" })).toBe("Brno");
  });
});

describe("haulier portal actions", () => {
  it("offers Loaded only where the haulier loads, no stamps on a partner delivery", () => {
    expect(stampKinds("FTL")).toEqual(["LOADED"]);
    expect(stampKinds("PICKUP_RUN")).toEqual(["LOADED", "DEPARTED", "ARRIVED"]);
    expect(stampKinds("PICKUP_RUN")).toEqual(["LOADED", "DEPARTED", "ARRIVED"]);
    expect(stampKinds("LINEHAUL")).toEqual(["DEPARTED", "ARRIVED"]);
    expect(stampKinds("PARTNER_DELIVERY")).toEqual([]);
  });

  it("says why a stamp cannot be given", () => {
    expect(stampProblem(order("CONFIRMED"), "DEPARTED", at)).toBeNull();
    expect(stampProblem(order("CONFIRMED"), "ARRIVED", at)?.en).toBe("Stamp the departure first.");
    expect(stampProblem(order("CONFIRMED", { departed: "2026-10-15T08:30:00Z" }), "DEPARTED", at)?.en).toBe("Stamped 08:30.");
    expect(stampProblem(order("CONFIRMED", { departed: "2026-10-15T08:30:00Z" }), "ARRIVED", at)).toBeNull();
    expect(stampProblem(order("REJECTED"), "LOADED", at)?.en).toBe("The order was rejected.");
  });

  it("asks to confirm once, trips only", () => {
    expect(canRespond(order("AWAITING"))).toBe(true);
    expect(canRespond(order("CONFIRMED"))).toBe(false);
    expect(canRespond({ ...order("AWAITING"), kind: "PARTNER_DELIVERY" })).toBe(false);
  });

  it("stamps delivery stops once and takes their POD once", () => {
    const stop = { kind: "DELIVERY" as const, deliveredAt: null, podUploaded: false };
    expect(deliveredProblem(order("CONFIRMED"), stop, at)).toBeNull();
    expect(deliveredProblem(order("CONFIRMED"), { ...stop, kind: "PICKUP" }, at)?.en).toBe("Delivery stops only.");
    expect(deliveredProblem(order("CONFIRMED"), { ...stop, deliveredAt: "2026-10-15T14:05:00Z" }, at)?.en).toBe("Delivered 14:05.");
    expect(canUploadStopPod(order("CONFIRMED"), stop)).toBe(true);
    expect(canUploadStopPod(order("CONFIRMED"), { ...stop, podUploaded: true })).toBe(false);
    expect(canUploadStopPod(order("REJECTED"), stop)).toBe(false);
  });
});

describe("haulier portal password", () => {
  it("needs 12 characters, not the e-mail, typed twice the same", () => {
    expect(passwordProblem("short", "short")?.en).toMatch(/at least 12/);
    expect(passwordProblem("jan@haulier.cz1", "jan@haulier.cz1", "jan@haulier.cz")).toBeNull();
    expect(passwordProblem("jan.novak@haulier.cz", "jan.novak@haulier.cz", "JAN.NOVAK@haulier.cz")?.en).toBe("The password cannot be your e-mail.");
    expect(passwordProblem("correct horse battery", "correct horse batterY")?.en).toBe("The passwords do not match.");
    expect(passwordProblem("correct horse battery", "correct horse battery")).toBeNull();
  });
});

describe("portal users (app side)", () => {
  it("needs a name and an e-mail", () => {
    expect(portalUserProblem({ name: "", email: "a@b.cz" })).toBe("Enter the name");
    expect(portalUserProblem({ name: "Jan", email: "jan@" })).toBe("Enter a valid e-mail");
    expect(portalUserProblem({ name: "Jan", email: "jan@haulier.cz" })).toBeNull();
  });
});
