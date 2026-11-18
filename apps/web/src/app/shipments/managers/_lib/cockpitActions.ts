import type { interfaces } from "@/lib/api";
import type { CutoffKey } from "@/lib/managerActions";
import type { OpsCockpitRow } from "@/hooks/useShipmentsManagersCockpit";

// What a manager does from a row of Shipments → Managers (Council Outlay 11, step 3): hand the job
// over, nudge whoever handles it, dismiss a missed cut-off. The dialogs and their requests are
// builder Q's (HandOverDialog, NudgeDialog, DismissCutoffDialog); this file decides what a row
// offers and words what is said afterwards. The server checks every one of them again.

type Tag = OpsCockpitRow["tags"][number];

// A cut-off tag starts with the cut-off's name: "Closing missed · 16.11.", "VGM overdue 2 days".
// The keys are the server's (lib/managerActions CutoffKey: closingDate, vgmClosing…).
const CUTOFF_OF_WORD: Record<string, CutoffKey> = {
  Closing: "closingDate",
  VGM: "vgmClosing",
  SI: "siClosing",
  AMS: "amsDeadline",
  ISF: "isfDeadline",
};

/** Whether a tag says a cut-off is missed or overdue: the only state a manager may dismiss. */
const saysMissed = (tag: Tag): boolean => tag.kind === "cutoff" && tag.urgent && (tag.text.startsWith("Closing missed") || tag.text.includes(" overdue"));

/**
 * The cut-offs of a row a manager may dismiss, each under its tag's own words ("VGM overdue 2
 * days"): the urgent cut-off tags that say missed or overdue - not one that is due today or
 * tomorrow, which is still to be met. Each cut-off once; a tag whose first word names no cut-off
 * this page knows is left out (the server would refuse it anyway).
 */
export function dismissableCutoffs(tags: readonly Tag[]): { key: CutoffKey; label: string }[] {
  const found = new Map<CutoffKey, string>();
  for (const tag of tags) {
    if (!saysMissed(tag)) continue;
    const word = tag.text.trim().split(/\s+/)[0] ?? "";
    const key = Object.prototype.hasOwnProperty.call(CUTOFF_OF_WORD, word) ? CUTOFF_OF_WORD[word] : undefined;
    if (key && !found.has(key)) found.set(key, tag.text);
  }
  return [...found].map(([key, label]) => ({ key, label }));
}

/** A row the actions are for: a job. A Master Job with no shipment has no Handled By of a job, no to-dos and no cut-offs to dismiss. */
export const hasActions = (row: Pick<OpsCockpitRow, "kind">): boolean => row.kind !== "masterJob";

/** A nudge is a to-do for whoever handles the job: with nobody in Handled By there is nobody to nudge (the server refuses it). */
export const canNudge = (row: Pick<OpsCockpitRow, "handledBy">): boolean => row.handledBy.trim() !== "";

/** What the menu says under a "Nudge…" it cannot offer. */
export const NUDGE_NEEDS_HANDLED_BY = "Nobody in Handled By: hand the job over first";

/**
 * The ticks of the "show all" dialog that still stand: those of the rows listed now. The card is
 * read again every minute and after every action; a job that left it is no longer ticked - also
 * not when it comes back later, when nobody remembers having ticked it. The same array when
 * nothing is dropped, so whoever keeps the ticks can tell that nothing changed.
 */
export function ticksStillListed(ticked: readonly string[], listed: readonly string[]): readonly string[] {
  const here = new Set(listed);
  const kept = ticked.filter((key) => here.has(key));
  return kept.length === ticked.length ? ticked : kept;
}

/** A row as the hand-over dialog takes it. */
export const handOverJob = (row: Pick<OpsCockpitRow, "id" | "jobNumber" | "handledBy" | "holidayCover">) => ({
  id: row.id,
  jobNumber: row.jobNumber,
  handledBy: row.handledBy,
  holidayCover: row.holidayCover,
});

const jobs = (n: number) => `${n} ${n === 1 ? "job" : "jobs"}`;

/** What is said after an action. "info" for one that changed nothing: not a failure, but not done either. */
export interface ActionToast {
  tone: "success" | "info";
  text: string;
}

/** After a hand-over: how many jobs changed, and how many were left as they were (the dialog said why). */
export function handOverToast(result: Pick<interfaces.HandOverResult, "changed" | "skipped"> | null | undefined): ActionToast {
  if (!result) return { tone: "success", text: "Handed over" };
  const left = result.skipped.length;
  const leftText = left === 0 ? "" : left === 1 ? "1 job left as it was" : `${left} jobs left as they were`;
  if (result.changed === 0) return { tone: "info", text: leftText ? `No job was changed: ${leftText}` : "No job was changed" };
  return { tone: "success", text: [`${jobs(result.changed)} handed over`, leftText].filter(Boolean).join(", ") };
}

/** After a nudge: the to-do is on the job, and who has it under their bell. */
export function nudgeToast(jobNumber: string, result: Pick<interfaces.NudgeResult, "told"> | null | undefined): ActionToast {
  const on = jobNumber ? ` on ${jobNumber}` : "";
  if (!result) return { tone: "success", text: `Nudge left${on}` };
  if (result.told.length === 0) return { tone: "info", text: `To-do left${on}, but nobody has it under their bell: Handled By and Holiday Cover are not users` };
  return { tone: "success", text: `To-do left${on}; under the bell of ${result.told.join(" and ")}` };
}

/** What the missed cut-offs' dialog did, as it tells the page when it closes. */
export type CutoffsChange = "dismissed" | "taken_back";

/**
 * After the missed cut-offs' dialog changed something: a cut-off was dismissed (it then gives no
 * signal on Shipments → Managers nor on the Shipments list), or a dismissal was taken back. When
 * the dialog does not say which - it did both, or it is an older one - this says no more than
 * that something changed and the signals are read again.
 */
export function cutoffsToast(jobNumber: string, what?: CutoffsChange | null): ActionToast {
  const on = jobNumber ? ` on ${jobNumber}` : "";
  if (what === "dismissed") return { tone: "success", text: `Cut-off dismissed${on}: it no longer shows on either page` };
  if (what === "taken_back") return { tone: "success", text: `Dismissal taken back${on}: the cut-off shows again` };
  return { tone: "success", text: `Missed cut-offs${jobNumber ? ` of ${jobNumber}` : ""} changed: the signals are read again` };
}
