import type { ShipmentItem } from "@/hooks/useShipments";
import type { TrackingMilestone } from "@/hooks/useShipmentTracking";
import { formatDate } from "@/lib/date";
import { shipmentEmailSubject } from "../../../_lib/shipmentEmail";

// The message Tell the customer starts from: the app can't send e-mail, so it drafts one for the
// user's own mail program, in English or Czech, and each user may keep their own wording of each
// kind. Placeholders are filled in from the shipment. Pure, so it is unit-tested.

export type NoticeLanguage = "en" | "cs";

export const NOTICE_KIND_OPTIONS = [
  { value: "status", label: "Status update" },
  { value: "arrival_notice", label: "Arrival notice" },
  { value: "eta_change", label: "ETA change" },
  { value: "delivery_advice", label: "Delivery advice" },
  { value: "pod_sent", label: "POD sent" },
  { value: "draft_sent", label: "BoL draft sent" },
  { value: "bl_provided", label: "Bill of Lading provided" },
] as const;

export type NoticeKindValue = (typeof NOTICE_KIND_OPTIONS)[number]["value"];

export interface DraftText {
  subject: string;
  message: string;
}

const SUBJECT = "{reference}";

const OPENING: Record<NoticeLanguage, string> = { en: "Dear {contact},", cs: "Dobrý den {contact}," };
const CLOSING: Record<NoticeLanguage, string> = { en: "Best regards,\n{sender}", cs: "S pozdravem\n{sender}" };

const BODY: Record<NoticeKindValue, Record<NoticeLanguage, { subject: string; lead: string }>> = {
  status: {
    en: { subject: "status", lead: "Here is the status of your shipment {reference}." },
    cs: { subject: "stav zásilky", lead: "posíláme stav Vaší zásilky {reference}." },
  },
  arrival_notice: {
    en: { subject: "arrival notice", lead: "Your shipment {reference} is due to arrive on {eta}." },
    cs: { subject: "avízo příjezdu", lead: "Vaše zásilka {reference} má dorazit {eta}." },
  },
  eta_change: {
    en: { subject: "new ETA {eta}", lead: "The estimated arrival of your shipment {reference} has changed to {eta}." },
    cs: { subject: "nové ETA {eta}", lead: "předpokládaný příjezd Vaší zásilky {reference} se změnil na {eta}." },
  },
  delivery_advice: {
    en: { subject: "delivery advice", lead: "Your shipment {reference} is planned for delivery on {delivery}." },
    cs: { subject: "avízo doručení", lead: "doručení Vaší zásilky {reference} plánujeme na {delivery}." },
  },
  pod_sent: {
    en: { subject: "proof of delivery", lead: "Please find attached the proof of delivery of your shipment {reference}." },
    cs: { subject: "doklad o doručení", lead: "v příloze posíláme doklad o doručení Vaší zásilky {reference}." },
  },
  draft_sent: {
    en: { subject: "Bill of Lading draft", lead: "Please find attached the Bill of Lading draft of your shipment {reference}. Please check it and let us know." },
    cs: { subject: "návrh konosamentu", lead: "v příloze posíláme návrh konosamentu Vaší zásilky {reference}. Prosíme o kontrolu a potvrzení." },
  },
  bl_provided: {
    en: { subject: "Bill of Lading", lead: "Please find attached the Bill of Lading of your shipment {reference}." },
    cs: { subject: "konosament", lead: "v příloze posíláme konosament Vaší zásilky {reference}." },
  },
};

/** The built-in wording of a kind, with its placeholders. */
export function standardDraft(kind: NoticeKindValue, language: NoticeLanguage): DraftText {
  const body = BODY[kind][language];
  return {
    subject: `${SUBJECT} · ${body.subject}`,
    message: `${OPENING[language]}\n\n${body.lead}\n\n{facts}\n\n${CLOSING[language]}`,
  };
}

const FACT_LABELS: Record<NoticeLanguage, { mode: string; containers: string; route: string; etd: string; atd: string; eta: string; ata: string; hub: string; delivery: string }> = {
  en: { mode: "Mode", containers: "Containers", route: "Route", etd: "ETD", atd: "ATD", eta: "ETA", ata: "ATA", hub: "ETA warehouse", delivery: "Planned delivery" },
  cs: { mode: "Doprava", containers: "Kontejnery", route: "Trasa", etd: "ETD", atd: "ATD", eta: "ETA", ata: "ATA", hub: "ETA sklad", delivery: "Plánované doručení" },
};

// With no person to name: Czech says hello without a name, English needs someone to be dear.
const NO_CONTACT: Record<NoticeLanguage, string> = { en: "Sir or Madam", cs: "" };

export type DraftValues = Record<"contact" | "reference" | "eta" | "delivery" | "facts" | "sender", string>;

/** What each placeholder stands for on this shipment. */
export function draftValues(
  shipment: ShipmentItem,
  milestones: readonly TrackingMilestone[],
  language: NoticeLanguage,
  contactName: string,
  sender: string,
): DraftValues {
  const row = (key: string) => milestones.find((m) => m.key === key);
  const labels = FACT_LABELS[language];
  const departed = row("departed");
  const arrived = row("arrived");
  const delivered = row("delivered");
  const containers = (shipment.containers ?? []).map((c) => c.containerNumber).filter(Boolean).join(", ");
  const facts: [string, string][] = [
    [labels.mode, [shipment.freightMode, shipment.tradeDirection].filter(Boolean).join(" ")],
    [labels.containers, containers],
    [labels.route, [shipment.pol, shipment.pod].filter(Boolean).join(" → ")],
    departed?.actual ? [labels.atd, formatDate(departed.actual)] : [labels.etd, formatDate(departed?.planned)],
    arrived?.actual ? [labels.ata, formatDate(arrived.actual)] : [labels.eta, formatDate(arrived?.planned)],
    [labels.hub, formatDate(shipment.etaWarehouse)],
    [labels.delivery, formatDate(delivered?.planned)],
  ];
  return {
    contact: contactName.trim() || NO_CONTACT[language],
    reference: shipmentEmailSubject(shipment),
    eta: formatDate(arrived?.planned),
    delivery: formatDate(delivered?.planned),
    facts: facts.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n"),
    sender,
  };
}

/** The wording with its placeholders filled in; a line left with nothing to say loses its stray marks. */
export function fillDraft(text: DraftText, values: DraftValues): DraftText {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key as keyof DraftValues] : whole));
  return {
    subject: fill(text.subject).replace(/ · $/, "").trim(),
    message: fill(text.message).replace(/ +,/g, ",").replace(/\n{3,}/g, "\n\n"),
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The other way round: what a user wrote, with this shipment's values back as placeholders, to keep
 * as their wording. Only a value standing as a whole word goes back ("Eva" in "Evaluation" stays),
 * and a value two placeholders share (the ETA on the day of the planned delivery) stays as written:
 * which one was meant can't be told.
 */
export function toTemplate(text: DraftText, values: DraftValues): DraftText {
  const keysOf = new Map<string, (keyof DraftValues)[]>();
  for (const [key, value] of Object.entries(values) as [keyof DraftValues, string][]) {
    if (!value.trim()) continue;
    keysOf.set(value, [...(keysOf.get(value) ?? []), key]);
  }
  const keyOf = new Map([...keysOf].filter(([, keys]) => keys.length === 1).map(([value, [key]]) => [value, key!]));
  if (keyOf.size === 0) return { ...text };
  // The longest first, in one pass: a reference or the facts can hold the shorter values.
  const alternatives = [...keyOf.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  const back = (s: string) => s.replace(pattern, (value) => `{${keyOf.get(value)}}`);
  return { subject: back(text.subject), message: back(text.message) };
}
