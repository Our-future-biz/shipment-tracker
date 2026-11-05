import { TERMINALS_DATA } from "./terminals.data";
import { INLAND_TERMINALS_DATA } from "./inlandTerminals.data";
import { fold } from "./format";
import { byPicks, type PickCounts } from "./picks";

// An ocean container terminal (CY), offered beside the UN/LOCODE places as the Origin and
// Destination of a sea quote or shipment. Its code is the port's UN/LOCODE and the terminal's SMDG
// code ("DEHAMCTB"); it is written into quotes and shipments as "Name (CODE)" like a place:
// "HHLA CONTAINER TERMINAL BURCHARDKAI (CTB) (DEHAMCTB)".
export interface Terminal {
  code: string;
  name: string;
  /** The UN/LOCODE of its port. */
  portCode: string;
  port: string;
  countryCode: string;
  operator: string | null;
}

interface Entry extends Terminal {
  // Folded name, port and operator, for matching typed text.
  text: string;
}

const TERMINALS: Entry[] = TERMINALS_DATA.trim()
  .split("\n")
  .map((line) => {
    const [code = "", name = "", port = "", countryCode = "", operator = ""] = line.split("|");
    return { code, name, portCode: code.slice(0, 5), port, countryCode, operator: operator || null, text: ` ${fold(`${name} ${port} ${operator}`)}` };
  });

const toTerminal = ({ code, name, portCode, port, countryCode, operator }: Entry): Terminal => ({ code, name, portCode, port, countryCode, operator });

/**
 * Terminals matching typed text: those whose code starts with it first (a port's UN/LOCODE lists
 * all of its terminals), then those whose name, port or operator has a word starting with it -
 * those the user picked most (`picks`) before all of them.
 */
export function searchTerminals(query: string, limit = 30, picks?: PickCounts): Terminal[] {
  const q = fold(query ?? "");
  if (q.length < 2) return [];
  const code = q.replace(/ /g, "").toUpperCase();
  const byCode = code.length >= 5 ? TERMINALS.filter((t) => t.code.startsWith(code)) : [];
  const words = ` ${q}`;
  const byText = TERMINALS.filter((t) => !byCode.includes(t) && t.text.includes(words)).sort((a, b) => a.port.localeCompare(b.port) || a.name.localeCompare(b.name));
  return byPicks([...byCode, ...byText], (t) => t.code, picks).slice(0, limit).map(toTerminal);
}

/** What an inland terminal is: a dry port, an intermodal (rail / road / barge) terminal, or a US rail terminal. */
export type InlandTerminalKind = "dry_port" | "intermodal" | "rail";

// An inland terminal (dry port, rail or intermodal terminal), offered with the ocean terminals.
// None has an official code: its code is the app's own ("DE-IT116", inlandTerminals.data.ts).
export interface InlandTerminal {
  code: string;
  name: string;
  town: string;
  countryCode: string;
  kind: InlandTerminalKind;
  /** The railroads serving a US rail terminal. */
  railroads: string | null;
}

const KIND: Record<string, InlandTerminalKind> = { D: "dry_port", T: "intermodal", R: "rail" };

interface InlandEntry extends InlandTerminal {
  // Folded name, town and railroads, for matching typed text.
  text: string;
}

const INLAND: InlandEntry[] = INLAND_TERMINALS_DATA.trim()
  .split("\n")
  .map((line) => {
    const [code = "", name = "", town = "", countryCode = "", kind = "T", railroads = ""] = line.split("|");
    return { code, name, town, countryCode, kind: KIND[kind] ?? "intermodal", railroads: railroads || null, text: ` ${fold(`${name} ${town} ${railroads}`)}` };
  });

const toInlandTerminal = ({ code, name, town, countryCode, kind, railroads }: InlandEntry): InlandTerminal => ({ code, name, town, countryCode, kind, railroads });

/**
 * Inland terminals matching typed text: the one whose code it is first, then those whose name or
 * town has a word starting with it - those the user picked most (`picks`) before all of them.
 */
export function searchInlandTerminals(query: string, limit = 30, picks?: PickCounts): InlandTerminal[] {
  const q = fold(query ?? "");
  if (q.length < 2) return [];
  const code = (query ?? "").trim().toUpperCase();
  const exact = INLAND.find((t) => t.code === code);
  const words = ` ${q}`;
  const found = INLAND.filter((t) => t !== exact && t.text.includes(words)).sort((a, b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name));
  return byPicks(exact ? [exact, ...found] : found, (t) => t.code, picks).slice(0, limit).map(toInlandTerminal);
}
