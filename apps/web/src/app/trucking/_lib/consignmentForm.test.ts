import { describe, expect, it } from "vitest";
import type { CustomerSiteItem } from "@/hooks/useCustomerSites";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import dayjs from "dayjs";
import type { ConsignmentDetail } from "@/hooks/useTruckingConsignments";
import {
  consignmentFormProblems,
  emptyConsignmentForm,
  fixedDayMissing,
  fixedDeliveryTime,
  formFromDetail,
  formFromQuote,
  formFromShipment,
  missingSellListNote,
  stopFromSite,
  toCreateRequest,
  toUpdateRequest,
  windowDay,
  windowTime,
  withFixedDelivery,
  withWindowDay,
  withWindowTimes,
  type ConsignmentForm,
} from "./consignmentForm";

const TODAY = "2026-10-15";
const site = {
  id: "s1",
  label: "Sklad Brno",
  street: "Vídeňská 1",
  postcode: "602 00",
  city: "Brno",
  country: "CZ",
  avizaceName: "Petr",
  avizacePhone: "+420 600 000 000",
  loadingNotes: "Ramp 3",
} as CustomerSiteItem;

const valid = (): ConsignmentForm => ({
  ...emptyConsignmentForm("new", TODAY),
  customerId: "cust",
  pickup: { ...stopFromSite(site), siteId: null },
  delivery: { ...stopFromSite({ ...site, id: "s2", label: "Praha", postcode: "11000", city: "Praha" }) },
  load: { ...emptyConsignmentForm("new", TODAY).load, weightKg: 1200, palletPlaces: 2 },
});

describe("stopFromSite", () => {
  it("fills the address, the avizace contact and the loading notes", () => {
    expect(stopFromSite(site)).toMatchObject({ siteId: "s1", name: "Sklad Brno", postcode: "60200", contactPhone: "+420 600 000 000", avizaceRequired: true, notes: "Ramp 3" });
  });
});

describe("consignmentFormProblems", () => {
  it("accepts a complete new order", () => {
    expect(consignmentFormProblems(valid())).toEqual([]);
  });

  it("names what is missing", () => {
    const f = { ...valid(), customerId: null, load: { ...valid().load, weightKg: 0 }, delivery: { ...valid().delivery, postcode: "602" } };
    expect(consignmentFormProblems(f)).toEqual(["Pick the customer", "Delivery: postcode (PSČ) has 5 digits", "Weight (kg) is required"]);
  });

  it("asks for the job or the quote of its source", () => {
    expect(consignmentFormProblems({ ...valid(), source: "job" })).toContain("Pick the job");
    expect(consignmentFormProblems({ ...valid(), source: "quote" })).toContain("Pick the quote");
  });

  it("asks ADR details and a reason for an agreed price", () => {
    const f = { ...valid(), load: { ...valid().load, adr: true }, priceSource: "MANUAL" as const, manualTotal: 5000 };
    expect(consignmentFormProblems(f)).toEqual(["ADR: the UN number has 4 digits", "ADR: the class", "Agreed price: why the tariff is not used"]);
  });
});

describe("requests", () => {
  it("creates a new domestic order without a job", () => {
    const req = toCreateRequest({ ...valid(), shipmentId: "ignored" });
    expect(req.shipmentId).toBeNull();
    expect(req.price).toEqual({ source: "TARIFF" });
    expect(req.delivery.postcode).toBe("11000");
  });

  it("sends an agreed price with its reason", () => {
    const req = toCreateRequest({ ...valid(), priceSource: "MANUAL", manualTotal: 5000, manualCurrency: "EUR", manualReason: " spot price " });
    expect(req.price).toEqual({ source: "MANUAL", total: 5000, currency: "EUR", reason: "spot price" });
  });

  it("updates without the job and customer, with the version and reprice", () => {
    const req = toUpdateRequest(valid(), 3, true);
    expect(req).toMatchObject({ version: 3, reprice: true });
    expect("shipmentId" in req).toBe(false);
    expect("customerId" in req).toBe(false);
  });

  it("sends FTL with the plain LTL defaults", () => {
    const req = toCreateRequest({ ...valid(), selfDelivered: true, lastMile: "PARTNER", partnerHaulierCustomerId: "p1" });
    expect(req).toMatchObject({ scope: "FTL", selfDelivered: false, lastMile: "OWN_RUN", partnerHaulierCustomerId: null });
  });

  it("sends the LTL choices; a partner only with the partner network", () => {
    const partner = toCreateRequest({ ...valid(), scope: "LTL", selfDelivered: true, lastMile: "PARTNER", partnerHaulierCustomerId: "p1" });
    expect(partner).toMatchObject({ scope: "LTL", selfDelivered: true, lastMile: "PARTNER", partnerHaulierCustomerId: "p1" });
    const own = toUpdateRequest({ ...valid(), scope: "LTL", lastMile: "OWN_RUN", partnerHaulierCustomerId: "p1" }, 2, false);
    expect(own).toMatchObject({ scope: "LTL", lastMile: "OWN_RUN", partnerHaulierCustomerId: null });
  });

  it("asks for the partner haulier of an LTL partner delivery", () => {
    expect(consignmentFormProblems({ ...valid(), scope: "LTL", lastMile: "PARTNER" })).toEqual(["Pick the partner haulier of the last mile"]);
    expect(consignmentFormProblems({ ...valid(), scope: "LTL", lastMile: "PARTNER", partnerHaulierCustomerId: "p1" })).toEqual([]);
  });
});

// Express fixed date had no field for the agreed day, so nothing was promised (User Council T4, Q13).
describe("Express fixed date", () => {
  const fixed = (over: Partial<ConsignmentForm> = {}): ConsignmentForm => ({ ...valid(), serviceLevel: "EXP_FIXED", pickupDate: "2026-10-16", ...over });
  const at = (day: string, time: string) => dayjs(`${day}T${time}`).toISOString();

  it("asks for the fixed delivery date, not before the pick-up; the other levels don't", () => {
    expect(consignmentFormProblems(fixed())).toEqual(["Express fixed date: the fixed delivery date agreed with the customer"]);
    expect(consignmentFormProblems(fixed({ fixedDeliveryDate: "2026-10-15" }))).toEqual(["The fixed delivery date cannot be before the pick-up"]);
    expect(consignmentFormProblems(fixed({ fixedDeliveryDate: "2026-10-21" }))).toEqual([]);
    expect(consignmentFormProblems({ ...valid(), serviceLevel: "D1" })).toEqual([]);
  });

  it("after the pick-up an older consignment without the date still saves its notes", () => {
    expect(consignmentFormProblems(fixed(), { limited: true })).toEqual([]);
  });

  it("before the pick-up an older one without the date saves without it; a day typed is checked (mock council R24)", () => {
    expect(fixedDayMissing({ serviceLevel: "EXP_FIXED", promisedDate: null })).toBe(true);
    expect(fixedDayMissing({ serviceLevel: "EXP_FIXED", promisedDate: "2026-10-21" })).toBe(false);
    expect(fixedDayMissing({ serviceLevel: "D1", promisedDate: null })).toBe(false);
    expect(consignmentFormProblems(fixed(), { fixedDateMissingAllowed: true })).toEqual([]);
    expect(consignmentFormProblems(fixed({ fixedDeliveryDate: "2026-10-15" }), { fixedDateMissingAllowed: true })).toEqual(["The fixed delivery date cannot be before the pick-up"]);
  });

  it("refuses a delivery time window off the agreed day", () => {
    const f = fixed({ fixedDeliveryDate: "2026-10-21", delivery: { ...valid().delivery, windowFrom: at("2026-10-22", "08:00"), windowTo: null } });
    expect(consignmentFormProblems(f)).toEqual(["Delivery: the time window is not on the fixed delivery date"]);
    expect(consignmentFormProblems({ ...f, delivery: { ...f.delivery, windowFrom: at("2026-10-21", "08:00") } })).toEqual([]);
  });

  it("keeps an agreed time as the end of the Delivery time window, moving with the day", () => {
    let f = withFixedDelivery(fixed(), "2026-10-21", "14:00");
    expect(f.fixedDeliveryDate).toBe("2026-10-21");
    expect(f.delivery.windowTo).toBe(at("2026-10-21", "14:00"));
    expect(fixedDeliveryTime(f)).toBe("14:00");
    f = withFixedDelivery(f, "2026-10-23", fixedDeliveryTime(f));
    expect(f.delivery.windowTo).toBe(at("2026-10-23", "14:00"));
    f = withFixedDelivery(f, "2026-10-23", null);
    expect(f.delivery.windowTo).toBeNull();
    // The delivery's window is a from–to on the fixed date (user council T17): one typed for another
    // day moves onto it, its times kept, and is not cleared by a date without a time.
    const typed = withFixedDelivery(fixed({ delivery: { ...valid().delivery, windowFrom: at("2026-10-25", "08:00"), windowTo: at("2026-10-25", "10:00") } }), "2026-10-21", null);
    expect(typed.delivery.windowFrom).toBe(at("2026-10-21", "08:00"));
    expect(typed.delivery.windowTo).toBe(at("2026-10-21", "10:00"));
  });

  it("keeps a stop's time window as from–to times on the stop's day (user council T17)", () => {
    const stop = valid().pickup;
    expect(windowDay(stop)).toBeNull();
    const set = withWindowTimes(stop, "2026-10-20", "08:00", "12:30");
    expect(set).toMatchObject({ windowFrom: at("2026-10-20", "08:00"), windowTo: at("2026-10-20", "12:30") });
    expect(windowDay(set)).toBe("2026-10-20");
    expect([windowTime(set.windowFrom), windowTime(set.windowTo)]).toEqual(["08:00", "12:30"]);
    // An open end stays open; the day moves with the pick-up date, the times kept.
    expect(withWindowTimes(stop, "2026-10-20", null, "16:00")).toMatchObject({ windowFrom: null, windowTo: at("2026-10-20", "16:00") });
    expect(withWindowDay(set, "2026-10-22")).toMatchObject({ windowFrom: at("2026-10-22", "08:00"), windowTo: at("2026-10-22", "12:30") });
    expect(withWindowDay(set, "2026-10-20")).toBe(set);
    expect(withWindowDay(stop, "2026-10-22")).toBe(stop);
    expect(withWindowDay(set, null)).toBe(set);
  });

  it("sends the date only for Express fixed date, and reads it back from the promised date for Edit", () => {
    expect(toCreateRequest(fixed({ fixedDeliveryDate: "2026-10-21" })).fixedDeliveryDate).toBe("2026-10-21");
    expect(toUpdateRequest(fixed({ fixedDeliveryDate: "2026-10-21" }), 2, false).fixedDeliveryDate).toBe("2026-10-21");
    expect(toCreateRequest({ ...valid(), fixedDeliveryDate: "2026-10-21" }).fixedDeliveryDate).toBeNull();
    const detail = { ...toCreateRequest(valid()), scope: "FTL", serviceLevel: "EXP_FIXED", promisedDate: "2026-10-21", sell: null, load: valid().load } as unknown as ConsignmentDetail;
    expect(formFromDetail(detail).fixedDeliveryDate).toBe("2026-10-21");
    expect(formFromDetail({ ...detail, serviceLevel: "D1" }).fixedDeliveryDate).toBeNull();
  });
});

describe("prefill", () => {
  it("takes a job's customer and its sites", () => {
    const shipment = { id: "sh1", jobNumber: "ECZ2026000001", customerId: "cust", customer: "ACME", pickupSiteId: "s1", pickupPostcode: null, deliverySiteId: null, deliveryPostcode: "11000", deliveryAddress: "Na Příkopě 1", consignee: "Shop", shipper: "", pickupAddress: "", pickupCountry: "CZ", deliveryCountry: "CZ", pickupDate: "2026-10-20" } as unknown as ShipmentItem;
    const f = formFromShipment(shipment, [site], TODAY);
    expect(f).toMatchObject({ shipmentId: "sh1", jobNumber: "ECZ2026000001", customerId: "cust", customerName: "ACME", pickupDate: "2026-10-20" });
    expect(f.pickup.name).toBe("Sklad Brno");
    expect(f.delivery).toMatchObject({ siteId: null, name: "Shop", street: "Na Příkopě 1", postcode: "11000", contactName: "", contactPhone: "", notes: "" });
  });

  it("gives the delivery stop the job's contact, telephone and notes, as approved Import Instructions left them (E5)", () => {
    const job = { id: "sh1", jobNumber: "CZLCL00000054", customerId: "cust", customer: "ACME", deliverySiteId: null, deliveryPostcode: "10200", deliveryAddress: "Sazečská 560/8", consignee: "Shop", deliveryCountry: "CZ", consigneeContact: "Petr Skladník", deliveryPhone: "+420 602 345 678", deliveryNotes: "Mon-Fri 08:00-14:00, ramp" };
    const f = formFromShipment(job as unknown as ShipmentItem, [], TODAY);
    expect(f.delivery).toMatchObject({ contactName: "Petr Skladník", contactPhone: "+420 602 345 678", notes: "Mon-Fri 08:00-14:00, ramp", avizaceRequired: false });
    // A site the job names with nobody to call takes the job's pair.
    const onSite = formFromShipment({ ...job, deliverySiteId: "s1" } as unknown as ShipmentItem, [{ ...site, avizaceName: "", avizacePhone: "", loadingNotes: "" } as CustomerSiteItem], TODAY);
    expect(onSite.delivery).toMatchObject({ siteId: "s1", contactName: "Petr Skladník", contactPhone: "+420 602 345 678", notes: "Mon-Fri 08:00-14:00, ramp" });
    // A site with its own avizace keeps it; its loading notes come first, the job's time window after them.
    const ownSite = formFromShipment({ ...job, deliverySiteId: "s1" } as unknown as ShipmentItem, [site], TODAY);
    expect(ownSite.delivery).toMatchObject({ contactName: "Petr", contactPhone: "+420 600 000 000", notes: "Ramp 3\nMon-Fri 08:00-14:00, ramp" });
  });

  it("takes the delivery's person and telephone as one pair, never the site's name with the job's number", () => {
    const job = { id: "sh1", jobNumber: "CZLCL00000054", customerId: "cust", customer: "ACME", deliverySiteId: "s1", deliveryPostcode: "10200", deliveryAddress: "Sazečská 560/8", consignee: "Shop", deliveryCountry: "CZ", consigneeContact: "Petr Skladník", deliveryPhone: "+420 602 345 678", deliveryNotes: "" };
    const nameOnly = formFromShipment(job as unknown as ShipmentItem, [{ ...site, avizacePhone: "" } as CustomerSiteItem], TODAY);
    expect(nameOnly.delivery).toMatchObject({ contactName: "Petr", contactPhone: "", notes: "Ramp 3" });
    const phoneOnly = formFromShipment(job as unknown as ShipmentItem, [{ ...site, avizaceName: "" } as CustomerSiteItem], TODAY);
    expect(phoneOnly.delivery).toMatchObject({ contactName: "", contactPhone: "+420 600 000 000" });
    // Notes the site already carries are not written twice.
    const same = formFromShipment({ ...job, deliveryNotes: "Ramp 3" } as unknown as ShipmentItem, [site], TODAY);
    expect(same.delivery.notes).toBe("Ramp 3");
  });

  it("takes a quote's road transport and books it at the quote's price", () => {
    const data = {
      customerId: "cust",
      customerName: "ACME",
      road: { fromSiteId: "s1", fromPostcode: "602 00", toSiteId: null, toPostcode: "110 00", pickupDate: "2026-10-01", pickupTime: null, scope: "FTL", pieces: 3, palletPlaces: 33, ldm: 13.6, weightKg: 24000, cbm: 0, extras: { adr: false, tailLift: true, avizace: false, timeWindow: false, b2c: false, nonStackable: false, waitingHours: 0, declaredValueCzk: null } },
      roadPricing: { serviceLevel: "D2" },
    } as unknown as SalesQuoteData;
    const f = formFromQuote("QCZ1", data, [site], TODAY);
    expect(f).toMatchObject({ quoteNumber: "QCZ1", serviceLevel: "D2", priceSource: "QUOTE", pickupDate: TODAY });
    expect(f.load).toMatchObject({ palletPlaces: 33, weightKg: 24000, tailLift: true });
    expect(f.delivery.postcode).toBe("11000");
  });
});

// A tariff price with no sell list to take it from is said while the form is filled (mock council S6-5).
describe("a missing Standard sell list", () => {
  const form = { priceSource: "TARIFF" as const, scope: "FTL" as const, customerId: "c1" };
  const standard = { side: "SELL" as const, scope: "FTL" as const, ownerCustomerId: null };

  it("is said for a tariff price when neither the Standard list of the scope nor the customer's own exists", () => {
    const note = "No Standard FTL sell tariff: add one under Tariffs or pick Agreed price.";
    expect(missingSellListNote(form, [])).toBe(note);
    // An LTL list, a buy tariff or another customer's list does not price an FTL order of c1.
    expect(missingSellListNote(form, [{ ...standard, scope: "LTL" }, { ...standard, side: "BUY", ownerCustomerId: "h1" }, { ...standard, ownerCustomerId: "c2" }])).toBe(note);
    expect(missingSellListNote({ ...form, scope: "LTL" }, [standard])).toBe("No Standard LTL sell tariff: add one under Tariffs or pick Agreed price.");
  });

  it("is not said when a list can price it, for another price source, or while the tariffs are not known", () => {
    expect(missingSellListNote(form, [standard])).toBeNull();
    expect(missingSellListNote(form, [{ ...standard, ownerCustomerId: "c1" }])).toBeNull();
    expect(missingSellListNote({ ...form, priceSource: "MANUAL" }, [])).toBeNull();
    expect(missingSellListNote({ ...form, priceSource: "QUOTE" }, [])).toBeNull();
    expect(missingSellListNote(form, null)).toBeNull();
  });
});
