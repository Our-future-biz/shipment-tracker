// An amount as people type it, read the one way the web's cost fields read it (parseMoney in
// apps/web/src/lib/money.ts): Czech style "12 500,50" as well as English style "12,500.50". Text
// stored before the screens checked what was typed is read by it too, so a value is never taken
// for another number - "12,500.00" is twelve thousand five hundred, never 12.50. Pure.

/**
 * The amount `text` holds, or null when it holds none: letters, two decimal marks of one kind, more
 * than 2 decimals. Empty text is 0. With both "," and "." the last one is the decimal mark; a lone
 * comma is a thousands separator only in a figure written in threes ("1,250"), else the decimal one.
 */
export function parseTypedAmount(text: string | null | undefined): number | null {
  let t = String(text ?? "").replace(/[\s  ]/g, "");
  if (t === "") return 0;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    t = t.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    // A thousands figure never starts with 0, so "0,500" is a decimal comma (and has too many decimals).
    t = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  }
  return /^-?\d{1,12}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}
