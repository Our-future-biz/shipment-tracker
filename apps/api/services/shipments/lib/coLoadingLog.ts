// A Co-Loading Concept sailing's checklist, hand-over note and history (Council Outlay 14, C5): the
// steps a box goes through, ticked with who and when; a free note for whoever takes the box over;
// and one list of everything that happened to the sailing. Pure.

/** The steps a company's checklist starts with, until a manager sets its own (D12). */
export const DEFAULT_CHECKLIST = ["Booking confirmed", "Load list sent", "Pre-alert", "B/L received", "Arrival notice", "Devanning booked"] as const;
export const CHECK_STEP_MAX = 60;
export const CHECKLIST_MAX = 15;
export const SAILING_NOTE_MAX = 2000;

export type ChecklistDirection = "import" | "export";
export const isChecklistDirection = (d: unknown): d is ChecklistDirection => d === "import" || d === "export";

/** A checklist as a manager types it, made ready to keep: each step trimmed, none empty, none twice. */
export function cleanChecklist(steps: unknown): { steps: string[] } | { error: string } {
  if (!Array.isArray(steps) || steps.some((s) => typeof s !== "string")) return { error: "Give the steps of the checklist." };
  const cleaned = (steps as string[]).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (cleaned.length === 0) return { error: "A checklist needs at least one step." };
  if (cleaned.length > CHECKLIST_MAX) return { error: `A checklist takes at most ${CHECKLIST_MAX} steps.` };
  const long = cleaned.find((s) => s.length > CHECK_STEP_MAX);
  if (long) return { error: `Keep each step to ${CHECK_STEP_MAX} characters: "${long.slice(0, 30)}…" is longer.` };
  const seen = new Set<string>();
  for (const s of cleaned) {
    if (seen.has(s.toLowerCase())) return { error: `"${s}" is on the list twice.` };
    seen.add(s.toLowerCase());
  }
  return { steps: cleaned };
}

/** The steps of a service's sailings: the company's own list for its direction, else the starting one. */
export function checklistFor(setting: { checklistImport?: string[] | null; checklistExport?: string[] | null } | null, direction: string): string[] {
  const own = direction === "export" ? setting?.checklistExport : setting?.checklistImport;
  return own && own.length > 0 ? own : [...DEFAULT_CHECKLIST];
}

export interface ChecklistItem {
  step: string;
  /** Who ticked it and when (ISO); null while it is not ticked. */
  doneByName: string | null;
  doneAt: string | null;
  /** Ticked on this sailing, but no longer a step of the company's list: shown until it is unticked. */
  offList?: true;
}

/** A sailing's checklist: the list's steps in order, each with its tick, then the ticks of steps the list no longer has. */
export function checklistOf(steps: readonly string[], ticks: readonly { step: string; doneByName: string; doneAt: Date }[]): ChecklistItem[] {
  const tickOf = (step: string) => ticks.find((t) => t.step.toLowerCase() === step.toLowerCase());
  const onList = steps.map((step): ChecklistItem => {
    const tick = tickOf(step);
    return { step, doneByName: tick ? tick.doneByName : null, doneAt: tick ? tick.doneAt.toISOString() : null };
  });
  const off = ticks
    .filter((t) => !steps.some((s) => s.toLowerCase() === t.step.toLowerCase()))
    .map((t): ChecklistItem => ({ step: t.step, doneByName: t.doneByName, doneAt: t.doneAt.toISOString(), offList: true }));
  return [...onList, ...off];
}

/** Why this step cannot be ticked or unticked, or null: a step to tick must be on the list; any ticked one may be unticked. */
export function tickRefusal(step: string, done: boolean, list: readonly ChecklistItem[]): string | null {
  const item = list.find((i) => i.step.toLowerCase() === step.trim().toLowerCase());
  if (!item) return "This step is not on the sailing's checklist.";
  if (done && item.offList) return "This step is no longer on the checklist: it can only be unticked.";
  return null;
}

export interface SailingHistoryEntry {
  /** When it happened, ISO. */
  at: string;
  /** Who did it, as named then; "" when not known. */
  by: string;
  kind: "created" | "changed" | "stage" | "note" | "check" | "linked" | "removed" | "moved";
  text: string;
}

const day = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d);
const FACT_LABEL: Record<string, string> = { vessel: "Vessel", voyage: "Voyage", pol: "Port of Loading", pod: "Port of Discharge", hub: "HUB", container_type: "Container type" };

/** A kept change of the sailing itself, in words; null for one that is not the sailing's own (a box cost: money, shown on Earnings only). */
export function changeEntry(c: { containerNo: number; kind: string; oldAmount: string | number | null; newAmount: string | number | null; oldNote: string; newNote: string; changedByName: string; changedAt: Date }): SailingHistoryEntry | null {
  if (c.containerNo !== 0) return null;
  const base = { at: c.changedAt.toISOString(), by: c.changedByName };
  const words = (v: string) => v || "none";
  if (c.kind === "stage") return { ...base, kind: "stage", text: `Stage: ${words(c.oldNote)} → ${words(c.newNote)}` };
  if (c.kind === "note") return { ...base, kind: "note", text: c.newNote ? (c.oldNote ? "Hand-over note changed" : "Hand-over note written") : "Hand-over note cleared" };
  if (c.kind === "check") return { ...base, kind: "check", text: c.newNote ? `Ticked: ${c.newNote}` : `Unticked: ${c.oldNote}` };
  if (c.kind === "master_job") return { ...base, kind: "changed", text: `Master Job: ${words(c.oldNote)} → ${words(c.newNote)}` };
  if (c.kind === "containers") return { ...base, kind: "changed", text: `Number of containers: ${Number(c.oldAmount ?? 0)} → ${Number(c.newAmount ?? 0)}` };
  if (c.kind === "departure") return { ...base, kind: "changed", text: `Departure date: ${c.oldNote ? day(c.oldNote) : "none"} → ${c.newNote ? day(c.newNote) : "none"}` };
  if (c.kind === "cutoff") return { ...base, kind: "changed", text: `Cut-off: ${c.oldNote ? day(c.oldNote) : "none"} → ${c.newNote ? day(c.newNote) : "none"}` };
  const fact = FACT_LABEL[c.kind];
  return fact ? { ...base, kind: "changed", text: `${fact}: ${words(c.oldNote)} → ${words(c.newNote)}` } : null;
}

export interface HistoryLink {
  jobNumber: string;
  linkedAt: Date;
  linkedByName: string;
  linkedNote: string;
  /** Null while the shipment is still on the sailing. */
  removedAt: Date | null;
  removedByName: string;
  /** "removed", "moved" or "shipment_deleted"; "" for one taken off before this was kept. */
  removedReason: string;
  removedNote: string;
  /** Where a moved shipment went: "WEEK 52"; "" when not known. */
  movedTo: string;
}

/** What a link tells the history: that the shipment came on, and - once it left - how. */
export function linkEntries(l: HistoryLink): SailingHistoryEntry[] {
  const job = l.jobNumber || "A shipment";
  const entries: SailingHistoryEntry[] = [
    { at: l.linkedAt.toISOString(), by: l.linkedByName, kind: "linked", text: l.linkedNote ? `${job} linked after the sailing was closed for cargo: ${l.linkedNote}` : `${job} linked` },
  ];
  if (!l.removedAt) return entries;
  const base = { at: l.removedAt.toISOString(), by: l.removedByName };
  if (l.removedReason === "moved") entries.push({ ...base, kind: "moved", text: `${job} moved to ${l.movedTo || "another sailing"}${l.removedNote ? `: ${l.removedNote}` : ""}` });
  else if (l.removedReason === "shipment_deleted") entries.push({ ...base, kind: "removed", text: `${job} left the sailing: the shipment was deleted` });
  else entries.push({ ...base, kind: "removed", text: `${job} removed from the sailing` });
  return entries;
}

/** The most entries a history shows. */
export const HISTORY_MAX = 300;

/** A sailing's history, the latest first: its making, every kept change of it, and every shipment that came on or left. */
export function sailingHistory(
  sailing: { createdAt: Date; createdByName: string },
  changes: readonly Parameters<typeof changeEntry>[0][],
  links: readonly HistoryLink[],
): SailingHistoryEntry[] {
  const entries: SailingHistoryEntry[] = [
    { at: sailing.createdAt.toISOString(), by: sailing.createdByName, kind: "created", text: "Sailing created" },
    ...changes.flatMap((c) => changeEntry(c) ?? []),
    ...links.flatMap(linkEntries),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, HISTORY_MAX);
}
