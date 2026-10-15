// Phase 6 part A: avizace (delivery pre-advice), delivery exceptions and the Warehouse OSD
// exceptions shown with a consignment. Plain interfaces for controllers and the web client.

export type AvizaceChannel = "PHONE" | "EMAIL" | "SMS" | "OTHER";

/** How the consignee was told of the delivery (recorded by staff; e-mail sending is off). */
export interface AvizaceRecord {
  /** ISO, when it was recorded */
  at: string;
  /** Display name of who recorded it */
  by: string;
  channel: AvizaceChannel;
  /** Who was told (name, phone or e-mail) */
  contact: string;
  /** The delivery window agreed with the consignee (ISO), when one was agreed */
  agreedFrom: string | null;
  agreedTo: string | null;
  note: string;
}

/** The avizace text prepared to copy (Czech and English); never the Pick-up PIN. */
export interface AvizaceTemplate {
  cs: string;
  en: string;
  subject: string;
  /** The delivery stop's contact phone as stored ("" when none) */
  to: string;
}

export type ExceptionKind = "FAILED_DELIVERY" | "DAMAGE" | "SHORTAGE" | "OVERAGE" | "WAITING_TIME" | "REDELIVERY" | "OTHER";
export type FailedReason = "CLOSED" | "ABSENT" | "REFUSED" | "WRONG_ADDRESS" | "REFUSED_DAMAGED" | "NO_AVIZACE" | "OTHER";
export type ExceptionCause = "CUSTOMER" | "HAULIER" | "US" | "UNKNOWN";
export type ExceptionDecision = "CHARGE_CUSTOMER" | "CLAIM_HAULIER" | "ABSORB" | "PENDING";

export interface DeliveryException {
  id: string;
  consignmentId: string;
  legId: string | null;
  kind: ExceptionKind;
  failedReason: FailedReason | null;
  cause: ExceptionCause;
  decision: ExceptionDecision;
  amount: number | null;
  currency: "CZK" | "EUR";
  description: string;
  pieces: number | null;
  waitingMinutes: number | null;
  /** When raised from / linked to a Warehouse OSD exception */
  warehouseExceptionId: string | null;
  createdAt: string;
  /** Display name */
  createdBy: string;
  decidedAt: string | null;
  /** Display name */
  decidedBy: string | null;
  closedAt: string | null;
  photos: { id: string; fileName: string }[];
}

/** An exception in the cross-consignment list. */
export interface DeliveryExceptionListItem extends DeliveryException {
  consignmentRef: string;
  customerName: string;
  jobNumber: string;
}

/** A Warehouse OSD exception (Damaged / Short / Over) of the consignment's job, read-only. */
export interface WarehouseExceptionItem {
  id: string;
  shipmentId: string;
  /** "Damaged" | "Short" | "Over" */
  kind: string;
  pieces: number;
  note: string;
  /** "open" | "resolved" */
  status: string;
  createdAt: string;
}
