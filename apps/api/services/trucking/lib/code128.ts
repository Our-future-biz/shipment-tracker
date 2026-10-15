// Code 128 barcodes, code set B (printable ASCII 32–126), for the consignment ref on the piece
// labels. Pure: gives the bar and space widths in modules; labelsPdf.ts draws them.

/**
 * Bar / space widths (in modules) of the 107 Code 128 symbols, by symbol value. Each symbol is
 * bar, space, bar, space, bar, space (11 modules); 103–105 are the start codes A, B, C and 106 is
 * the stop code, which has a closing bar (13 modules).
 */
export const CODE128_PATTERNS: readonly string[] = [
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

const START_B = 104;
const STOP = 106;

/** Symbol values of `text` in code set B: start B, the characters, the checksum, stop. Throws on characters outside ASCII 32–126. */
export function code128BValues(text: string): number[] {
  if (!text) throw new Error("Code 128: nothing to encode");
  const data = [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (ch.length !== 1 || code < 32 || code > 126) throw new Error(`Code 128 B cannot encode "${ch}"`);
    return code - 32;
  });
  const checksum = data.reduce((sum, value, i) => sum + value * (i + 1), START_B) % 103;
  return [START_B, ...data, checksum, STOP];
}

/** Bar and space widths in modules, alternating and starting with a bar, without the quiet zones. */
export function code128BWidths(text: string): number[] {
  return code128BValues(text).flatMap((value) => [...CODE128_PATTERNS[value]!].map(Number));
}
