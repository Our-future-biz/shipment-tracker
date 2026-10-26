import { AIRPORTS_DATA } from "./airports.data";
import { fold } from "./format";

// An IATA-coded airport, offered beside the UN/LOCODE places when a quote goes by air. Written
// into quotes as "Name (CODE)" like a place: "Shanghai Pudong International Airport (PVG)".
export interface Airport {
  code: string;
  name: string;
  city: string | null;
  countryCode: string;
}

interface Entry extends Airport {
  // Lower ranks first: large airports with scheduled service, then medium, then small.
  rank: number;
  // Folded name and city, for matching typed text.
  text: string;
}

const SIZE_RANK: Record<string, number> = { L: 0, M: 2, S: 4 };

const AIRPORTS: Entry[] = AIRPORTS_DATA.trim()
  .split("\n")
  .map((line) => {
    const [code = "", name = "", city = "", countryCode = "", kind = "S0"] = line.split("|");
    return {
      code,
      name,
      city: city || null,
      countryCode,
      rank: (SIZE_RANK[kind[0]!] ?? 4) + (kind[1] === "1" ? 0 : 1),
      text: ` ${fold(`${name} ${city}`)}`,
    };
  });

const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

const toAirport = ({ code, name, city, countryCode }: Entry): Airport => ({ code, name, city, countryCode });

/**
 * Airports matching typed text: the one whose IATA code it is first, then those whose name or city
 * has a word starting with it, bigger airports before smaller ones.
 */
export function searchAirports(query: string, limit = 30): Airport[] {
  const q = fold(query ?? "");
  if (q.length < 2) return [];
  const exact = q.length === 3 ? BY_CODE.get(q.toUpperCase()) : undefined;
  const words = ` ${q}`;
  const found = AIRPORTS.filter((a) => a !== exact && a.text.includes(words)).sort(
    (a, b) => a.rank - b.rank || a.name.localeCompare(b.name),
  );
  return (exact ? [exact, ...found] : found).slice(0, limit).map(toAirport);
}
