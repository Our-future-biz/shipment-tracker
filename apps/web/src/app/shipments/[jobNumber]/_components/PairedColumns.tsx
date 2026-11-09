import type { ReactNode } from "react";
import { CARD_BODY, COLS2 } from "./detailStyles";

/**
 * One field of a paired card together with the rows drawn above or below it (a note), as one cell:
 * the cell draws the line under it and its field row fills it, so the note doesn't take a row of
 * its own and the two columns stay paired.
 */
export const PAIRED_FIELD =
  "flex flex-col -mx-2 px-2 border-b border-slate-100 last:border-b-0 [&>div]:flex-1 [&>div]:border-b-0";

// A card body of two columns of rows that line up across: both columns share the grid's rows (a
// subgrid), so a row beside a taller one (a user picker, a two-line label) is as tall as it and
// the lines between rows meet. Each item is one row (or one PAIRED_FIELD cell). On a narrow screen
// the right column goes under the left one. `className` replaces the card body's padding.
export function PairedColumns({ left, right, className = CARD_BODY }: { left: ReactNode[]; right: ReactNode[]; className?: string }) {
  const span = { gridRow: `span ${Math.max(left.length, right.length, 1)}` };
  return (
    // content-start: a card stretched beside a taller one keeps its rows at their own height.
    <div className={`${className} ${COLS2} content-start`}>
      <div className="grid grid-rows-subgrid min-w-0" style={span}>
        {left}
      </div>
      <div className="grid grid-rows-subgrid min-w-0" style={span}>
        {right}
      </div>
    </div>
  );
}
