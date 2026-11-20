import { num } from "@/lib/cargo";

// Colli, Type of packages, HS code and Cargo description in Shipment Details. Once the job has a
// container, cargo or dimension line, the server works them out from those lines, field by field,
// and shows the value typed on the job only where the lines give none (shipments
// shipment.service enrich). A field the lines give a value for is not typed here but in Cargo
// Details: a value typed in Shipment Details would be saved and never shown (user council O2 / E7,
// owner's answer Q2). A field the lines give none for stays typed here, so the value typed earlier
// can still be corrected or cleared (owner's answer to the step-1 review: lock per field).

/** The Shipment Details fields the lines can work out. */
export const FIELDS_FROM_LINES: ReadonlySet<string> = new Set(["pcs", "typeOfPackages", "hsCode", "cargoDescription"]);

/** The short hint beside such a field once it is locked. */
export const FROM_LINES_HINT = "From Cargo Details";

/** The hint's tooltip: where to change it. */
export const FROM_LINES_TITLE = "Worked out from the job's container or cargo lines: change it in Cargo Details.";

// What is read of each line, as the shipment page has them from the API.
type Lines = {
  containers?: { packages?: string | null; packageType?: string | null }[] | null;
  cargoItems?: { pieces?: string | null; packageType?: string | null; hsCode?: string | null; cargoDescription?: string | null }[] | null;
  cargoDimensions?: { pieces?: string | null }[] | null;
};

const filled = (v: string | null | undefined) => (v ?? "").trim() !== "";

/**
 * Whether the job's lines give a value for this field, by the server's own rule (shipments
 * lib/cargoProjection projectCargo):
 * - Colli: the containers' packages, else the cargo lines' pieces, else the dimension lines'
 *   pieces - a total of 0 gives none (it shows as empty);
 * - Type of packages: a package type on a cargo line or a container (not on a dimension line);
 * - HS code and Cargo description: one on a cargo line.
 */
export function lineGivesField(s: Lines, fieldKey: string): boolean {
  const containers = s.containers ?? [];
  const items = s.cargoItems ?? [];
  const dimensions = s.cargoDimensions ?? [];
  const total = <T>(rows: T[], pick: (r: T) => string | null | undefined) => rows.reduce((sum, r) => sum + num(pick(r)), 0);
  switch (fieldKey) {
    case "pcs":
      return total(containers, (c) => c.packages) !== 0 || total(items, (i) => i.pieces) !== 0 || total(dimensions, (d) => d.pieces) !== 0;
    case "typeOfPackages":
      return items.some((i) => filled(i.packageType)) || containers.some((c) => filled(c.packageType));
    case "hsCode":
      return items.some((i) => filled(i.hsCode));
    case "cargoDescription":
      return items.some((i) => filled(i.cargoDescription));
    default:
      return false;
  }
}

/**
 * This field of this job is worked out from its lines, so it is read-only in Shipment Details.
 * Where the lines give none the field is typed here, showing the value typed on the job.
 */
export function lockedByLines(s: Lines, fieldKey: string): boolean {
  return FIELDS_FROM_LINES.has(fieldKey) && lineGivesField(s, fieldKey);
}
