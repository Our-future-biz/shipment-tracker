import type { interfaces } from "@/lib/api/client";
import type { BiText } from "./publicOrder";

// Pure helpers of the haulier portal (/haulier/portal): Czech and English words, the password
// rules, what the haulier may do on an order now and why not. The server decides in the end; these
// only keep a button from offering what it would refuse. Tested in portal.test.ts.

export type PortalOrderItem = interfaces.PortalOrderItem;
export type PortalOrder = interfaces.PortalOrder;
export type PortalStop = interfaces.PortalStop;
export type PortalStampKind = "LOADED" | "DEPARTED" | "ARRIVED";
type Tone = "amber" | "green" | "red" | "blue" | "slate";

export const ORDER_KIND: Record<PortalOrderItem["kind"], BiText> = {
  FTL: { cs: "Přímá přeprava (FTL)", en: "Full truckload (FTL)" },
  PICKUP_RUN: { cs: "Svoz", en: "Pick-up run" },
  LINEHAUL: { cs: "Linehaul", en: "Line haul" },
  DELIVERY_RUN: { cs: "Rozvoz", en: "Delivery run" },
  PARTNER_DELIVERY: { cs: "Doručení partnerem", en: "Partner delivery" },
};

export const CONFIRMATION: Record<PortalOrder["confirmation"]["status"], BiText & { tone: Tone }> = {
  AWAITING: { cs: "Čeká na potvrzení", en: "Awaiting your confirmation", tone: "amber" },
  CONFIRMED: { cs: "Potvrzeno", en: "Confirmed", tone: "green" },
  REJECTED: { cs: "Odmítnuto", en: "Rejected", tone: "red" },
};

// The order's status as the server words it: a trip's or a consignment's status.
const ORDER_STATUS: Record<string, BiText> = {
  DRAFT: { cs: "Rozpracováno", en: "Draft" },
  ORDERED: { cs: "Objednáno", en: "Ordered" },
  CONFIRMED: { cs: "Potvrzeno", en: "Confirmed" },
  IN_TRANSIT: { cs: "Na cestě", en: "In transit" },
  DONE: { cs: "Hotovo", en: "Done" },
  CANCELLED: { cs: "Zrušeno", en: "Cancelled" },
  PLANNED: { cs: "Naplánováno", en: "Planned" },
  PICKED_UP: { cs: "Naloženo", en: "Picked up" },
  AT_HUB: { cs: "Ve skladu", en: "At the warehouse" },
  ON_LINEHAUL: { cs: "Na linehaulu", en: "On line haul" },
  OUT_FOR_DELIVERY: { cs: "Na rozvozu", en: "Out for delivery" },
  DELIVERED: { cs: "Doručeno", en: "Delivered" },
  POD_RECEIVED: { cs: "POD přijat", en: "POD received" },
  READY_TO_BILL: { cs: "Hotovo", en: "Done" },
};

/** An order status in both languages; one the portal does not know is shown as sent. */
export const orderStatusText = (status: string): BiText => ORDER_STATUS[status] ?? { cs: status, en: status };

export const STAMP_LABEL: Record<PortalStampKind, BiText> = {
  LOADED: { cs: "Naloženo", en: "Picked up" },
  DEPARTED: { cs: "Odjezd", en: "Departed" },
  ARRIVED: { cs: "Příjezd", en: "Arrived" },
};

const STAMP_FIELD = { LOADED: "loaded", DEPARTED: "departed", ARRIVED: "arrived" } as const;

/** When the stamp was given, or null. */
export const stampAt = (stamps: PortalOrder["stamps"], kind: PortalStampKind): string | null => stamps[STAMP_FIELD[kind]];

/**
 * The stamps a haulier gives an order: Picked up only where it picks the goods up itself (FTL, pick-up
 * run; a line haul and a delivery run are loaded by our warehouse), Departed and Arrived on the runs
 * and line hauls. An FTL order follows its consignment instead (Picked up, then Delivered and the POD at
 * the stop), and a partner delivery has only its stops' Delivered.
 */
export function stampKinds(kind: PortalOrderItem["kind"]): PortalStampKind[] {
  if (kind === "FTL") return ["LOADED"];
  if (kind === "PICKUP_RUN") return ["LOADED", "DEPARTED", "ARRIVED"];
  if (kind === "LINEHAUL" || kind === "DELIVERY_RUN") return ["DEPARTED", "ARRIVED"];
  return [];
}

const REJECTED_TEXT: BiText = { cs: "Objednávka byla odmítnuta.", en: "The order was rejected." };

/** Why the stamp cannot be given now, or null. Server refusals are shown on top of these. */
export function stampProblem(order: Pick<PortalOrder, "confirmation" | "stamps">, kind: PortalStampKind, formatAt: (iso: string) => string): BiText | null {
  if (order.confirmation.status === "REJECTED") return REJECTED_TEXT;
  const done = stampAt(order.stamps, kind);
  if (done) return { cs: `Zaznamenáno ${formatAt(done)}.`, en: `Stamped ${formatAt(done)}.` };
  if (kind === "ARRIVED" && !order.stamps.departed) return { cs: "Nejdřív zaznamenejte odjezd.", en: "Stamp the departure first." };
  return null;
}

/** Confirm / reject is asked once, on a trip that waits for it. */
export const canRespond = (order: Pick<PortalOrder, "kind" | "confirmation">) => order.kind !== "PARTNER_DELIVERY" && order.confirmation.status === "AWAITING";

/** Why a delivery stop cannot be stamped Delivered, or null. */
export function deliveredProblem(order: Pick<PortalOrder, "confirmation">, stop: Pick<PortalStop, "kind" | "deliveredAt">, formatAt: (iso: string) => string): BiText | null {
  if (order.confirmation.status === "REJECTED") return REJECTED_TEXT;
  if (stop.kind !== "DELIVERY") return { cs: "Jen u vykládky.", en: "Delivery stops only." };
  if (stop.deliveredAt) return { cs: `Doručeno ${formatAt(stop.deliveredAt)}.`, en: `Delivered ${formatAt(stop.deliveredAt)}.` };
  return null;
}

/** The POD rule (owner decision 13): once the order is confirmed, one per stop; the dispatcher replaces it. */
export const POD_RULE: BiText = {
  cs: "POD lze nahrát až po potvrzení objednávky, jeden na každou vykládku. Opravu provede dispečer.",
  en: "The POD can be uploaded once the order is confirmed, one per delivery stop. The dispatcher replaces it if needed.",
};

/** The POD is uploaded once per delivery stop, once the order is confirmed (a partner delivery counts as confirmed). */
export const canUploadStopPod = (order: Pick<PortalOrder, "confirmation">, stop: Pick<PortalStop, "kind" | "podUploaded">) =>
  order.confirmation.status === "CONFIRMED" && stop.kind === "DELIVERY" && !stop.podUploaded;

/** Why a rejection cannot be sent yet, or null. */
export const rejectProblem = (reason: string): BiText | null =>
  reason.trim().length < 3 ? { cs: "Uveďte důvod odmítnutí.", en: "Give the reason for rejecting." } : null;

/** The receiver's name a Delivered stamp needs. */
export const receiverProblem = (name: string): BiText | null => (name.trim().length < 2 ? { cs: "Vyplňte jméno příjemce.", en: "Enter the receiver's name." } : null);

/**
 * The server's "needs action" line ("Confirm the order", "Upload POD for 2 stops") with its Czech
 * words; a line the portal does not know is shown in English only.
 */
export function needsActionText(needsAction: string | null): BiText | null {
  const text = needsAction?.trim();
  if (!text) return null;
  if (/^confirm the order$/i.test(text)) return { cs: "Potvrďte objednávku", en: text };
  const pod = text.match(/^upload pod for (\d+) stops?$/i);
  if (pod) {
    const n = Number(pod[1]);
    return { cs: `Nahrajte POD (${n} ${n === 1 ? "zastávka" : n < 5 ? "zastávky" : "zastávek"})`, en: text };
  }
  return { cs: text, en: text };
}

/** "Street, 110 00 City" of a stop. */
export const stopAddress = (stop: Pick<PortalStop, "street" | "postcode" | "city">) =>
  [stop.street, [stop.postcode, stop.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

// ── Password ──

export const MIN_PASSWORD_LENGTH = 12;

export const PASSWORD_RULES: BiText[] = [
  { cs: `Alespoň ${MIN_PASSWORD_LENGTH} znaků`, en: `At least ${MIN_PASSWORD_LENGTH} characters` },
  { cs: "Nesmí být stejné jako váš e-mail", en: "Not the same as your e-mail" },
];

/** Why the new password cannot be set, or null. The e-mail is checked when known (the server always checks it). */
export function passwordProblem(password: string, confirm: string, email = ""): BiText | null {
  if (password.length < MIN_PASSWORD_LENGTH) return { cs: `Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`, en: `The password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (email.trim() && password.trim().toLowerCase() === email.trim().toLowerCase()) return { cs: "Heslo nesmí být váš e-mail.", en: "The password cannot be your e-mail." };
  if (password !== confirm) return { cs: "Hesla se neshodují.", en: "The passwords do not match." };
  return null;
}

// ── App side: the haulier's portal users ──

export const PORTAL_USER_STATUS: Record<interfaces.PortalUserItem["status"], { label: string; tone: "green" | "amber" | "red" | "slate"; hint: string }> = {
  INVITED: { label: "Invited", tone: "amber", hint: "Has not set a password yet" },
  ACTIVE: { label: "Active", tone: "green", hint: "Can sign in to the haulier portal" },
  LOCKED: { label: "Locked", tone: "red", hint: "Too many wrong passwords — locked for 15 minutes" },
  DISABLED: { label: "Disabled", tone: "slate", hint: "Cannot sign in until a manager enables it" },
};

/** Why a new portal user cannot be added yet, or null. */
export function portalUserProblem(draft: { email: string; name: string }): string | null {
  if (draft.name.trim().length < 2) return "Enter the name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return "Enter a valid e-mail";
  return null;
}
