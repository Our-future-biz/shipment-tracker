// The lines of the Customs page's Trucking card: the trucks of the shipment's Pick-up tab, each with
// the shipment's Customs Office. An office without a truck yet still gets its line.

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The filled rows of a stored Pick-up section (its `rows` are JSON text); anything unreadable is left out. */
function pickupRows(section: unknown): { licensePlate: string; haulier: string }[] {
  const stored = section && typeof section === "object" ? (section as { rows?: unknown }).rows : undefined;
  let rows: unknown = stored;
  if (typeof stored === "string") {
    try {
      rows = JSON.parse(stored);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r: { licensePlate?: unknown; haulier?: unknown } | null) => ({ licensePlate: text(r?.licensePlate), haulier: text(r?.haulier) }))
    .filter((r) => r.licensePlate || r.haulier);
}

/** One line per truck: License Plate, Haulier, Customs Office. */
export function truckingLines(pickupSection: unknown, customsOffice: string | null | undefined): string[][] {
  const office = text(customsOffice);
  const trucks = pickupRows(pickupSection);
  if (trucks.length === 0) return office ? [["", "", office]] : [];
  return trucks.map((t) => [t.licensePlate, t.haulier, office]);
}
