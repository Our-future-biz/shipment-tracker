import type { ReactNode } from "react";
import { CARD_BODY, COLS2 } from "./detailStyles";

/**
 * One field of a paired card together with the rows drawn above or below it (a note), as one cell:
 * the cell draws the line under it and its field row fills it, so the note doesn't take a row of
 * its own and the two columns stay paired.
 */
export const PAIRED_FIELD =
  "flex flex-col -mx-2 px-2 border-b border-slate-100 last:border-b-0 [&>div]:flex-1 [&>div]:border-b-0";

// How many of the grid's rows a column spans, written out in full so Tailwind finds each class
// (a class put together at run time would never be generated). A card has far fewer rows than this.
const ROW_SPAN = [
  "row-span-1",
  "row-span-2",
  "row-span-3",
  "row-span-4",
  "row-span-5",
  "row-span-6",
  "row-span-7",
  "row-span-8",
  "row-span-9",
  "row-span-10",
  "row-span-11",
  "row-span-12",
  "row-span-13",
  "row-span-14",
  "row-span-15",
  "row-span-16",
  "row-span-17",
  "row-span-18",
  "row-span-19",
  "row-span-20",
] as const;

/** The class spanning `rows` rows (at least one, at most the longest the list has). */
const rowSpan = (rows: number) => ROW_SPAN[Math.min(Math.max(rows, 1), ROW_SPAN.length) - 1];

// A card body of two columns of rows that line up across: both columns share the grid's rows (a
// subgrid), so a row beside a taller one (a user picker, a two-line label) is as tall as it and
// the lines between rows meet. Each item is one row (or one PAIRED_FIELD cell). On a narrow screen
// the right column goes under the left one. `className` replaces the card body's padding.
export function PairedColumns({ left, right, className = CARD_BODY }: { left: ReactNode[]; right: ReactNode[]; className?: string }) {
  const span = rowSpan(Math.max(left.length, right.length));
  return (
    // content-start: a card stretched beside a taller one keeps its rows at their own height.
    <div className={`${className} ${COLS2} content-start`}>
      <div className={`grid grid-rows-subgrid min-w-0 ${span}`}>{left}</div>
      <div className={`grid grid-rows-subgrid min-w-0 ${span}`}>{right}</div>
    </div>
  );
}
