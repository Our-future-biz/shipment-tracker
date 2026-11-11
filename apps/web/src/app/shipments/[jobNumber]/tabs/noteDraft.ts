/** The longest to-do title and details the API takes (shipments note.service). */
export const NOTE_TITLE_MAX = 300;
export const NOTE_DETAILS_MAX = 2000;

/**
 * Free Comments made a to-do: its first line the title (cut to a title's length), and the whole
 * text its details whenever the title does not hold all of it, so nothing is lost when Free
 * Comments is emptied after. Null when the text is too long for a to-do's details: it then stays
 * in Free Comments.
 */
export function freeCommentsAsNote(value: string): { text: string; details?: string } | null {
  const whole = value.trim();
  if (!whole) return null;
  const firstLine = whole.split("\n")[0]!.trim();
  const title = firstLine.length > NOTE_TITLE_MAX ? `${firstLine.slice(0, NOTE_TITLE_MAX - 1).trimEnd()}…` : firstLine;
  if (title === whole) return { text: title };
  return whole.length <= NOTE_DETAILS_MAX ? { text: title, details: whole } : null;
}
