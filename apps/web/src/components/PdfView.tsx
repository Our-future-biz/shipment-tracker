"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Spin } from "antd";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { HINT } from "@/styles/ui";

// A PDF drawn by the app itself (with pdf.js), page under page on the dialog's own white: only the
// document. The browser's built-in viewer in a frame brings its own toolbar and dark backdrop, which
// a page can neither style nor hide. Pages are drawn as they come near and their pictures dropped as
// they leave; their text lies over them, so it can be selected, copied and found by the browser's
// search. A file pdf.js can't draw (one that asks for a password, one of thousands of pages) or a
// browser it can't run in gets `fallback` - the browser's own viewer; a file that is no PDF inside
// is reported with `onBroken`, for no viewer opens it.
//
// pdf.js's worker, and the character maps, standard fonts and two image decoders it fetches while it
// works, are the library's own files, served by the app from public/pdfjs
// (scripts/copy-pdfjs-assets.mjs keeps them in step).

type Pdfjs = typeof import("pdfjs-dist");

/** CSS pixels per PDF point (a point is 1/72 inch; the web counts 96 pixels to an inch). */
const PDF_TO_CSS = 96 / 72;
/** A page is as wide as the dialog lets it be, but never beyond 125% of its real size. */
const MAX_ZOOM = 1.25;
/** The most pixels one page is drawn with (browsers cap a canvas); past it a page is drawn less sharp. */
const MAX_PIXELS = 4096 * 4096;
/** Redrawing while the dialog is being resized waits for the size to settle. */
const REDRAW_DELAY = 150;
/** A frame is laid out for every page at once: a file of more pages goes to the browser's own viewer. */
const MAX_PAGES = 2000;
/**
 * This many pages from the first get their text without being looked at, so the browser's search and
 * Select All reach them; a page further on gets its text when it first comes near.
 */
const TEXT_PAGES = 50;

/** A page as it is shown (turned as the file says), in CSS pixels at 100%. */
interface PageSize {
  width: number;
  height: number;
  /** The file's own multiplier of its units (1 for nearly every file). */
  unit: number;
}

const pageSize = (page: PDFPageProxy): PageSize => {
  const { width, height } = page.getViewport({ scale: PDF_TO_CSS });
  // A file can say anything: a size that is no real number can be neither laid out nor drawn.
  if (![width, height, page.userUnit].every((value) => Number.isFinite(value) && value > 0)) throw new Error("A page without a size");
  return { width, height, unit: page.userUnit };
};

const sameSize = (a: PageSize, b: PageSize) => Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01 && a.unit === b.unit;

/**
 * The half of pdf.js that reads the file runs beside the page (a worker). Its script is handed to
 * pdf.js as bytes already fetched: pdf.js starts a worker for every file and takes one failed fetch
 * of the script for good, so after this nothing hangs on the connection, nor on the type a server
 * names for an .mjs file.
 */
async function workerScript(): Promise<string> {
  const response = await fetch(`${window.location.origin}/pdfjs/legacy/build/pdf.worker.min.mjs`);
  if (!response.ok) throw new Error(`The pdf.js worker could not be fetched (${response.status})`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: "text/javascript" }));
}

let pdfjsLoading: Promise<Pdfjs> | null = null;

/**
 * pdf.js, fetched when the first PDF is opened. Its build for older browsers still needs one of the
 * last few years (Chrome 119, Firefox 122, Safari 17.4): an older one is not made to fetch it in vain.
 */
function loadPdfjs(): Promise<Pdfjs> {
  if (!("withResolvers" in Promise && "transferToFixedLength" in ArrayBuffer.prototype)) return Promise.reject(new Error("pdf.js does not run in this browser"));
  if (!pdfjsLoading) {
    const worker = workerScript();
    const loading = Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), worker]).then(([pdfjs, workerSrc]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    });
    pdfjsLoading = loading;
    // A fetch that failed (the connection dropped for a moment) is tried again with the next file.
    loading.catch(() => {
      if (pdfjsLoading === loading) pdfjsLoading = null;
      worker.then(
        (script) => URL.revokeObjectURL(script),
        () => {},
      );
    });
  }
  return pdfjsLoading;
}

/** Gives a canvas's memory back at once, not when the browser gets round to it. */
function dropCanvases(host: Element | null) {
  if (!host) return;
  for (const canvas of host.querySelectorAll("canvas")) {
    canvas.width = 0;
    canvas.height = 0;
  }
  host.replaceChildren();
}

interface LoadedPdf {
  pdfjs: Pdfjs;
  pdf: PDFDocumentProxy;
  /** Every page's size. A page not read yet is taken to be as large as the first. */
  sizes: PageSize[];
}

const FIRST_PAGE: ReadonlySet<number> = new Set([1]);

/** Where the reader is: the page at the top of what is in sight, and how far into it. */
interface Place {
  page: number;
  /** How much of the page lies above the top of what is in sight (0 to 1). */
  part: number;
  /** Or, when the top is in the gap before the page: the pixels down to it. */
  gap: number;
}

interface PdfViewProps {
  /** One view shows one file: a `key` gives the next file a view of its own. */
  blob: Blob;
  /** The file's name, for screen readers. */
  title: string;
  /** Shown when pdf.js can't run here or can't draw this file (one that asks for a password, say). */
  fallback: ReactNode;
  /** Called for a file that is no PDF inside: the caller shows something else in this view's place. */
  onBroken: () => void;
}

export function PdfView({ blob, title, fallback, onBroken }: PdfViewProps) {
  const [doc, setDoc] = useState<LoadedPdf | null>(null);
  /** Why the pages can't be drawn here, once that is known: the file is no PDF inside, or anything else. */
  const [failed, setFailed] = useState<"broken" | "other" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  /** The width pages may take. */
  const [room, setRoom] = useState(0);
  /** The pages in or near sight: only they are drawn. */
  const [near, setNear] = useState(FIRST_PAGE);
  /** The page whose turn it is to get its text without being looked at: one after another, from the first. */
  const [textTurn, setTextTurn] = useState(1);
  /** The screen's pixels to one CSS pixel. */
  const [density, setDensity] = useState(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const place = useRef<Place>({ page: 1, part: 0, gap: 0 });

  // The pages are drawn anew, as sharp as the screen, when the window moves to another screen or the
  // browser's zoom changes.
  useEffect(() => {
    const screen = window.matchMedia(`(resolution: ${density}dppx)`);
    const changed = () => setDensity(window.devicePixelRatio || 1);
    screen.addEventListener("change", changed);
    return () => screen.removeEventListener("change", changed);
  }, [density]);

  useEffect(() => {
    let live = true;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      const [pdfjs, buffer] = await Promise.all([loadPdfjs(), blob.arrayBuffer()]);
      if (!live) return;
      const assets = `${window.location.origin}/pdfjs/`;
      task = pdfjs.getDocument({
        // The bytes themselves (pdf.js hands them to its worker); the blob stays for Download.
        data: new Uint8Array(buffer),
        cMapUrl: `${assets}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets}standard_fonts/`,
        wasmUrl: `${assets}wasm/`,
        // The app's content policy allows no WebAssembly: scans are decoded by the plain-JavaScript decoders.
        useWasm: false,
      });
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PAGES) throw new Error("Too many pages to draw here");
      const first = pageSize(await pdf.getPage(1));
      if (!live) return;
      setDoc({ pdfjs, pdf, sizes: Array.from({ length: pdf.numPages }, () => first) });

      // The other pages' own sizes, so a file of mixed formats has its real length from the start.
      const sizes = [first];
      let mixed = false;
      for (let number = 2; number <= pdf.numPages; number += 1) {
        // A page that can't be read keeps the first page's size; it says so itself when it is drawn.
        const size = await pdf
          .getPage(number)
          .then(pageSize)
          .catch(() => first);
        if (!live || task.destroyed) return;
        mixed ||= !sameSize(size, first);
        sizes.push(size);
      }
      if (mixed) setDoc((current) => current && { ...current, sizes });
    })().catch((error: unknown) => {
      // Nothing of pdf.js keeps running behind what is shown instead of the pages.
      task?.destroy().catch(() => {});
      if (live) setFailed((error as { name?: unknown } | null)?.name === "InvalidPDFException" ? "broken" : "other");
    });
    return () => {
      live = false;
      // Ends the document's worker too.
      task?.destroy().catch(() => {});
    };
  }, [blob]);

  // The same for a file that opened but whose first page could not be drawn.
  const pdf = doc?.pdf;
  useEffect(() => {
    if (failed && pdf) pdf.loadingTask.destroy().catch(() => {});
  }, [failed, pdf]);

  // Before the screen is drawn again, so nothing shows between the spinner and what the caller puts here.
  useLayoutEffect(() => {
    if (failed === "broken") onBroken();
  }, [failed, onBroken]);

  // What pdf.js keeps for measuring text is let go with the last PDF.
  const pdfjs = doc?.pdfjs;
  useEffect(() => {
    if (!pdfjs) return;
    return () => pdfjs.TextLayer.cleanup();
  }, [pdfjs]);

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const measure = () => setRoom(Math.floor(column.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [failed]);

  const pageCount = doc && room > 0 ? doc.sizes.length : 0;
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageCount === 0) return;
    // A screen's height above and below what is in sight counts as near.
    const observer = new IntersectionObserver(
      (entries) =>
        setNear((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const number = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(number);
            else next.delete(number);
          }
          const same = next.size === current.size && [...next].every((number) => current.has(number));
          return same ? current : next;
        }),
      { root, rootMargin: "100% 0px" },
    );
    for (const page of root.querySelectorAll("[data-page]")) observer.observe(page);
    return () => observer.disconnect();
  }, [pageCount]);

  // While text is being selected, a sheet over every page's empty spots keeps the selection steady
  // (see .pdf-text-end in globals.css).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageCount === 0) return;
    const start = () => root.classList.add("selecting");
    const end = () => root.classList.remove("selecting");
    root.addEventListener("mousedown", start);
    window.addEventListener("mouseup", end);
    window.addEventListener("blur", end);
    return () => {
      root.removeEventListener("mousedown", start);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("blur", end);
    };
  }, [pageCount]);

  // The reader's place is kept when the pages change size (the window was resized, a page turned out
  // to be of another format): noted while scrolling, found again once the pages have their new sizes.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageCount === 0) return;
    const note = () => {
      const top = root.getBoundingClientRect().top;
      for (const page of root.querySelectorAll<HTMLElement>("[data-page]")) {
        const box = page.getBoundingClientRect();
        if (box.bottom <= top) continue;
        const into = top - box.top;
        place.current = { page: Number(page.dataset.page), part: into > 0 ? into / box.height : 0, gap: into < 0 ? -into : 0 };
        return;
      }
    };
    root.addEventListener("scroll", note, { passive: true });
    return () => root.removeEventListener("scroll", note);
  }, [pageCount]);

  const sizes = doc?.sizes;
  useLayoutEffect(() => {
    const root = scrollRef.current;
    const { page, part, gap } = place.current;
    const box = root?.querySelector(`[data-page="${page}"]`)?.getBoundingClientRect();
    if (!root || !box) return;
    const shift = box.top + part * box.height - gap - root.getBoundingClientRect().top;
    if (Math.abs(shift) >= 1) root.scrollTop += shift;
  }, [room, sizes]);

  const fitSize = useCallback((number: number, size: PageSize) => {
    setDoc((current) => current && { ...current, sizes: current.sizes.map((known, index) => (index === number - 1 ? size : known)) });
  }, []);

  // A first page that can't be drawn means pdf.js can't cope with this file or this browser.
  const pageBroken = useCallback((number: number) => {
    if (number === 1) setFailed("other");
  }, []);

  // The page whose turn it was has its text (or can't have one): the next page's turn.
  const textLaid = useCallback((number: number) => setTextTurn((turn) => (number === turn ? turn + 1 : turn)), []);

  // A copy carries the words alone. The text over the pages is see-through (what is read is the
  // picture under it), and copied with that look it would paste as nothing to see.
  const copyWords = (event: ClipboardEvent<HTMLDivElement>) => {
    const words = window.getSelection()?.toString();
    if (!words || !doc) return;
    event.clipboardData.setData("text/plain", doc.pdfjs.normalizeUnicode(words).replace(/\u0000/g, ""));
    event.preventDefault();
  };

  // Select All takes the document's text, not the app's page behind the dialog.
  const selectAll = (event: KeyboardEvent<HTMLDivElement>) => {
    const column = columnRef.current;
    if (!column || event.key.toLowerCase() !== "a" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    event.preventDefault();
    window.getSelection()?.selectAllChildren(column);
  };

  // (A file that is no PDF inside keeps its spinner for the moment until the caller takes over.)
  if (failed === "other") return <>{fallback}</>;

  return (
    // The scrollbar's place is always kept: one that came and went with the pages' size would make them jump.
    // The reader's place is kept by this component alone (not by the browser's scroll anchoring as well).
    <div
      ref={scrollRef}
      role="document"
      aria-label={title}
      tabIndex={0}
      onCopy={copyWords}
      onKeyDown={selectAll}
      className="h-full overflow-x-auto overflow-y-scroll rounded bg-white [overflow-anchor:none] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
    >
      <div ref={columnRef} className="flex min-h-full flex-col items-center gap-3">
        {!doc || room <= 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Spin />
          </div>
        ) : (
          doc.sizes.map((size, index) => (
            <PdfPage
              key={index}
              pdfjs={doc.pdfjs}
              pdf={doc.pdf}
              number={index + 1}
              size={size}
              // The page's frame (1px a side) is counted in.
              width={Math.max(1, Math.floor(Math.min(room - 2, size.width * MAX_ZOOM)))}
              density={density}
              near={near.has(index + 1)}
              text={index < Math.min(textTurn, TEXT_PAGES)}
              onSize={fitSize}
              onText={textLaid}
              onBroken={pageBroken}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface PdfPageProps {
  pdfjs: Pdfjs;
  pdf: PDFDocumentProxy;
  /** From 1. */
  number: number;
  size: PageSize;
  /** The width it is shown at, in CSS pixels. */
  width: number;
  /** The screen's pixels to one CSS pixel. */
  density: number;
  near: boolean;
  /** Its text is wanted though the page may be far from what is in sight. */
  text: boolean;
  /** The page turned out to be of another size than it was taken for. */
  onSize: (number: number, size: PageSize) => void;
  /** The text wanted with `text` is there (or the page has none to give). */
  onText: (number: number) => void;
  onBroken: (number: number) => void;
}

const PdfPage = memo(function PdfPage({ pdfjs, pdf, number, size, width, density, near, text, onSize, onText, onBroken }: PdfPageProps) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  /** The text has been laid over the page, or tried and found impossible: once for the page's life. */
  const [laid, setLaid] = useState(false);
  const zoom = width / size.width;
  const height = Math.max(1, Math.round(size.height * zoom));

  // A page that left the surroundings of what is in sight (or a dialog that closed) gives its picture
  // back: a long document would otherwise fill the memory. Its text stays, so a selection that runs
  // on past the page keeps its beginning and the browser's search still finds the page.
  useEffect(() => {
    if (!near) return;
    const canvases = canvasHost.current;
    return () => {
      dropCanvases(canvases);
      setDrawn(false);
      // What pdf.js itself keeps of the page goes too - unless the whole document is closing anyway.
      if (pdf.loadingTask.destroyed) return;
      pdf
        .getPage(number)
        .then((page) => page.cleanup())
        .catch(() => {});
    };
  }, [near, pdf, number]);

  // The text is laid over the page once: it follows the page's size by itself (--total-scale-factor).
  const wanted = near || text;
  useEffect(() => {
    const host = textHost.current;
    if (!wanted || laid || !host) return;
    let live = true;
    let layer: TextLayer | null = null;
    pdf
      .getPage(number)
      .then((page) => {
        if (!live) return;
        const box = document.createElement("div");
        box.className = "pdf-text";
        layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: box, viewport: page.getViewport({ scale: PDF_TO_CSS }) });
        return layer.render().then(() => {
          if (!live) return;
          const end = document.createElement("div");
          end.className = "pdf-text-end";
          box.append(end);
          host.replaceChildren(box);
        });
      })
      // A page without its text is still a page.
      .catch(() => {})
      .then(() => {
        if (live) setLaid(true);
      });
    return () => {
      live = false;
      layer?.cancel();
    };
  }, [wanted, laid, pdfjs, pdf, number]);

  // The text goes with the page: a closed dialog's last panel stays in the browser's memory until the
  // next dialog opens, and every page's text would stay there with it.
  useEffect(() => {
    const host = textHost.current;
    return () => {
      host?.replaceChildren();
      setLaid(false);
    };
  }, []);

  // A page that already has its text (it was near) says so as soon as it is asked.
  useEffect(() => {
    if (text && laid) onText(number);
  }, [text, laid, number, onText]);

  useEffect(() => {
    const canvases = canvasHost.current;
    if (!near || !canvases) return;
    let live = true;
    let canvas: HTMLCanvasElement | null = null;
    let renderTask: RenderTask | null = null;

    const draw = async () => {
      const page = await pdf.getPage(number);
      if (!live) return;
      const real = pageSize(page);
      if (!sameSize(real, size)) {
        // Drawn on the next pass, at its own size.
        onSize(number, real);
        return;
      }
      const viewport = page.getViewport({ scale: zoom * PDF_TO_CSS });
      // As sharp as the screen is, within what a canvas may hold; its pixels cover the page's box exactly.
      const sharpness = Math.min(density, Math.sqrt(MAX_PIXELS / (width * height)));
      const whole = sharpness < density ? Math.floor : Math.round;
      canvas = document.createElement("canvas");
      canvas.width = Math.max(1, whole(width * sharpness));
      canvas.height = Math.max(1, whole(height * sharpness));
      canvas.className = "block h-full w-full";
      canvas.setAttribute("role", "presentation");
      renderTask = page.render({ canvas, viewport, transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0] });
      await renderTask.promise;
      if (!live) return;
      // The new picture takes the old one's place only when it is whole, so resizing never shows a blank page.
      const done = canvas;
      canvas = null;
      for (const old of canvases.querySelectorAll("canvas")) {
        old.width = 0;
        old.height = 0;
      }
      canvases.replaceChildren(done);
      setDrawn(true);
      setFailed(false);
    };

    const timer = window.setTimeout(
      () => {
        draw().catch(() => {
          if (!live) return;
          setFailed(true);
          onBroken(number);
        });
      },
      canvases.childElementCount > 0 ? REDRAW_DELAY : 0,
    );

    return () => {
      live = false;
      window.clearTimeout(timer);
      renderTask?.cancel();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [near, pdf, number, size, zoom, width, height, density, onSize, onBroken]);

  return (
    <div
      data-page={number}
      className="pdf-page relative box-content shrink-0 overflow-hidden border border-slate-200 bg-white"
      style={{ width, height, "--total-scale-factor": zoom * PDF_TO_CSS * size.unit } as CSSProperties}
    >
      <div ref={canvasHost} className="absolute inset-0" />
      <div ref={textHost} />
      {failed ? (
        <span className={`absolute inset-0 flex items-center justify-center bg-white px-4 text-center ${HINT}`}>Page {number} could not be shown. Download the file to see it.</span>
      ) : (
        near && !drawn && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spin size="small" />
          </span>
        )
      )}
    </div>
  );
});
