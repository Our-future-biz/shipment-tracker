import type { controllers } from "@/lib/api/client";

/** Shipment fields holding a party name, each with the CRM customer id it links to. */
export type PartyField = "customer" | "shipper" | "consignee" | "principalParty";

/** The update that sets a party's name and its customer link together. */
export function partyUpdate(party: PartyField, name: string, customerId: string | null): controllers.ShipmentUpdateRequest {
  switch (party) {
    case "customer":
      return { customer: name, customerId };
    case "shipper":
      return { shipper: name, shipperId: customerId };
    case "consignee":
      return { consignee: name, consigneeId: customerId };
    case "principalParty":
      return { principalParty: name, principalPartyId: customerId };
  }
}
