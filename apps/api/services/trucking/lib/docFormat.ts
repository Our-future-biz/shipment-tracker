// Pure helpers for the trucking documents (transport order, consignment note): label texts in
// Czech and English, number and date formatting per language, and word wrapping. No pdf-lib, so
// everything here is unit-tested without building a PDF.

import type { DocLanguage, DocParty, DocStop } from "./documentTypes";

/** Every printed label as [Czech, English]. */
const LABELS = {
  transportOrder: ["Přepravní příkaz", "Transport order"],
  consignmentNote: ["Nákladní list", "Consignment note"],
  domesticCarriage: ["Vnitrostátní silniční přeprava", "Domestic road carriage"],
  issued: ["Vystaveno", "Issued"],
  forwarder: ["Zasílatel", "Forwarder"],
  haulier: ["Dopravce", "Haulier"],
  consignmentRef: ["Zásilka", "Consignment"],
  jobNo: ["Zakázka", "Job no."],
  plannedPickup: ["Plánovaná nakládka", "Planned pick-up"],
  loadingPlace: ["Místo nakládky", "Loading place"],
  unloadingPlace: ["Místo vykládky", "Unloading place"],
  address: ["Adresa", "Address"],
  timeWindow: ["Časové okno", "Time window"],
  contact: ["Kontakt", "Contact"],
  reference: ["Reference", "Reference"],
  notes: ["Poznámky", "Notes"],
  avizace: ["Avízo", "Pre-advice"],
  avizaceRequired: ["Avízo nutné", "Avizace required"],
  load: ["Zboží", "Load"],
  pieces: ["Počet kusů", "Pieces"],
  palletPlaces: ["Paletová místa", "Pallet places"],
  pallets: ["palet", "pallets"],
  ldm: ["LDM", "LDM"],
  weight: ["Hmotnost", "Weight"],
  volume: ["Objem", "Volume"],
  description: ["Popis zboží", "Description"],
  handling: ["Manipulace", "Handling"],
  nonStackable: ["Nestohovatelné", "Non-stackable"],
  tailLift: ["Nutné hydraulické čelo", "Tail lift required"],
  adrTitle: ["ADR – nebezpečné věci", "ADR – dangerous goods"],
  unNumber: ["UN číslo", "UN number"],
  adrClass: ["Třída", "Class"],
  packingGroup: ["Obalová skupina", "Packing group"],
  vehicle: ["Vozidlo a řidič", "Vehicle and driver"],
  vehicleType: ["Vozidlo", "Vehicle"],
  plates: ["SPZ", "Plates"],
  driver: ["Řidič", "Driver"],
  price: ["Cena a platba", "Price and payment"],
  agreedPrice: ["Sjednaná cena", "Agreed price"],
  priceNote: ["Poznámka k ceně", "Price note"],
  paymentTerms: ["Platební podmínky", "Payment terms"],
  pickupPin: ["PIN pro nakládku", "Pick-up PIN"],
  pinHint: [
    "Řidič sdělí tento PIN na místě nakládky. Nesdělujte jej nikomu dalšímu.",
    "The driver gives this PIN at the loading place. Do not share it with anyone else.",
  ],
  pod: ["Potvrzení a doklad o doručení (POD)", "Confirmation and proof of delivery (POD)"],
  podHint: ["Potvrďte příkaz a nahrajte POD na adrese:", "Confirm the order and upload the POD at:"],
  terms: ["Podmínky", "Terms and conditions"],
  forForwarder: ["Za zasílatele", "For the forwarder"],
  forHaulier: ["Za dopravce", "For the haulier"],
  signatureStamp: ["Podpis a razítko", "Signature and stamp"],
  date: ["Datum", "Date"],
  ico: ["IČO", "Reg. no."],
  dic: ["DIČ", "VAT no."],
  continued: ["pokračování", "continued"],
  cmr1: ["Odesílatel (jméno, adresa)", "Sender (name, address)"],
  cmr2: ["Příjemce (jméno, adresa)", "Consignee (name, address)"],
  cmr3: ["Místo určení (vykládky)", "Place of delivery of the goods"],
  cmr4: ["Místo a datum převzetí zboží", "Place and date of taking over the goods"],
  cmr5: ["Přiložené doklady", "Documents attached"],
  cmr6: ["Značky a čísla", "Marks and numbers"],
  cmr7: ["Počet kusů", "Number of packages"],
  cmr8: ["Způsob balení", "Method of packing"],
  cmr9: ["Označení zboží", "Nature of the goods"],
  cmr10: ["Statistické číslo", "Statistical number"],
  cmr11: ["Hrubá hmotnost kg", "Gross weight kg"],
  cmr12: ["Objem m³", "Volume m³"],
  cmr13: ["Pokyny odesílatele", "Sender's instructions"],
  cmr14: ["Pokyny k placení přepravného", "Instructions as to payment for carriage"],
  cmr15: ["Dobírka", "Cash on delivery"],
  cmr16: ["Dopravce (jméno, adresa, SPZ)", "Carrier (name, address, plates)"],
  cmr17: ["Další dopravci", "Successive carriers"],
  cmr18: ["Výhrady a poznámky dopravce", "Carrier's reservations and observations"],
  cmr19: ["Zvláštní ujednání", "Special agreements"],
  cmr20: ["Platí", "To be paid by"],
  cmr21: ["Místo a datum vystavení", "Established in (place) and on (date)"],
  cmr22: ["Podpis a razítko odesílatele", "Signature and stamp of the sender"],
  cmr23: ["Podpis a razítko dopravce", "Signature and stamp of the carrier"],
  cmr24: ["Zboží převzal: místo, datum, podpis a razítko příjemce", "Goods received: place, date, signature and stamp of the consignee"],
} as const satisfies Record<string, readonly [string, string]>;

export type LabelKey = keyof typeof LABELS;

/** The label in the document's language; "both" gives "Czech / English". */
export function label(lang: DocLanguage, key: LabelKey): string {
  const [cs, en] = LABELS[key];
  if (lang === "cs") return cs;
  if (lang === "en") return en;
  return cs === en ? cs : `${cs} / ${en}`;
}

/** A document title as a main line and, in "both", a smaller English line under it. */
export function titleLines(lang: DocLanguage, key: LabelKey): { main: string; sub: string } {
  const [cs, en] = LABELS[key];
  if (lang === "both") return { main: cs, sub: en };
  return { main: lang === "cs" ? cs : en, sub: "" };
}

/** English formatting only for an English-only document; Czech and bilingual ones use Czech style. */
const isEnglish = (lang: DocLanguage) => lang === "en";

/**
 * 1250.5 -> "1 250,5" (cs) or "1,250.5" (en), at most `maxDecimals` decimals, trailing zeros
 * dropped. Plain spaces so every font can print them.
 */
export function formatNumber(value: number, lang: DocLanguage, maxDecimals = 2): string {
  const n = Number.isFinite(value) ? value : 0;
  const fixed = Math.abs(n).toFixed(maxDecimals);
  const [int, dec = ""] = fixed.split(".");
  const decimals = dec.replace(/0+$/, "");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, isEnglish(lang) ? "," : " ");
  const sign = n < 0 && Number(fixed) !== 0 ? "-" : "";
  return `${sign}${grouped}${decimals ? (isEnglish(lang) ? "." : ",") + decimals : ""}`;
}

/** 1250.5, "kg" -> "1 250,5 kg" */
export function formatQuantity(value: number, unit: string, lang: DocLanguage, maxDecimals = 2): string {
  return `${formatNumber(value, lang, maxDecimals)} ${unit}`;
}

/** Money always with two decimals: 12500, "CZK" -> "12 500,00 CZK" (cs) or "12,500.00 CZK" (en). */
export function formatMoney(total: number, currency: string, lang: DocLanguage): string {
  const s = formatNumber(total, lang, 2);
  const sep = isEnglish(lang) ? "." : ",";
  const [int, dec = ""] = s.split(sep);
  return `${int}${sep}${dec.padEnd(2, "0")} ${currency}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The calendar day in Prague of a "YYYY-MM-DD" or a full ISO timestamp; null when unreadable. */
function pragueDay(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "2026-10-16" (or an ISO timestamp) -> "16. 10. 2026" (cs, both) or "16 Oct 2026" (en). */
export function formatDate(value: string, lang: DocLanguage): string {
  const day = pragueDay(value);
  if (!day) return value;
  const [y, m, d] = day.split("-").map(Number);
  return isEnglish(lang) ? `${d} ${MONTHS[m! - 1]} ${y}` : `${d}. ${m}. ${y}`;
}

/**
 * Splits text into lines no wider than `maxWidth` as measured by `widthOf`. Keeps the text's own
 * line breaks; a single word longer than the line is cut.
 */
export function wrapText(text: string, maxWidth: number, widthOf: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (rest.length > 1 && widthOf(rest) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && widthOf(rest.slice(0, cut)) > maxWidth) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

/** "110 00 Praha 1" plus the country when it is not CZ; empty parts left out. */
function cityLine(postcode: string, city: string, country: string): string {
  const place = [postcode, city].filter(Boolean).join(" ");
  return country && country !== "CZ" ? [place, country].filter(Boolean).join(", ") : place;
}

/** Street and city as two lines, or as one ("Řeznická 12, 110 00 Praha 1") for a compact form. */
function addressLines(street: string, city: string, oneLine: boolean): string[] {
  return oneLine ? [[street, city].filter(Boolean).join(", ")] : [street, city];
}

/** Name, address and registration lines of a party. */
export function partyLines(p: DocParty, lang: DocLanguage, oneLineAddress = false): string[] {
  const lines = [p.name, ...addressLines(p.street, cityLine(p.postcode, p.city, p.country), oneLineAddress)];
  const ids = [p.ico && `${label(lang, "ico")}: ${p.ico}`, p.dic && `${label(lang, "dic")}: ${p.dic}`].filter(Boolean).join("   ");
  return [...lines, ids, p.contact].filter(Boolean);
}

/** Name and address lines of a loading or unloading place. */
export function stopAddressLines(s: DocStop, oneLineAddress = false): string[] {
  return [s.name, ...addressLines(s.street, cityLine(s.postcode, s.city, s.country), oneLineAddress)].filter(Boolean);
}
