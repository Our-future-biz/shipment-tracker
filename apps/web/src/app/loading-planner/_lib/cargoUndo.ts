// What the cargo table remembers about its list (Council Outlay 14, P5) - the line removed last, for
// Undo, and what a paste brought in - holds only for the list the table left. Pure.

const order = (lines: readonly { id: string }[]) => lines.map((line) => line.id).join("\u0000");

/**
 * Whether the list is still the one the table left right after a removal or a paste: the very lines,
 * in the very order. Typing a figure into a line keeps it. Any other change does not - the lines
 * moved or added, or put in its place from outside (the job's cargo loaded, a colleague's version
 * taken over, lines read from a file) - and Undo would put back a line the list no longer misses: a
 * second copy of its colli, or a second line of its id, which the server refuses.
 */
export const stillTheList = (after: readonly { id: string }[], lines: readonly { id: string }[]): boolean => order(after) === order(lines);
