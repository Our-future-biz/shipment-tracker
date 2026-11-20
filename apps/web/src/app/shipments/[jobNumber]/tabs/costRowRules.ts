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

/** The few things of an amount box the next rule reads (an input in a table cell, in the browser). */
interface BoxLike {
  closest(selector: string): { nextElementSibling: { querySelector(selector: string): unknown } | null } | null;
}

/**
 * The Cur box an Enter in an amount box goes on to: the currency picker in the next cell, when it is open. An Enter
 * in Est. Amount closed the row before its currency was picked, so 32,000 typed for a USD cost was kept in the
 * billing currency (mock council R4): it moves on to Cur instead, and an Enter there leaves the row open, as a list's
 * does (closesRow), until it is left. Null when the next cell has no open picker (the quote's currency, a locked
 * row): the Enter then does what it did.
 */
export function curBoxAfter<T>(box: BoxLike): T | null {
  const next = box.closest("td")?.nextElementSibling ?? null;
  return (next?.querySelector('.ant-select:not(.ant-select-disabled) input:not([readonly]):not([tabindex="-1"])') as T | null) ?? null;
}

/**
 * Whether a billed shipment's buying row takes its real cost (quantity, amount, currency): a late supplier
 * invoice typed by hand brings its amount with its number, so it reaches Accounts Payable with what is owed
 * (owner's answer to the User Council, Q1). Only on a line that has the number - the one typed in the row, while
 * it is being saved, else the stored one - and either no real amount yet, or a late one (its amount came on the line
 * after the billing, as the server stamps it) whose supplier invoice is not yet approved or paid (`lateRealCostOpen`,
 * read from the server - the web judges no moment itself, system-21 mock council review): typed left to right,
 * Qty → Real Cost → Cur, its currency is still picked after its amount, and a typo is put right on the job (mock
 * council M1). A real cost there when the customer was billed, or a late one once approved, stays as it is. Never
 * on a line of an invoice marked paid; the estimate stays as billed. The server checks the same (lib/billedLock
 * billedBuyingProblem).
 */
export const billedRealCostOpen = (
  row: { invoiceNumber: string; realAmount: string; lateRealCostOpen?: boolean },
  invoicePaid: boolean,
  number: string = row.invoiceNumber,
): boolean => !invoicePaid && !!number.trim() && (!row.realAmount.trim() || !!row.lateRealCostOpen);

/** The codes that come as an import and an export twin, the import's first. */
const DIRECTION_TWINS: readonly (readonly [string, string])[] = [
  ["customs_import", "customs_export"],
  ["air_import_handling", "air_export_handling"],
];

/**
 * A category list with the job's own direction first in each import / export twin: "customs" typed
 * on an export listed the import customs-clearance fee first (user council O25). Everything else
 * keeps its place; a job with no direction keeps the list as it is.
 */
export function ownDirectionFirst<T extends { value: string }>(options: T[], tradeDirection: string | null | undefined): T[] {
  const dir = (tradeDirection ?? "").trim().toLowerCase();
  if (dir !== "import" && dir !== "export") return options;
  const out = [...options];
  for (const [imp, exp] of DIRECTION_TWINS) {
    const [own, other] = dir === "export" ? [exp, imp] : [imp, exp];
    const o = out.findIndex((x) => x.value === own);
    const t = out.findIndex((x) => x.value === other);
    if (o < 0 || t < 0 || o < t) continue;
    const [moved] = out.splice(o, 1);
    out.splice(t, 0, moved!);
  }
  return out;
}
