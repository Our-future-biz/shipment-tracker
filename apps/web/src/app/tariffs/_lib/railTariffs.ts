import { formatDate } from "@/lib/date";
import { formatFileSize } from "@/lib/files";
import type { interfaces } from "@/lib/api/client";
import { TARIFF_PAGES } from "./tariffPages";

// Pure helpers of the rail tariff pages: how a version, its status and its validity read, the ports
// and directions a tariff can be for, and the check of a chosen file before it is uploaded.

export const railOperatorHref = (customerId: string) => `${TARIFF_PAGES.railOperators.path}/${customerId}`;
export const railVersionHref = (customerId: string, versionId: string) => `${railOperatorHref(customerId)}/versions/${versionId}`;

export const TARIFF_FILE_ACCEPT = ".xlsx,.xlsm,.csv";
export const TARIFF_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Why a chosen file cannot be uploaded, or null when it can: an Excel or CSV file of at most 10 MB. */
export function tariffFileProblem(file: { name: string; size: number }): string | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "xls") return "This is an old Excel file (.xls). Open it in Excel, save it as .xlsx and upload that.";
  if (!["xlsx", "xlsm", "csv"].includes(ext)) return "Choose an Excel file (.xlsx) or a CSV file.";
  if (file.size <= 0) return "The file is empty.";
  if (file.size > TARIFF_FILE_MAX_BYTES) return `The file is ${formatFileSize(file.size)}; the limit is 10 MB.`;
  return null;
}

export const STATUS_CHIP: Record<interfaces.SupplierTariffStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  superseded: { label: "Replaced", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const LAYOUT_SOURCE_LABEL: Record<interfaces.LayoutSource, string> = {
  ai: "Read by AI",
  remembered: "Read by AI, guided by the last approved version",
  edited: "Layout corrected by hand",
};

/** The sea ports a tariff can be for, in the order they are offered (the API keeps the same list). */
export const TARIFF_PORTS: { code: interfaces.TariffPortCode; name: string }[] = [
  { code: "BEANR", name: "Antwerp" },
  { code: "NLRTM", name: "Rotterdam" },
  { code: "DEHAM", name: "Hamburg" },
  { code: "DEBRV", name: "Bremerhaven" },
  { code: "DEWVN", name: "Wilhelmshaven" },
  { code: "SIKOP", name: "Koper" },
];

export const DIRECTIONS: { value: interfaces.RailDirection; label: string; hint: string }[] = [
  { value: "import", label: "Import", hint: "port → inland" },
  { value: "export", label: "Export", hint: "inland → port" },
];

/** "Hamburg, Bremerhaven"; a code not in the list shows as it is. */
export const portsText = (codes: readonly string[]) => codes.map((c) => TARIFF_PORTS.find((p) => p.code === c)?.name ?? c).join(", ");

/** "Import", "Export" or "Import & export". */
export function directionsText(directions: readonly interfaces.RailDirection[]): string {
  const labels = DIRECTIONS.filter((d) => directions.includes(d.value)).map((d) => d.label);
  return labels.length === 2 ? "Import & export" : (labels[0] ?? "");
}

/** What a tariff is for, as a tariff picker shows it: "Hamburg, Bremerhaven · Import & export". */
export const tariffForText = (t: { ports: readonly string[]; directions: readonly interfaces.RailDirection[] }) =>
  [portsText(t.ports), directionsText(t.directions)].filter(Boolean).join(" · ");

/** What keeps a tariff's ports and directions from being saved, in words; null when they can be. */
export function portsAndDirectionsProblem(t: { ports: readonly string[]; directions: readonly string[] }): string | null {
  if (!t.ports.length) return "Choose at least one port";
  if (!t.directions.length) return "Choose import, export or both";
  return null;
}

/** "v3" */
export const versionLabel = (v: Pick<interfaces.SupplierTariffVersion, "versionNo">) => `v${v.versionNo}`;

/** "01.01.2026 – 31.12.2026", "from 01.01.2026", or "No dates" */
export function validityText(v: { validFrom: string | null; validTo: string | null }): string {
  if (v.validFrom && v.validTo) return `${formatDate(v.validFrom)} – ${formatDate(v.validTo)}`;
  if (v.validFrom) return `from ${formatDate(v.validFrom)}`;
  if (v.validTo) return `until ${formatDate(v.validTo)}`;
  return "No dates";
}

/** Whether a version prices on `day` (YYYY-MM-DD): active and within its dates. */
export const pricesOn = (v: Pick<interfaces.SupplierTariffVersion, "status" | "validFrom" | "validTo">, day: string) =>
  v.status === "active" && (v.validFrom ?? "") <= day && (v.validTo === null || v.validTo >= day);

/** A band as people say it: "20' up to 14 t", "21–29' up to 32 t", "40' any weight". */
export function bandText(b: Pick<interfaces.RailBand, "minLengthFt" | "maxLengthFt" | "maxGrossTonnes">): string {
  const length = b.minLengthFt === b.maxLengthFt ? `${b.minLengthFt}'` : `${b.minLengthFt}–${b.maxLengthFt}'`;
  return `${length} ${b.maxGrossTonnes === null ? "any weight" : `up to ${b.maxGrossTonnes} t`}`;
}
