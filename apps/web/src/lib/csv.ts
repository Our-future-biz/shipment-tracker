// The writer of the app's CSV files, so how a file is written - its encoding, its escaping, what
// protects whoever opens it - is decided in one place.

// What stands between the cells of a row.
export const CSV_SEPARATOR = ",";

// A spreadsheet runs a cell that starts with one of these as a formula, and a formula can open a
// link or start a program: a customer's name of "=HYPERLINK(…)" would be run, not read.
const RUN_AS_FORMULA = /^[=+\-@\t\r]/;

// A number below zero starts like a formula and is none: "-5.00" has to stay a number the
// spreadsheet can add up. Only a minus counts as a sign, so "+420777123456" stays the text it is.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

// One cell as the file holds it: text that would run as a formula gets an apostrophe in front,
// which makes the spreadsheet read it as text; every cell is quoted, its own quotes doubled.
// Whatever a cell turns out to hold is written as text: what is exported is often loose stored
// data, and one number where a name should be must not cost the whole file.
function csvCell(value: string): string {
  const raw = String(value ?? "");
  const text = RUN_AS_FORMULA.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The text of a CSV file: one line per row, the headings being the first. */
export function csvText(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(CSV_SEPARATOR)).join("\n");
}

/** Hands the rows to the browser as a CSV file to save. */
export function downloadCsv(fileName: string, rows: string[][]): void {
  // The UTF-8 mark in front, so Excel reads the diacritics correctly.
  const blob = new Blob(["\uFEFF" + csvText(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
