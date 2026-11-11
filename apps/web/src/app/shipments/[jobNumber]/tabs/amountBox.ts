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
