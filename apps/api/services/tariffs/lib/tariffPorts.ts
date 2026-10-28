import { APIError } from "encore.dev/api";
import type { RailDirection, TariffPortCode } from "../interfaces/interfaces";

// What a tariff is for: the sea ports it runs from or to and whether it is import, export or both,
// as the user ticks them. Pure.

/** The ports a tariff can be for, in the order they are offered. */
export const TARIFF_PORT_CODES: readonly TariffPortCode[] = ["BEANR", "NLRTM", "DEHAM", "DEBRV", "DEWVN", "SIKOP"];
export const RAIL_DIRECTIONS: readonly RailDirection[] = ["import", "export"];

const inOrder = <T extends string>(all: readonly T[], chosen: Iterable<string>): T[] => {
  const set = new Set(chosen);
  return all.filter((x) => set.has(x));
};

/** The ports and directions chosen for a tariff, each once and in list order; refused when either is missing or unknown. */
export function chosenPortsAndDirections(ports: readonly string[] | undefined, directions: readonly string[] | undefined): { ports: TariffPortCode[]; directions: RailDirection[] } {
  const unknownPort = (ports ?? []).find((p) => !TARIFF_PORT_CODES.includes(p as TariffPortCode));
  if (unknownPort) throw APIError.invalidArgument(`"${unknownPort}" is not one of the ports a tariff can be for`);
  const unknownDirection = (directions ?? []).find((d) => !RAIL_DIRECTIONS.includes(d as RailDirection));
  if (unknownDirection) throw APIError.invalidArgument(`"${unknownDirection}" is neither import nor export`);
  const chosen = { ports: inOrder(TARIFF_PORT_CODES, ports ?? []), directions: inOrder(RAIL_DIRECTIONS, directions ?? []) };
  if (!chosen.ports.length) throw APIError.invalidArgument("Choose at least one port the tariff is for");
  if (!chosen.directions.length) throw APIError.invalidArgument("Choose whether the tariff is for import, export or both");
  return chosen;
}

/** Every port and direction any of the tariffs is for, in list order. */
export function portsAndDirectionsOf(tariffs: { ports: readonly string[]; directions: readonly string[] }[]): { ports: TariffPortCode[]; directions: RailDirection[] } {
  return {
    ports: inOrder(TARIFF_PORT_CODES, tariffs.flatMap((t) => t.ports)),
    directions: inOrder(RAIL_DIRECTIONS, tariffs.flatMap((t) => t.directions)),
  };
}
