import { amountEdited, amountInBox } from "@/lib/money";

/** An amount box of the cost tables, as its blur sees it: what it holds now (it is not a controlled field). */
interface AmountBox {
  value: string;
}

/**
 * Leaving an amount box: saved when it is another amount, and written the way figures are, 1,250.50.
 * The box keeps what was typed while the save runs; `save` is handed what to do when the save is
 * refused (an amount that is no number, an invoiced row): the box shows the stored amount again, so
 * nothing stays on screen that was never saved.
 */
export const onAmountBlur =
  (stored: string | null | undefined, save: (typed: string, onRefused: () => void) => void) =>
  (e: { target: AmountBox }) => {
    const box = e.target;
    const typed = box.value;
    box.value = amountInBox(typed);
    if (!amountEdited(typed, stored)) return;
    save(typed, () => {
      box.value = amountInBox(stored);
    });
  };

/**
 * A real-cost box of a buying line (Qty, Real Cost; RealCostInput) beyond its text (review of system-22). It is no
 * controlled field either, and once its text was written (on every blur) or typed, a later defaultValue no longer
 * reaches it: a real cost loaded again shows only when it is written in. And the line's saves send as was-values
 * what its boxes show (`drawn`), not the row as last loaded: on a billed job a real cost reloaded while the box still
 * showed an older one is refused, not typed over unseen (mock test run F1).
 */
export interface ShownAmount {
  /** The stored value the box shows: as last written into it, or as it was when the user went into it. */
  drawn: string;
  /** The box's text when the user went into it; null while they are not in it. */
  focusText: string | null;
  /** Its own saves still running: what was typed stays in it meanwhile, not each save's reload in turn. */
  saving: number;
}

/** A step of the box: its text written anew (null: left as it is) and the stored value it shows then. */
export interface AmountBoxStep {
  write: string | null;
  drawn: string;
}

/**
 * A stored value loaded (again) while the box holds `text`. A box not in use shows it at once. One the user is in,
 * or whose own save still runs, keeps its text - and counts the stored value as shown only when it is what the box
 * showed as the user went in, or holds now (their own save, loaded back). Else the box still shows the one before:
 * a save typed there goes on that one, and is refused if the change was someone else's.
 */
export function amountLoaded(box: ShownAmount, text: string, stored: string): AmountBoxStep {
  if (stored === box.drawn) return { write: null, drawn: box.drawn };
  if (box.focusText !== null) return { write: null, drawn: amountEdited(box.focusText, stored) ? box.drawn : stored };
  if (box.saving > 0) return { write: null, drawn: amountEdited(text, stored) ? box.drawn : stored };
  return { write: amountInBox(stored), drawn: stored };
}

/**
 * Leaving the box with `typed` in it while the line holds `stored`: what to save (null: nothing was typed) and the box
 * then, written the way figures are. Whether something was typed is told by what the box showed as the user went in,
 * not by the row as loaded, which lags behind one's own save still running: 1000 typed over a 1450 that still saves
 * is a save of 1000, not "the stored amount" (review of system-22).
 */
export function amountLeft(box: ShownAmount, typed: string, stored: string): AmountBoxStep & { write: string; save: string | null } {
  const before = box.focusText ?? amountInBox(box.drawn);
  if (amountEdited(typed, before)) return { save: typed, write: amountInBox(typed), drawn: box.drawn };
  // Nothing typed: a value loaded while the user was in the box shows now - unless an own save of it still runs,
  // whose reload (or refusal) puts it right.
  const catchUp = stored !== box.drawn && box.saving === 0;
  return { save: null, write: amountInBox(catchUp ? stored : typed), drawn: catchUp ? stored : box.drawn };
}

/** A save of the box refused (or dropped): it shows the line's stored value again, nothing that was never saved. */
export const amountRefused = (stored: string): AmountBoxStep & { write: string } => ({ write: amountInBox(stored), drawn: stored });
