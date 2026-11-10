import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFJS_PUBLIC, PDFJS_SOURCE, pdfjsAssetFiles } from "../../scripts/copy-pdfjs-assets.mjs";

// The file preview draws PDFs with pdf.js (components/PdfView.tsx), which fetches its worker,
// character maps, standard fonts and image decoders from public/pdfjs: a copy of files in the
// installed pdfjs-dist. After a version change the copy has to be made again, or the worker and the
// decoders no longer fit the library: `pnpm --filter web run pdfjs:assets`.
describe("public/pdfjs", () => {
  const expected = pdfjsAssetFiles();

  /** Every file under a folder, as "folder/name"; what the system itself drops there (.DS_Store) is no file of ours. */
  const filesUnder = (dir: string, prefix = ""): string[] =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));

  it("holds exactly the files pdf.js fetches", () => {
    expect(filesUnder(PDFJS_PUBLIC).sort()).toEqual(expected);
  });

  it("is the installed pdfjs-dist's own copy of each", () => {
    const stale = expected.filter((file) => !readFileSync(join(PDFJS_PUBLIC, file)).equals(readFileSync(join(PDFJS_SOURCE, file))));
    expect(stale).toEqual([]);
  });

  it("has the worker, and what a scanned page and a page without its own fonts need", () => {
    expect(expected).toEqual(
      expect.arrayContaining(["legacy/build/pdf.worker.min.mjs", "wasm/jbig2_nowasm_fallback.js", "wasm/openjpeg_nowasm_fallback.js", "standard_fonts/LiberationSans-Regular.ttf"]),
    );
    expect(expected.filter((file) => file.endsWith(".bcmap")).length).toBeGreaterThan(100);
  });
});
