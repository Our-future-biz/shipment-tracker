import { describe, expect, it } from "vitest";
import type { CustomerSiteItem } from "@/hooks/useCustomerSites";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import {
  consignmentFormProblems,
  emptyConsignmentForm,
  formFromQuote,
  formFromShipment,
  stopFromSite,
  toCreateRequest,
  toUpdateRequest,
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

describe("prefill", () => {
  it("takes a job's customer and its sites", () => {
    const shipment = { id: "sh1", jobNumber: "ECZ2026000001", customerId: "cust", customer: "ACME", pickupSiteId: "s1", pickupPostcode: null, deliverySiteId: null, deliveryPostcode: "11000", deliveryAddress: "Na Příkopě 1", consignee: "Shop", shipper: "", pickupAddress: "", pickupCountry: "CZ", deliveryCountry: "CZ", pickupDate: "2026-10-20" } as unknown as ShipmentItem;
    const f = formFromShipment(shipment, [site], TODAY);
    expect(f).toMatchObject({ shipmentId: "sh1", jobNumber: "ECZ2026000001", customerId: "cust", customerName: "ACME", pickupDate: "2026-10-20" });
    expect(f.pickup.name).toBe("Sklad Brno");
    expect(f.delivery).toMatchObject({ siteId: null, name: "Shop", street: "Na Příkopě 1", postcode: "11000" });
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
