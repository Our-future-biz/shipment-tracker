"use client";

import { useEffect, useState } from "react";
import { EMPTY_LINE, lineInvalid, parseLines, serializeLines, type RemeasureLine } from "../../_lib/cargoCompare";
import type { SectionKeyChange } from "@/hooks/useWarehouseConceptSection";

// The unsaved edits of a position's Shipment Details: notes and remeasured lines, saved together
// by one "Save changes" bar. Each field remembers the saved value the edit started from
// (`base`); a save writes only changed fields, each only if it is still that value. When
// someone else saved a field meanwhile, the user's edit stays and theirs is shown beside it
// until the user chooses (the save is held back).

const text = (v: unknown) => (typeof v === "string" ? v : "");
const withBlank = (rows: RemeasureLine[]) => (rows.length ? rows : [{ ...EMPTY_LINE }]);

export function useJobDraft(data: Record<string, unknown>) {
  const savedNotes = text(data.notes);
  const savedLines = text(data.remeasure_rows);

  const [notes, setNotesState] = useState(savedNotes);
  const [notesBase, setNotesBase] = useState(savedNotes);
  // A newer saved text replaces the box only while it holds no edit of the user's own.
  useEffect(() => {
    if (notes === notesBase || notes === savedNotes) {
      setNotesState(savedNotes);
      setNotesBase(savedNotes);
    }
  }, [savedNotes, notes, notesBase]);

  const [rows, setRowsState] = useState<RemeasureLine[]>(() => withBlank(parseLines(savedLines)));
  const [linesEdited, setLinesEdited] = useState(false);
  const [linesBase, setLinesBase] = useState(savedLines);
  // The saved lines fill the table only while it holds no unsaved edit.
  useEffect(() => {
    if (linesEdited) return;
    setRowsState(withBlank(parseLines(savedLines)));
    setLinesBase(savedLines);
  }, [savedLines, linesEdited]);

  const linesValue = serializeLines(rows);
  const notesChanged = notes !== savedNotes;
  const linesChanged = linesEdited && linesValue !== (savedLines || "[]");
  const notesConflict = savedNotes !== notesBase && notes !== savedNotes;
  const linesConflict = linesEdited && savedLines !== linesBase && linesValue !== savedLines;
  const invalidLines = rows.filter(lineInvalid).length;

  const setRows = (next: RemeasureLine[] | ((prev: RemeasureLine[]) => RemeasureLine[])) => {
    setRowsState(next);
    setLinesEdited(true);
  };

  /** The fields to send; [] when nothing changed. */
  const changes = (): SectionKeyChange[] => [
    ...(notesChanged ? [{ key: "notes", value: notes, expected: notesBase }] : []),
    ...(linesChanged ? [{ key: "remeasure_rows", value: linesValue, expected: linesBase }] : []),
  ];

  /** After a save landed: the saved values are the new starting point. */
  const saved = (sent: SectionKeyChange[]) => {
    for (const c of sent) {
      if (c.key === "notes") setNotesBase(c.value);
      if (c.key === "remeasure_rows") {
        setLinesBase(c.value);
        setLinesEdited(false);
      }
    }
  };

  const discard = () => {
    setNotesState(savedNotes);
    setNotesBase(savedNotes);
    setLinesEdited(false);
    setRowsState(withBlank(parseLines(savedLines)));
    setLinesBase(savedLines);
  };

  return {
    notes,
    setNotes: setNotesState,
    rows,
    setRows,
    savedNotes,
    savedLines,
    notesChanged,
    linesChanged,
    notesConflict,
    linesConflict,
    invalidLines,
    count: (notesChanged ? 1 : 0) + (linesChanged ? 1 : 0),
    changes,
    saved,
    discard,
    // "Use theirs" drops the edit; "Keep mine" saves over theirs knowingly.
    notesUseTheirs: () => {
      setNotesState(savedNotes);
      setNotesBase(savedNotes);
    },
    notesKeepMine: () => setNotesBase(savedNotes),
    linesUseTheirs: () => setLinesEdited(false),
    linesKeepMine: () => setLinesBase(savedLines),
  };
}

export type JobDraft = ReturnType<typeof useJobDraft>;
