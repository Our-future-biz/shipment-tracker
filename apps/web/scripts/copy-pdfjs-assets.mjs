// Copies the files pdf.js fetches while it draws a PDF (its worker, character maps, the standard
// fonts, and the plain-JavaScript image decoders) from the installed pdfjs-dist into public/pdfjs,
// where the app serves them. Run it after changing the pdfjs-dist version:
// `pnpm --filter web run pdfjs:assets`. src/lib/pdfjsAssets.test.ts fails when the two drift apart.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const web = join(dirname(self), "..");

/** The installed library the files come from, and the folder the app serves them from. */
export const PDFJS_SOURCE = join(web, "node_modules", "pdfjs-dist");
export const PDFJS_PUBLIC = join(web, "public", "pdfjs");

/** Folder in pdfjs-dist, and which of its files the app needs. */
const ASSETS = [
  // The half of pdf.js that reads the file, as the library ships it (the build that fits the app's own half).
  { dir: "legacy/build", keep: (name) => name === "pdf.worker.min.mjs" },
  { dir: "cmaps", keep: () => true },
  { dir: "standard_fonts", keep: () => true },
  // Only the decoders written in JavaScript: the app's content policy does not allow WebAssembly.
  { dir: "wasm", keep: (name) => name.endsWith("_nowasm_fallback.js") || /^LICENSE_(PDFJS_)?(JBIG2|OPENJPEG)$/.test(name) },
];

/** Every file the app serves, as "folder/name", in order. */
export function pdfjsAssetFiles() {
  return ASSETS.flatMap(({ dir, keep }) =>
    readdirSync(join(PDFJS_SOURCE, dir))
      .filter(keep)
      .map((name) => `${dir}/${name}`),
  ).sort();
}

function copy() {
  if (!existsSync(PDFJS_SOURCE)) throw new Error("pdfjs-dist is not installed; run pnpm install first");
  rmSync(PDFJS_PUBLIC, { recursive: true, force: true });
  const files = pdfjsAssetFiles();
  for (const file of files) {
    mkdirSync(dirname(join(PDFJS_PUBLIC, file)), { recursive: true });
    cpSync(join(PDFJS_SOURCE, file), join(PDFJS_PUBLIC, file));
  }
  console.log(`Copied ${files.length} pdf.js files to public/pdfjs`);
}

// Only when run as a script: the test imports the list above without copying anything.
if (process.argv[1] && resolve(process.argv[1]) === self) copy();
