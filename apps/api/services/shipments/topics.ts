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
