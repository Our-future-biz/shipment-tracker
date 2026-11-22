import type { interfaces } from "@/lib/api/client";
import type { BiText } from "@/app/haulier/_lib/publicOrder";

// The words of the customer's tracking page, in Czech and English like the haulier's pages (user
// council E10: the page was English only). Czech first, English after it. The step names the server
// sends are put into Czech here by their English name; one this page does not know stays English
// only. Pure, tested in statusText.test.ts.

type State = interfaces.PublicMilestone["state"];
type Status = interfaces.PublicShipmentStatus;

export const LEG_TITLES: { key: string; text: BiText }[] = [
  { key: "origin", text: { cs: "Odeslání", en: "Origin" } },
  { key: "main", text: { cs: "Hlavní přeprava", en: "Main leg" } },
  { key: "destination", text: { cs: "Doručení", en: "Destination" } },
];

/**
 * A step's state as the staff's customer-view preview says it (customerStateName), in both languages.
 * `passed`: an open step whose planned day is behind us - a cut-off (Cargo, VGM, SI closing), which
 * has no actual, or an earlier step nobody noted. "Planned" with a past date reads as still to come,
 * so it says the day passed instead (mock council S3-3).
 */
export function stateText(state: State, hasPlanned: boolean, passed = false): BiText {
  if (state === "done") return { cs: "Hotovo", en: "Done" };
  if (state === "next") return { cs: "Další krok", en: "Next step" };
  if (state === "unconfirmed") return { cs: "Zatím nepotvrzeno", en: "Not yet confirmed" };
  if (hasPlanned && passed) return { cs: "Termín uplynul", en: "Date passed" };
  return hasPlanned ? { cs: "Plánováno", en: "Planned" } : { cs: "Teprve nastane", en: "Still to come" };
}

/** Whether an open step's planned day (YYYY-MM-DD…) is before `today` (YYYY-MM-DD, Prague): its date then reads without "Planned". */
export const plannedPassed = (m: Pick<interfaces.PublicMilestone, "state" | "planned">, today: string): boolean =>
  m.state === "open" && !!m.planned && m.planned.slice(0, 10) < today;

// The step names of the tracking timeline (shipments lib/trackingTimeline and trackingEvents), by mode.
const STEP_CS: Record<string, string> = {
  "Booking confirmed": "Rezervace potvrzena",
  "Cargo ready": "Zboží připraveno",
  "Picked up": "Vyzvednuto",
  "Equipment delivery / pick-up": "Přistavení / vyzvednutí kontejneru",
  "Loaded on board": "Naloženo na loď",
  "Loaded on the flight": "Naloženo do letadla",
  "Loaded on the train": "Naloženo na vlak",
  Departed: "Odjezd",
  "Departed the terminal": "Odjezd z terminálu",
  Arrived: "Příjezd",
  "Arrived at the terminal": "Příjezd na terminál",
  Discharged: "Vyloženo",
  Unloaded: "Vyloženo",
  "Ready for pick-up": "Připraveno k vyzvednutí",
  "Left the terminal": "Opustilo terminál",
  "Left the airport": "Opustilo letiště",
  "Arrived at HUB": "Přijato v našem skladu",
  "Customs cleared": "Celně odbaveno",
  "Gate in": "Příjem do skladu",
  "Gate out": "Výdej ze skladu",
  Delivered: "Doručeno",
  "Delivery advised": "Doručení avizováno",
  "POD received": "Potvrzení o doručení přijato",
  "Empty returned": "Prázdný kontejner vrácen",
  "Haulier confirmed": "Dopravce potvrdil",
  "Cargo closing": "Uzávěrka zboží",
  "VGM closing": "Uzávěrka VGM",
  "SI closing": "Uzávěrka SI",
};

/** A step's name in both languages; one not known here stays English only (cs ""). */
export const stepText = (label: string): BiText => ({ cs: STEP_CS[label] ?? "", en: label });

const DIRECTION_CS: Record<string, string> = { import: "Import", export: "Export", domestic: "Vnitrostátní", "cross trade": "Cross trade" };
const MODE_CS: Record<string, string> = {
  "sea freight": "Námořní přeprava",
  "air freight": "Letecká přeprava",
  "rail freight": "Železniční přeprava",
  "road freight": "Silniční přeprava",
};

/** Direction and freight mode in both languages ("Import · Sea Freight"); a value not known here stays as stored. */
export function kindText(s: Pick<Status, "direction" | "freightMode">): BiText {
  const parts = [s.direction, s.freightMode].map((v) => v.trim()).filter(Boolean);
  const cs = parts.map((v) => DIRECTION_CS[v.toLowerCase()] ?? MODE_CS[v.toLowerCase()] ?? v);
  return { cs: cs.join(" · "), en: parts.join(" · ") };
}

const same = (a: string, b: string) => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return !!x && !!y && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `) || x.startsWith(`${y}(`) || y.startsWith(`${x}(`));
};

/**
 * The whole route: where the goods start, the ports, where they end ("Ningbo (CNNBO) → Hamburg
 * (DEHAM) → Praha"). A place the next one already names ("Hamburg" before "Hamburg (DEHAM)") is
 * said once, keeping the longer name.
 */
export function routeText(s: Pick<Status, "origin" | "pol" | "pod" | "destination">): string {
  const out: string[] = [];
  for (const raw of [s.origin, s.pol, s.pod, s.destination]) {
    const place = raw.trim();
    if (!place) continue;
    const last = out[out.length - 1];
    if (last !== undefined && same(last, place)) {
      if (place.length > last.length) out[out.length - 1] = place;
      continue;
    }
    out.push(place);
  }
  return out.join(" → ");
}

/** "3 Pallets · 1,200 kg" (the package type as stored; "3 ks / pcs" without one): what travels; "" when nothing is known. */
export function cargoText(s: Pick<Status, "pieces" | "packageType" | "weightKg">): string {
  const pieces = s.pieces.trim();
  const type = s.packageType.trim();
  const weight = s.weightKg.trim() ? `${s.weightKg.trim()} kg` : "";
  return [pieces ? `${pieces} ${type || "ks / colli"}` : "", weight].filter(Boolean).join(" · ");
}

/**
 * Whom the customer asks about the shipment: our company, with its phone and e-mail when set
 * (never a person). null when the company's name could not be read.
 */
export function contactText(s: Pick<Status, "ourCompany" | "ourPhone" | "ourEmail" | "reference">): { lead: BiText; ways: string[] } | null {
  if (!s.ourCompany.trim()) return null;
  return {
    lead: { cs: `Dotazy k zásilce ${s.reference}: ${s.ourCompany}`, en: `Questions about ${s.reference}: ${s.ourCompany}` },
    ways: [s.ourPhone, s.ourEmail].map((v) => v.trim()).filter(Boolean),
  };
}

export const TEXT = {
  shipment: { cs: "Zásilka", en: "Shipment" },
  yourReference: { cs: "Vaše reference", en: "Your reference" },
  planned: { cs: "Plán", en: "Planned" },
  notConfirmed: { cs: "zatím nepotvrzeno", en: "not yet confirmed" },
  cargo: { cs: "Zboží", en: "Cargo" },
  linkInvalid: { cs: "Tento odkaz již neplatí.", en: "This link is no longer valid." },
  loadFailed: { cs: "Stránku se nepodařilo načíst. Zkuste to prosím za chvíli.", en: "Could not load this page. Please try again in a moment." },
  tryAgain: { cs: "Zkusit znovu", en: "Try again" },
} satisfies Record<string, BiText>;

/** "As of …, Prague time." in both languages. */
export const asOfText = (when: string): BiText => ({
  cs: `Stav k ${when} (pražský čas). Termíny se během přepravy mohou změnit.`,
  en: `As of ${when}, Prague time. Dates may change while the shipment is under way.`,
});
