import { describe, expect, it } from "vitest";
import type { ShipmentItem } from "@/hooks/useShipments";
import { COPYABLE_FIELDS, DEFAULT_COPY_FIELDS, copyRequest } from "./CreateShipmentWizard";

// "Copy from Shipment" (User Council O9/M1, owner's answer Q5): the customer and what the job is come along.
const base = {
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  status: "Booking Confirmation Pending [IMP]",
  personInCharge: "anna@cto.cz",
};

const source = {
  id: "s1",
  jobNumber: "CZFCL00000059",
  customer: "Alfa s.r.o.",
  customerId: "c1",
  customerReference: "PO-4471",
  tradeDirection: "Export",
  freightMode: "Sea Freight",
  loadType: "Full Load",
  serviceType: "Door to Port",
  shippingLine: "Hapag-Lloyd",
  shipper: "Alfa s.r.o.",
  pol: "DEHAM",
  pod: "CNSHA",
  origin: "Prague",
  hsCode: "",
} as unknown as ShipmentItem;

describe("the fields offered for a copy", () => {
  it("offer the customer, its reference, direction, mode, load type, service type and shipping line", () => {
    for (const key of ["customer", "customerReference", "tradeDirection", "freightMode", "loadType", "serviceType", "shippingLine"]) {
      expect(COPYABLE_FIELDS).toContain(key);
    }
  });

  it("start ticked, all but the Customer Reference: a new job is a new order", () => {
    expect(DEFAULT_COPY_FIELDS.has("customerReference")).toBe(false);
    expect(COPYABLE_FIELDS.filter((key) => !DEFAULT_COPY_FIELDS.has(key))).toEqual(["customerReference"]);
  });
});

describe("copyRequest", () => {
  it("sends the source's customer, direction, mode, load type, service type and shipping line, not its reference by default", () => {
    const { request, copied, origin } = copyRequest(base, source, DEFAULT_COPY_FIELDS);
    expect(request).toMatchObject({
      customer: "Alfa s.r.o.",
      tradeDirection: "Export",
      freightMode: "Sea Freight",
      loadType: "Full Load",
      serviceType: "Door to Port",
      shippingLine: "Hapag-Lloyd",
      pol: "DEHAM",
      pod: "CNSHA",
      personInCharge: "anna@cto.cz",
    });
    expect(request).not.toHaveProperty("customerReference");
    expect(copied).toContain("customer");
    // The Origin goes by an update after the create; an empty field is not sent.
    expect(origin).toBe("Prague");
    expect(request).not.toHaveProperty("origin");
    expect(request).not.toHaveProperty("hsCode");
  });

  it("sends the Customer Reference when it is ticked", () => {
    const { request } = copyRequest(base, source, new Set([...DEFAULT_COPY_FIELDS, "customerReference"]));
    expect(request.customerReference).toBe("PO-4471");
  });

  it("keeps a blank job's Import by Sea and sends no customer when they are unticked", () => {
    const ticked = new Set([...DEFAULT_COPY_FIELDS].filter((key) => !["customer", "tradeDirection", "freightMode"].includes(key)));
    const { request, copied } = copyRequest(base, source, ticked);
    expect(request).toMatchObject({ tradeDirection: "Import", freightMode: "Sea Freight" });
    expect(request).not.toHaveProperty("customer");
    expect(copied).not.toContain("customer");
  });

  it("leaves the base request as it was", () => {
    copyRequest(base, source, DEFAULT_COPY_FIELDS);
    expect(base.tradeDirection).toBe("Import");
  });
});
