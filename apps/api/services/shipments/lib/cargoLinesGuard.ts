// A save of Cargo Details' dimension lines sends the whole list (mock test council Y10): a page
// opened before another save - a colleague's edit - would write its old lines back over the new
// ones with its next line save, unseen. So the page sends along the lines it started from, and the
// server saves only while the shipment still holds them; else it refuses and the page reads them
// again. Container Details' saves likewise send the whole list of containers, with their Pieces,
// Gross Weight and Volume, so they are held to the containers the page started from the same way.
// (An accepted remeasurement writes neither since 22 Nov: it is only recorded.) Pure; the shipment
// service asks it in the write's turn.

import { cargoNum, hasAllSizes } from "../../../lib/cargoVolume";
import { normalizeContainerNumber } from "./cargoProjection";
import type { CargoDimensionLine, ContainerLine } from "../interfaces/interfaces";

export const CARGO_LINES_CHANGED = "Cargo Details changed meanwhile: they are shown again - make your change again";

const blankToNull = (v: string | null | undefined): string | null => (v == null || !String(v).trim() ? null : String(v).trim());

// A line as it is compared: its numbers as numbers ("1,5" and "1.50" are the same), its texts
// trimmed, the pallet and ADR fields as the server stores them ("UN 1203" is 1203), the typed
// volume only while the sizes are not all known (the server keeps no other). The container only
// when there are several: with one every line belongs to it, whatever id a page still names.
function lineKey(l: CargoDimensionLine, withContainer: boolean): unknown[] {
  return [
    withContainer ? (l.containerId ?? null) : null,
    cargoNum(l.pieces),
    cargoNum(l.lengthCm),
    cargoNum(l.widthCm),
    cargoNum(l.heightCm),
    l.dimensionUnit === "in" ? "in" : "cm",
    cargoNum(l.weightPerPcKg),
    hasAllSizes(l) ? 0 : cargoNum(l.volumePerPcM3),
    (l.packageType ?? "").trim(),
    (l.stackable ?? "").trim(),
    blankToNull(l.palletType)?.toUpperCase() ?? null,
    blankToNull(l.adrUn)?.replace(/^UN\s*/i, "") ?? null,
    blankToNull(l.adrClass),
    blankToNull(l.adrPackingGroup)?.toUpperCase() ?? null,
    l.adrLimitedQuantity === true,
  ];
}

/**
 * Whether the shipment's cargo dimension lines (`stored`, as Cargo Details shows them) are still the
 * ones a page started from (`expected`): the same lines in the same order. `containerCount`: how many
 * containers the shipment has now.
 */
export function sameCargoLines(expected: readonly CargoDimensionLine[], stored: readonly CargoDimensionLine[], containerCount: number): boolean {
  if (expected.length !== stored.length) return false;
  const withContainer = containerCount > 1;
  return expected.every((l, i) => JSON.stringify(lineKey(l, withContainer)) === JSON.stringify(lineKey(stored[i]!, withContainer)));
}

export const CONTAINERS_CHANGED = "Container Details changed meanwhile: they are shown again - make your change again";

// A container as it is compared: its id, its number as the server stores it (no spaces, capitals),
// its texts trimmed. Not its TEU: the server works it out from the type, whatever a page sends.
const containerKey = (c: ContainerLine): string =>
  JSON.stringify([
    c.id ?? null,
    normalizeContainerNumber(c.containerNumber),
    ...[c.sealNumber, c.type, c.packages, c.packageType, c.grossWeight, c.volume].map((v) => (v ?? "").trim()),
  ]);

/**
 * Whether the shipment's containers (`stored`, as Container Details shows them) are still the ones
 * a page started from (`expected`): the same containers with the same number, seal, type and figures.
 * Not their order: the page lists a container added elsewhere after its own.
 */
export function sameContainers(expected: readonly ContainerLine[], stored: readonly ContainerLine[]): boolean {
  const keys = (list: readonly ContainerLine[]) => list.map(containerKey).sort();
  return JSON.stringify(keys(expected)) === JSON.stringify(keys(stored));
}
