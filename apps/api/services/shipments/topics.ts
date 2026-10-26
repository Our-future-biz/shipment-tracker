import { Topic } from "encore.dev/pubsub";

export interface ShipmentDeletedEvent {
  shipmentId: string;
  companyId: string;
}

// Published when a shipment is (soft-)deleted, so services that keep rows for it (invoicing,
// warehouse, …) can retire them too: there are no foreign keys across service databases.
export const shipmentDeleted = new Topic<ShipmentDeletedEvent>("shipment-deleted", {
  deliveryGuarantee: "at-least-once",
});

export interface ShipmentPartiesChangedEvent {
  companyId: string;
  shipmentId: string;
  /** The shipment's customer name as it now reads (Customer). */
  customer: string;
  /** Its Customer's PIC as it now reads (a contact's name, or ""). */
  customerPic: string;
}

// Published when a shipment's Customer or Customer's PIC text changes — by an edit or because the
// customer or the contact was renamed in the Customer Database — so services that copied them
// (the warehouse gate record, …) follow. Subscribers must be idempotent.
export const shipmentPartiesChanged = new Topic<ShipmentPartiesChangedEvent>("shipment-parties-changed", {
  deliveryGuarantee: "at-least-once",
});
