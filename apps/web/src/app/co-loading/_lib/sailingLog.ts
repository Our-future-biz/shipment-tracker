// A sailing's Checklist and history tab and the checklist it carries (Council Outlay 14, C5 and C6):
// the customers still to tell, the hand-over note's box, and the company's lists of steps as
// Co-Loading settings edits them. Pure, so it is tested without React.

import type { interfaces } from "@/lib/api/client";

/** The rows not told yet: what the tick-all ticks, and what the count says is still to do. */
export const toTell = <T extends Pick<interfaces.SailingNoticeRow, "told">>(rows: readonly T[]): T[] => rows.filter((r) => r.told === null);

export type ChecklistDirection = "import" | "export";

/** The two lists of checklist steps as their boxes hold them: one step per line. */
export type ChecklistTexts = Record<ChecklistDirection, string>;

/** The stored lists as the boxes show them; empty before they are read. */
export const checklistTexts = (s: { checklistImport: string[]; checklistExport: string[] } | null | undefined): ChecklistTexts => ({
  import: (s?.checklistImport ?? []).join("\n"),
  export: (s?.checklistExport ?? []).join("\n"),
});

/**
 * The boxes once one list is saved: that one as the server keeps it (steps trimmed, empty lines
 * dropped), the other as it is being typed - an edit not saved yet is never thrown away.
 */
export const afterChecklistSave = (now: ChecklistTexts, direction: ChecklistDirection, saved: { checklistImport: string[]; checklistExport: string[] }): ChecklistTexts => ({
  ...now,
  [direction]: checklistTexts(saved)[direction],
});

/** The hand-over note's box: what is typed in it, and the stored note it started from. */
export interface NoteEditor {
  text: string;
  startedFrom: string;
}

/**
 * The box when the stored note is read (again): it follows the stored note while nothing else is
 * typed in it - or once it says the same, as after one's own save. Anything else typed is kept: a
 * colleague's note read meanwhile never wipes it.
 */
export function noteEditorOnRead(now: NoteEditor, stored: string): NoteEditor {
  return now.text === now.startedFrom || now.text.trim() === stored ? { text: stored, startedFrom: stored } : now;
}

/**
 * What Save sends: the note, and the note the box started from as `expected`, so a note a colleague
 * changed meanwhile is refused by the server (naming who) instead of written over unseen.
 */
export const noteRequest = (e: NoteEditor): { note: string; expected: string } => ({ note: e.text.trim(), expected: e.startedFrom });

/** A colleague's note was stored since the box started from another, and the box says something else: theirs is shown beside it. */
export const noteChangedMeanwhile = (e: NoteEditor, stored: string): boolean => e.startedFrom !== stored && e.text.trim() !== stored;
