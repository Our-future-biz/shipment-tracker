// Small rules of Costs Breakdown's open rows, kept apart from the tab so they can be tested on their own.

/** The few things of a pressed or focused element the rules read (an Element in the browser). */
interface FieldLike {
  tagName: string;
  type?: string;
  closest(selector: string): unknown;
}

/**
 * Whether an Enter closes the open row: only one in a plain text or amount box of the row itself. An Enter in a
 * Select (category, currency) or the vendor field picks from its list, and one in a pop-up of the row (a date
 * picker, a dialog - inside the row in React, not on the page) belongs to it: neither leaves the row (User Council
 * B3, O7). The row then stays open until it is left, as a click elsewhere leaves it.
 */
export function closesRow(target: EventTarget | null, row: { contains(node: Node | null): boolean }): boolean {
  const el = target as unknown as FieldLike | null;
  if (!el || el.tagName !== "INPUT" || (el.type ?? "text") !== "text") return false;
  if (el.closest(".ant-select, .ant-picker")) return false;
  return row.contains(el as unknown as Node);
}

/**
 * Whether a billed shipment's buying row takes its real cost (quantity, amount, currency): a late supplier
 * invoice typed by hand brings its amount with its number, so it reaches Accounts Payable with what is owed
 * (owner's answer to the User Council, Q1). Only on a line that has the number - the one typed in the row, while
 * it is being saved, else the stored one - and no real amount yet: a real cost on the line, there when the
 * customer was billed or typed since, stays as billed (nothing kept tells which). Never on a line of an invoice
 * marked paid; the estimate stays as billed. The server checks the same (lib/billedLock billedBuyingProblem).
 */
export const billedRealCostOpen = (
  row: { invoiceNumber: string; realAmount: string },
  invoicePaid: boolean,
  number: string = row.invoiceNumber,
): boolean => !invoicePaid && !!number.trim() && !row.realAmount.trim();
