import type { geo } from "@/lib/api/client";

// What an inland terminal is, beside its town.
const INLAND_KIND: Record<geo.InlandTerminalKind, string> = { dry_port: "Dry port", intermodal: "Intermodal", rail: "Rail" };

// Where a place, airport or terminal is, as its option in a place field says it at the side.
export const placeWhere = (p: geo.Place) => [p.subdivisionName, p.countryCode].filter(Boolean).join(", ");
export const airportWhere = (a: geo.Airport) => [a.city, a.countryCode].filter(Boolean).join(", ");
export const terminalWhere = (t: geo.Terminal) => [t.port, t.countryCode].filter(Boolean).join(", ");
export const inlandWhere = (t: geo.InlandTerminal) => [INLAND_KIND[t.kind], t.town, t.countryCode].filter(Boolean).join(", ");

/** What a search for a code handed back. */
export interface FoundByCode {
  airports?: geo.Airport[];
  terminals?: geo.Terminal[];
  inland?: geo.InlandTerminal[];
  places?: geo.Place[];
}

/** Where the place, airport or terminal of exactly this code is, from what a search for it found; "" when it found none. */
export function whereOfCode(code: string, found: FoundByCode): string {
  const airport = found.airports?.find((a) => a.code === code);
  if (airport) return airportWhere(airport);
  const terminal = found.terminals?.find((t) => t.code === code);
  if (terminal) return terminalWhere(terminal);
  const inland = found.inland?.find((t) => t.code === code);
  if (inland) return inlandWhere(inland);
  const place = found.places?.find((p) => p.code === code);
  return place ? placeWhere(place) : "";
}

/** Where a quote's Origin and Destination are ("New York, US"), by their stored value. */
export interface RouteWhere {
  where: Record<string, string>;
  isLoading: boolean;
}
