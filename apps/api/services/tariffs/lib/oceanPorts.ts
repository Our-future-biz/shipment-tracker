import { fold, resolveCountryCode } from "../../../lib/geo/format";
import type { OceanPlace } from "../interfaces/interfaces";

// The ports a shipping line's tariff names in one cell, and which UN/LOCODE place a name means. A
// cell can name several ports ("HAM / WVN / RTM", "Koper; Trieste", "Kobe / Nagoya / Tokyo") and
// carry remarks ("Nansha (in t/s via PKG/SIN)", "RTM in t/s via ANR", "Apapa (Lagos - Nigeria)*").
// Pure.

/** One port of a cell: its name for matching, the country the cell names with it, and its remarks. */
export interface PortToken {
  name: string;
  /** ISO code; null when the cell names none */
  country: string | null;
  note: string;
}

// Stand-ins while a cell is split: the slash of "t/s", and a slash or semicolon inside brackets.
const TS = "\u0000";
const SL = "\u0001";
const SC = "\u0002";
const restore = (text: string) => text.replaceAll(TS, "/").replaceAll(SL, "/").replaceAll(SC, ";");
const VIA = new RegExp(`\\s+(?:in\\s+)?t${TS}s\\s+via\\s+(.+)$`, "i");

// A country named in a remark: "(Ghana)", "(Lagos - Nigeria)".
function countryInNote(note: string): string | null {
  for (const part of note.split(/\s*[-–,]\s*/)) {
    const code = resolveCountryCode(part);
    if (code) return code;
  }
  return null;
}

function token(raw: string): PortToken | null {
  const notes: string[] = [];
  let text = raw.replace(/\*+/g, " ").trim();
  text = text.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    notes.push(inner.trim());
    return " ";
  });
  const via = VIA.exec(text);
  if (via) {
    notes.push(`in t/s via ${via[1]!.trim()}`);
    text = text.slice(0, via.index);
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const country = (parts.length > 1 ? resolveCountryCode(parts[parts.length - 1]!) : null) ?? notes.map(countryInNote).find((c) => c !== null) ?? null;
  const note = notes.map(restore).filter(Boolean).join("; ");
  return { name: restore(parts[0]!), country, note };
}

/**
 * The ports a cell names. Ports are split at ";" and, where a part names no country after a comma,
 * at "/" too ("t/s" and slashes in brackets are no split). A remark in brackets or "in t/s via …"
 * goes to the note; the country after the last comma, or in a remark, to the country.
 */
export function splitPorts(cell: string): PortToken[] {
  const protectedText = cell.replace(/\bt\/s\b/gi, `t${TS}s`).replace(/\([^)]*\)/g, (m) => m.replaceAll("/", SL).replaceAll(";", SC));
  return protectedText
    .split(";")
    .flatMap((part) => (part.includes(",") ? [part] : part.split("/")))
    .map(token)
    .filter((t): t is PortToken => t !== null);
}

/**
 * The ways a port name may be written in the place list: as it is, without "City" or "-shi", and
 * in one word ("Hai Phong" → "Haiphong", "Cebu City" → "Cebu", "Hitachinaka-shi" → "Hitachinaka").
 */
export function nameVariants(name: string): string[] {
  const plain = name.replace(/\s+city$/i, "").replace(/-shi$/i, "").trim();
  return [...new Set([name, plain, plain.replace(/\s+/g, "")].filter((v) => v.length >= 2))];
}

/** The countries a port may be listed under: a tariff writes Hong Kong and Macao as China. */
export function countriesFor(countries: readonly string[]): string[] {
  return countries.includes("CN") ? [...new Set([...countries, "HK", "MO"])] : [...countries];
}

// A place's name as compared: without what follows a comma or stands in brackets ("Nagoya, Aichi" → "nagoya").
const placeName = (name: string) => fold(name.replace(/\s*\(.*\)\s*$/, "").split(",")[0]!);

/**
 * The place a name means among the place list's candidates, in the allowed countries: the one place
 * of exactly that name (in any of its ways of writing; case, accents and punctuation aside); else
 * the one whose name is that before a comma or bracket ("Nagoya, Aichi"); else the only candidate
 * there is. Null when none or several could be meant: a user picks.
 */
export function placeFor(name: string, countries: readonly string[], candidates: readonly OceanPlace[]): OceanPlace | null {
  const allowedCountries = countriesFor(countries);
  const allowed = candidates.filter((c) => !allowedCountries.length || allowedCountries.includes(c.countryCode));
  const names = new Set(nameVariants(name).map(fold));
  const codes = (list: readonly OceanPlace[]) => [...new Set(list.map((c) => c.code))];
  for (const same of [(c: OceanPlace) => names.has(fold(c.name)), (c: OceanPlace) => names.has(placeName(c.name))]) {
    const matching = allowed.filter(same);
    if (codes(matching).length === 1) return matching[0]!;
    if (matching.length) return null;
  }
  return codes(allowed).length === 1 ? allowed[0]! : null;
}

/** The code a tariff's own port codes give a name ("HAM" → "DEHAM", "Koper" → "SIKOP"), case aside; null when none. */
export function portCodeFor(name: string, portCodes: Record<string, string>): string | null {
  const key = fold(name);
  for (const [written, code] of Object.entries(portCodes)) if (fold(written) === key) return code;
  return null;
}
