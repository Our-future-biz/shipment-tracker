import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { PdfFonts } from "./invoicePdf";

/**
 * DejaVu Sans (free licence, see node_modules/dejavu-fonts-ttf/LICENSE): covers Czech
 * diacritics, which the 14 built-in PDF fonts cannot print. Read once, then cached.
 */
let cached: Promise<PdfFonts> | null = null;

export function loadPdfFonts(): Promise<PdfFonts> {
  if (!cached) {
    const require = createRequire(import.meta.url);
    const path = (file: string) => require.resolve(`dejavu-fonts-ttf/ttf/${file}`);
    cached = Promise.all([readFile(path("DejaVuSans.ttf")), readFile(path("DejaVuSans-Bold.ttf"))])
      .then(([regular, bold]) => ({ regular: new Uint8Array(regular), bold: new Uint8Array(bold) }))
      .catch((err) => {
        cached = null; // try again next time instead of caching the failure
        throw err;
      });
  }
  return cached;
}
