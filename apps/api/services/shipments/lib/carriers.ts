// The carrier a Shipping Line text names, as its SCAC code (Council Outlay 8, D19). The text stays as
// people typed it; the code is what a tracking source would ask by later. Co-loaders have none, and
// neither has anything not on this list: an empty code means "not known", never "wrong".
// The codes were written from memory on 6 Nov 2026 and are still to be checked by the ocean desk.

const CARRIERS: readonly { code: string; names: RegExp }[] = [
  { code: "MAEU", names: /\b(maersk|mærsk|sealand)\b/ },
  { code: "MSCU", names: /\b(msc|mediterranean shipping)\b/ },
  { code: "CMDU", names: /\b(cma cgm|cma|cgm)\b/ },
  { code: "HLCU", names: /\b(hapag lloyd|hapag|hlag)\b/ },
  { code: "SUDU", names: /\b(hamburg sud|hamburg süd)\b/ },
  { code: "ONEY", names: /^one( line)?$|\bocean network express\b/ },
  { code: "COSU", names: /\bcosco\b/ },
  { code: "OOLU", names: /\b(oocl|orient overseas)\b/ },
  { code: "EGLV", names: /\bevergreen\b/ },
  { code: "YMLU", names: /\byang ming\b/ },
  { code: "HDMU", names: /\b(hmm|hyundai merchant)\b/ },
  { code: "ZIMU", names: /\bzim\b/ },
  { code: "PABV", names: /\b(pil|pacific international lines)\b/ },
  { code: "APLU", names: /\b(apl|american president lines)\b/ },
  { code: "SMLM", names: /\b(sm line|sm lines)\b/ },
  { code: "WHLC", names: /\bwan hai\b/ },
  { code: "MATS", names: /\bmatson\b/ },
];

const CODES: ReadonlySet<string> = new Set(CARRIERS.map((c) => c.code));

/** The SCAC of the carrier a Shipping Line text names; "" when it names none we know. */
export function carrierCodeOf(shippingLine: string | null | undefined): string {
  const typed = (shippingLine ?? "").trim();
  if (CODES.has(typed.toUpperCase())) return typed.toUpperCase();
  const text = typed.toLowerCase().replace(/[-_.,/]+/g, " ").replace(/\s+/g, " ").trim();
  return CARRIERS.find((c) => c.names.test(text))?.code ?? "";
}
