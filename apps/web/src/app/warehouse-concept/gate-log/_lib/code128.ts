// Code 128 (code set B) for the warehouse label, drawn as plain rectangles — no barcode
// package. Code set B covers printable ASCII (32–126), which is all a WCZ reference uses.

// Bar / space widths (in modules) of the 107 symbols: values 0–102, Start A/B/C (103–105)
// and Stop (106). Every symbol is 11 modules wide, the stop 13.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
export const CODE128_PATTERNS: readonly string[] = PATTERNS;
const START_B = 104;
const STOP = 106;

/** Symbol values of `text` in code set B: start, data, mod-103 check symbol, stop. */
export function code128BValues(text: string): number[] {
  const data = [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (ch.length !== 1 || code < 32 || code > 126) throw new Error(`Code 128 B cannot encode "${ch}"`);
    return code - 32;
  });
  if (!data.length) throw new Error("Nothing to encode");
  const check = data.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
  return [START_B, ...data, check, STOP];
}

/** Bar and space widths in modules, starting with a bar. */
export function code128B(text: string): number[] {
  return code128BValues(text).flatMap((v) => [...PATTERNS[v]!].map(Number));
}

// Thermal printers print in 0.125 mm dots (203 dpi), so bars are whole dots.
const DOT = 0.125;
const MAX_MODULE = 0.375;
const QUIET_MODULES = 10;

type Drawable = { rect: (x: number, y: number, w: number, h: number, style?: string) => unknown };

/**
 * Draws the barcode of `text` centred in the box (x, y, w, h), with a 10-module quiet zone each
 * side. Throws when the text cannot be encoded or does not fit; returns the bars' width in mm.
 */
export function drawCode128(doc: Drawable, x: number, y: number, w: number, h: number, text: string): number {
  const widths = code128B(text);
  const modules = widths.reduce((a, b) => a + b, 0);
  const moduleMm = Math.floor(Math.min(MAX_MODULE, w / (modules + 2 * QUIET_MODULES)) / DOT) * DOT;
  if (moduleMm < DOT) throw new Error("Barcode does not fit");
  const total = modules * moduleMm;
  // Start on a whole dot too, so every bar edge lands on the printer's dot grid.
  let cx = Math.round((x + (w - total) / 2) / DOT) * DOT;
  widths.forEach((n, i) => {
    if (i % 2 === 0) doc.rect(cx, y, n * moduleMm, h, "F");
    cx += n * moduleMm;
  });
  return total;
}
