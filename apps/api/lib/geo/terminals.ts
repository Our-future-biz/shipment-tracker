import { TERMINALS_DATA } from "./terminals.data";
import { fold } from "./format";

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
 * all of its terminals), then those whose name, port or operator has a word starting with it.
 */
export function searchTerminals(query: string, limit = 30): Terminal[] {
  const q = fold(query ?? "");
  if (q.length < 2) return [];
  const code = q.replace(/ /g, "").toUpperCase();
  const byCode = code.length >= 5 ? TERMINALS.filter((t) => t.code.startsWith(code)) : [];
  const words = ` ${q}`;
  const byText = TERMINALS.filter((t) => !byCode.includes(t) && t.text.includes(words)).sort((a, b) => a.port.localeCompare(b.port) || a.name.localeCompare(b.name));
  return [...byCode, ...byText].slice(0, limit).map(toTerminal);
}
