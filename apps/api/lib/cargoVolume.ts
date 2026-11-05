// The volume of one piece of a cargo dimension line, one rule wherever it is counted: Shipments (a
// shipment's total volume, its freight tons) and the warehouse's remeasurement e-mail, which
// declares what the shipment says. From the piece's length, width and height (cm) when all three
// are known, else the m³ typed for it, as the sizes of a piece are not always known. The web holds
// the same rule (apps/web/src/lib/cargo.ts). Pure.

/**
 * A number of a cargo line as stored, which is free text: everything but digits, ".", "," and "-"
 * left out, a "," read as ".", 0 when no number is left.
 */
export function cargoNum(v: string | null | undefined): number {
  const n = parseFloat(
    String(v ?? "")
      .replace(/[^0-9.,-]/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : 0;
}

/** What the volume of a piece is worked out from: its sizes in cm and the m³ typed for it. */
export interface PieceSizes {
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  volumePerPcM3?: string | null;
}

/** Whether all three sizes of a piece are known (each above 0): then its volume is worked out from them. */
export const hasAllSizes = (d: PieceSizes): boolean => cargoNum(d.lengthCm) > 0 && cargoNum(d.widthCm) > 0 && cargoNum(d.heightCm) > 0;

/** The m³ of one piece: from its sizes (cm³ → m³) when all three are known, else the volume typed for it. */
export function dimensionVolumePerPiece(d: PieceSizes): number {
  return hasAllSizes(d) ? (cargoNum(d.lengthCm) * cargoNum(d.widthCm) * cargoNum(d.heightCm)) / 1e6 : cargoNum(d.volumePerPcM3);
}
