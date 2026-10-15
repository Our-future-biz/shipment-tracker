import type { interfaces } from "@/lib/api/client";
import { formatFileSize } from "@/lib/files";
import { formatPercent, sortFindings } from "./tariffs";

// Pure helpers of the tariff Excel template, the upload wizard and the comparison of two versions:
// the file check, how a downloaded file is saved, findings grouped by sheet and how a change reads.

export const TARIFF_FILE_ACCEPT = ".xlsx";
export const TARIFF_FILE_MAX_BYTES = 5 * 1024 * 1024;
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The server's answer to an upload on a DISCOUNT tariff; the page says it before anyone tries. */
export const DISCOUNT_NO_FILE = "A discount tariff follows the Standard list and has no file of its own.";

/** Why a chosen file cannot be uploaded, or null when it can: an .xlsx of at most 5 MB. */
export function tariffFileProblem(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith(TARIFF_FILE_ACCEPT)) return "Choose an Excel file (.xlsx) made from the template.";
  if (file.size <= 0) return "The file is empty.";
  if (file.size > TARIFF_FILE_MAX_BYTES) return `The file is ${formatFileSize(file.size)}; the limit is 5 MB.`;
  return null;
}

/** A file from the server as a data URL to save to disk (an .xlsx when the server names no type). */
export function fileDataUrl(file: Pick<interfaces.FileDownload, "fileBase64" | "contentType">): string {
  return `data:${file.contentType || XLSX_TYPE};base64,${file.fileBase64}`;
}

// ── Findings ──

export interface FindingGroup<T> {
  /** "D2", "Zones"… or "Whole version" when the finding names no sheet. */
  sheet: string;
  findings: T[];
}

export interface FindingSection<T> {
  severity: "error" | "warning";
  count: number;
  groups: FindingGroup<T>[];
}

export const WHOLE_VERSION = "Whole version";

/** The sheet a finding's `where` names ("Sheet D2, row 7, column F" → "D2"). */
export function findingSheet(where: string): string {
  const match = /^\s*sheet\s+([^,]+)/i.exec(where);
  return match?.[1]?.trim() || WHOLE_VERSION;
}

/** Errors first, then warnings; within each, grouped by sheet in the order the sheets first appear. */
export function groupFindings<T extends Pick<interfaces.ValidationFinding, "severity" | "where">>(findings: readonly T[]): FindingSection<T>[] {
  const sections: FindingSection<T>[] = [];
  for (const f of sortFindings(findings)) {
    const severity = f.severity === "error" ? "error" : "warning";
    let section = sections.find((s) => s.severity === severity);
    if (!section) sections.push((section = { severity, count: 0, groups: [] }));
    const sheet = findingSheet(f.where);
    let group = section.groups.find((g) => g.sheet === sheet);
    if (!group) section.groups.push((group = { sheet, findings: [] }));
    group.findings.push(f);
    section.count += 1;
  }
  return sections;
}

// ── Comparing two versions ──

export type DiffTone = "up" | "down" | "added" | "removed" | "same";

/** Which way a cell moved: dearer, cheaper, new, gone or not at all. */
export function diffTone(cell: Pick<interfaces.DiffCell, "before" | "after">): DiffTone {
  if (cell.before == null) return cell.after == null ? "same" : "added";
  if (cell.after == null) return "removed";
  if (cell.after > cell.before) return "up";
  if (cell.after < cell.before) return "down";
  return "same";
}

/** The change in words as well as colour: "▲ +12.5 %", "▼ −3 %", "new", "removed", "no change". */
export function diffChangeText(cell: Pick<interfaces.DiffCell, "before" | "after" | "changePercent">): string {
  const tone = diffTone(cell);
  if (tone === "added") return "new";
  if (tone === "removed") return "removed";
  if (tone === "same") return "no change";
  const arrow = tone === "up" ? "▲" : "▼";
  return cell.changePercent == null ? arrow : `${arrow} ${formatPercent(cell.changePercent, true)}`;
}

export interface DiffTile {
  label: string;
  value: string;
  tone: DiffTone;
}

/** The summary tiles above the cells: how many changed, came and went, and by how much. */
export function diffTiles(diff: interfaces.TariffVersionDiff): DiffTile[] {
  return [
    { label: "Changed", value: String(diff.changedCells), tone: diff.changedCells ? "up" : "same" },
    { label: "Added", value: String(diff.addedCells), tone: diff.addedCells ? "added" : "same" },
    { label: "Removed", value: String(diff.removedCells), tone: diff.removedCells ? "removed" : "same" },
    { label: "Unchanged", value: String(diff.unchangedCells), tone: "same" },
    { label: "Average change", value: formatPercent(diff.averageChangePercent, true), tone: percentTone(diff.averageChangePercent) },
    { label: "Biggest rise", value: formatPercent(diff.maxIncreasePercent, true), tone: percentTone(diff.maxIncreasePercent) },
    { label: "Biggest fall", value: formatPercent(diff.maxDecreasePercent, true), tone: percentTone(diff.maxDecreasePercent) },
  ];
}

function percentTone(p: number | null): DiffTone {
  if (p == null || Math.round(p * 10) === 0) return "same";
  return p > 0 ? "up" : "down";
}

/** The zone, service level and surcharge changes, one plain line each. */
export function diffStructureLines(
  diff: Pick<interfaces.TariffVersionDiff, "zonesAdded" | "zonesRemoved" | "levelsAdded" | "levelsRemoved" | "surchargeChanges">,
  levelLabel: (code: string) => string,
): string[] {
  const lines: string[] = [];
  if (diff.zonesAdded.length) lines.push(`Zones added: ${diff.zonesAdded.join(", ")}`);
  if (diff.zonesRemoved.length) lines.push(`Zones removed: ${diff.zonesRemoved.join(", ")}`);
  if (diff.levelsAdded.length) lines.push(`Service levels added: ${diff.levelsAdded.map(levelLabel).join(", ")}`);
  if (diff.levelsRemoved.length) lines.push(`Service levels removed: ${diff.levelsRemoved.map(levelLabel).join(", ")}`);
  for (const s of diff.surchargeChanges) lines.push(`Surcharge: ${s}`);
  return lines;
}

/** The server lists at most this many cells (largest change first). */
export const DIFF_CELL_LIMIT = 500;

/** True when the version prices exactly like the one it is compared with. */
export function isSameAsAgainst(diff: interfaces.TariffVersionDiff): boolean {
  return !diff.changedCells && !diff.addedCells && !diff.removedCells && diffStructureLines(diff, String).length === 0;
}

// ── Wizard ──

export const UPLOAD_STEPS = [
  { key: "file", title: "File" },
  { key: "read", title: "Read" },
  { key: "check", title: "Check" },
  { key: "compare", title: "Compare" },
  { key: "test", title: "Test a lane" },
  { key: "activate", title: "Activate" },
] as const;

export type UploadStep = (typeof UPLOAD_STEPS)[number]["key"];

/** The first day a draft can start: its own valid-from when that is later than today. */
export function defaultActivationDate(validFrom: string, today: string): string {
  return validFrom > today ? validFrom : today;
}
