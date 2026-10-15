// The haulier portal: its users as the app manages them and what a logged-in haulier sees. Never a
// customer's price, a margin, another haulier, a Pick-up PIN or an internal note.

export interface PortalUserItem {
  id: string;
  haulierCustomerId: string;
  email: string;
  name: string;
  phone: string;
  /** INVITED = the password was never set; LOCKED = too many wrong passwords (15 minutes) */
  status: "INVITED" | "ACTIVE" | "DISABLED" | "LOCKED";
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PortalMe {
  userName: string;
  email: string;
  haulierName: string;
  ourCompany: string;
}

export type PortalOrderKind = "FTL" | "PICKUP_RUN" | "LINEHAUL" | "DELIVERY_RUN" | "PARTNER_DELIVERY";

export interface PortalOrderItem {
  /** The trip id, or the leg id of a partner delivery */
  id: string;
  kind: PortalOrderKind;
  /** The trip ref, or the consignment ref of a partner delivery */
  ref: string;
  /** YYYY-MM-DD */
  date: string;
  status: string;
  from: string;
  to: string;
  stops: number;
  palletPlaces: number;
  weightKg: number;
  /** The agreed (buy) price only */
  agreedPrice: { total: number; currency: string } | null;
  /** "Confirm the order", "Upload POD for 2 stops", … */
  needsAction: string | null;
}

export interface PortalStop {
  consignmentRef: string;
  consignmentId: string;
  kind: "PICKUP" | "DELIVERY";
  name: string;
  street: string;
  postcode: string;
  city: string;
  windowText: string;
  contact: string;
  reference: string;
  notes: string;
  avizaceRequired: boolean;
  load: { pieces: number; palletPlaces: number; ldm: number; weightKg: number; adr: string | null; tailLift: boolean };
  deliveredAt: string | null;
  podUploaded: boolean;
}

/**
 * An order in full: every field of PortalOrderItem, with `stops` the stops themselves (their
 * number is stops.length). Written out rather than extended, as TypeScript does not let an
 * extending interface turn `stops: number` into a list.
 */
export interface PortalOrder {
  id: string;
  kind: PortalOrderKind;
  ref: string;
  date: string;
  status: string;
  from: string;
  to: string;
  stops: PortalStop[];
  palletPlaces: number;
  weightKg: number;
  agreedPrice: { total: number; currency: string } | null;
  needsAction: string | null;
  vehicleText: string;
  plates: string;
  driver: string;
  confirmation: { status: "AWAITING" | "CONFIRMED" | "REJECTED"; at: string | null; by: string | null };
  stamps: { loaded: string | null; departed: string | null; arrived: string | null };
  /** Newest first */
  history: { at: string; text: string }[];
}
