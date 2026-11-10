"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Spin } from "antd";
import { DownloadOutlined, ExportOutlined, FileOutlined, ReloadOutlined } from "@ant-design/icons";
import { decodeText, extensionOf, formatSheetCell, parseDelimited, type PreviewType, type SheetCell } from "@/lib/filePreview";
import { formatFileSize } from "@/lib/files";
import { BTN, BTN_PRIMARY, BTN_SM, EMPTY_STATE, HINT } from "@/styles/ui";
import { PdfView } from "./PdfView";

// The app's one file preview (opened through hooks/useFilePreview): a PDF's pages, a picture, text,
// a CSV or Excel table, a Word page - each from the file's own bytes - and for anything else a card
// with Download. The dialog is the file and one bar under it (its name, and Open in new tab /
// Download / Close): nothing else is drawn around a file. Word pages are drawn into a sandboxed
// frame and an SVG is shown from a data: URL, so nothing in a file ever runs in the app's page.

/** What the dialog shows: a file on its way, one loaded, or one that could not be loaded. */
export type FilePreviewState =
  | { status: "loading"; fileName: string }
  | { status: "error"; fileName: string; message: string }
  | {
      status: "ready";
      fileName: string;
      /** The file's bytes as loaded: what Download saves and what text, tables and Word pages are read from. */
      blob: Blob;
      type: PreviewType;
      /** What a frame, a picture or "Open in new tab" shows (PDF, pictures, text); "" for the other kinds. */
      url: string;
    };

/** At most this much of a sheet or a CSV is drawn, so a huge file can't freeze the page. */
const MAX_ROWS = 1000;
const MAX_COLUMNS = 60;
/** Text beyond this is cut (with a note), for the same reason. */
const MAX_TEXT = 2 * 1024 * 1024;

interface FilePreviewDialogProps {
  state: FilePreviewState | null;
  onClose: () => void;
  onDownload: () => void;
  onRetry: () => void;
}

export function FilePreviewDialog({ state, onClose, onDownload, onRetry }: FilePreviewDialogProps) {
  // A file that turned out not to be showable - a picture this browser can't draw (HEIC or TIFF
  // outside Safari), a ".pdf" that is no PDF inside - falls back to the Download card.
  const [unshowable, setUnshowable] = useState<string | null>(null);
  const ready = state?.status === "ready" ? state : null;
  const url = ready?.url ?? "";
  const cantShow = !!url && unshowable === url;
  const giveUp = useCallback(() => setUnshowable(url), [url]);
  const kind = ready ? (cantShow ? "none" : ready.type.kind) : null;
  // Opened in a tab of its own only where the browser shows it safely there: a PDF, a raster picture,
  // text (re-encoded as UTF-8). Never an SVG (it could run a script), never Word or Excel.
  const canOpenInTab = !!ready?.url && (kind === "pdf" || kind === "text" || (kind === "image" && ready.type.mime !== "image/svg+xml"));

  // What had the focus can be taken away with it: "Try again" by its own press, a PDF's pages by the
  // Download card. The focus then stays in the dialog, where Esc is listened for.
  const area = useRef<HTMLDivElement>(null);
  const status = state?.status;
  useLayoutEffect(() => {
    if (status && document.activeElement === document.body) area.current?.focus({ preventScroll: true });
  }, [status, kind]);

  return (
    <Modal
      open={!!state}
      onCancel={onClose}
      // 80% of a wide screen; nearly all of a phone's.
      width="max(80vw, min(calc(100vw - 24px), 560px))"
      // As tall as the window, less 12px above and below: the bar with Download and Close is always in
      // sight, and the file gets all the height the bar leaves (one row of it, or two on a phone).
      style={{ top: 12, margin: "0 auto", paddingBottom: 0 }}
      destroyOnHidden
      // No bar above the file: its name is in the bar below (this title only names the dialog for
      // screen readers), and Close, Esc or a click beside the dialog closes it.
      title={state?.fileName}
      closable={false}
      classNames={{
        header: "!hidden",
        content: "!flex !h-[calc(100dvh-24px)] !flex-col !p-3",
        body: "!min-h-0 !flex-1 !overflow-hidden",
        footer: "!mt-2 !border-t !border-slate-200 !pt-2",
      }}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <div className="flex min-w-[120px] flex-1 items-baseline gap-2 text-left">
            <span className="truncate text-[13px] font-medium text-slate-700" title={state?.fileName}>
              {state?.fileName}
            </span>
            {ready && <span className={`${HINT} shrink-0`}>{formatFileSize(ready.blob.size)}</span>}
          </div>
          {/* On the narrowest phones the buttons take a second row among themselves. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canOpenInTab && (
              <button type="button" className={`${BTN} ${BTN_SM}`} onClick={() => window.open(ready.url, "_blank", "noopener")}>
                <ExportOutlined aria-hidden />
                Open in new tab
              </button>
            )}
            {state?.status !== "loading" && (
              <button type="button" className={`${BTN} ${BTN_SM}`} onClick={onDownload}>
                <DownloadOutlined aria-hidden />
                Download
              </button>
            )}
            <button type="button" className={`${BTN_PRIMARY} ${BTN_SM}`} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      }
    >
      <div ref={area} tabIndex={-1} className="h-full outline-none">
        {!state ? null : state.status === "loading" ? (
          <Centered>
            <Spin />
            <span className="text-[13px] text-slate-500">Loading {state.fileName}…</span>
          </Centered>
        ) : state.status === "error" ? (
          <Centered>
            <span role="alert" className="text-[13px] text-red-600 text-center max-w-[520px]">
              {state.message}
            </span>
            <button type="button" className={BTN} onClick={onRetry}>
              <ReloadOutlined aria-hidden />
              Try again
            </button>
          </Centered>
        ) : (
          // A file that breaks a viewer (a sheet it can't read, say) gives the Download card, never a broken page.
          <PreviewBoundary key={state.url || state.fileName} fallback={<NoPreview fileName={state.fileName} onDownload={onDownload} reason="This file could not be shown" />}>
            {kind === "pdf" ? (
              // Drawn by the app: only the pages. The browser's own viewer (with its toolbar) is what is
              // left for a file the app can't draw, such as one that asks for a password.
              <PdfView
                blob={state.blob}
                title={state.fileName}
                fallback={<iframe src={state.url} title={state.fileName} className="w-full h-full border-0 rounded" />}
                onBroken={giveUp}
              />
            ) : kind === "image" ? (
              <div className="h-full overflow-auto rounded flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={state.url} alt={state.fileName} onError={giveUp} className="max-w-full max-h-full object-contain" />
              </div>
            ) : kind === "text" ? (
              <TextView blob={state.blob} />
            ) : kind === "csv" ? (
              <CsvView blob={state.blob} />
            ) : kind === "xlsx" ? (
              <XlsxView blob={state.blob} />
            ) : kind === "docx" ? (
              <DocxView blob={state.blob} title={state.fileName} />
            ) : (
              <NoPreview
                fileName={state.fileName}
                onDownload={onDownload}
                reason={!cantShow ? undefined : state.type.kind === "image" ? "This browser can't show this picture" : "This file could not be shown"}
              />
            )}
          </PreviewBoundary>
        )}
      </div>
    </Modal>
  );
}

class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="h-full flex flex-col items-center justify-center gap-3">{children}</div>;
}

/** For a file the app can't show (or one that could not be drawn): what it is, and Download. */
function NoPreview({ fileName, onDownload, reason }: { fileName: string; onDownload: () => void; reason?: string }) {
  const ext = extensionOf(fileName).toUpperCase();
  return (
    <Centered>
      <FileOutlined aria-hidden className="text-[40px] !text-slate-300" />
      <span className="text-[14px] font-medium text-slate-700 text-center">{reason ?? `No preview for ${ext ? `${ext} files` : "this file type"}`}</span>
      <span className={HINT}>Download the file to open it.</span>
      <button type="button" className={BTN_PRIMARY} onClick={onDownload}>
        <DownloadOutlined aria-hidden />
        Download
      </button>
    </Centered>
  );
}

/** A file's bytes, read once per file. */
function useBytes(blob: Blob) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let live = true;
    void blob.arrayBuffer().then((buffer) => live && setBytes(new Uint8Array(buffer)));
    return () => {
      live = false;
    };
  }, [blob]);
  return bytes;
}

function TextView({ blob }: { blob: Blob }) {
  const bytes = useBytes(blob);
  if (!bytes) return <Loading />;
  const cut = bytes.length > MAX_TEXT;
  return (
    <div className="h-full overflow-auto rounded border border-slate-200 bg-white">
      {cut && <p className={`${HINT} m-0 px-4 pt-3`}>Only the first {formatFileSize(MAX_TEXT)} are shown. Download the file for all of it.</p>}
      <pre className="m-0 p-4 text-[13px] leading-5 text-slate-800 whitespace-pre-wrap break-words font-mono">{decodeText(bytes.subarray(0, MAX_TEXT), cut)}</pre>
    </div>
  );
}

function CsvView({ blob }: { blob: Blob }) {
  const bytes = useBytes(blob);
  const rows = useMemo(() => (bytes ? parseDelimited(decodeText(bytes), undefined, MAX_ROWS + 1) : null), [bytes]);
  if (!rows) return <Loading />;
  // A column of the dialog's height, so the grid scrolls inside it.
  return (
    <div className="h-full flex flex-col min-h-0">
      <SheetTable rows={rows} />
    </div>
  );
}

type Sheet = { name: string; rows: SheetCell[][]; chart: boolean };

function XlsxView({ blob }: { blob: Blob }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      // Loaded only when an Excel file is opened.
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const all = await readXlsxFile(blob);
      // A chart sheet has no cells (no data at all).
      if (live) setSheets(all.map((s) => ({ name: s.sheet, rows: (s.data ?? []) as unknown as SheetCell[][], chart: !s.data })));
    })().catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [blob]);
  if (failed) return <Centered><span className="text-[13px] text-slate-600">This Excel file could not be read. Download it to open it in Excel.</span></Centered>;
  if (!sheets) return <Loading />;
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="flex flex-wrap gap-2 shrink-0">
          {sheets.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`h-8 px-3 rounded-lg border text-[13px] font-medium cursor-pointer transition-colors ${
                i === active ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet && sheet.rows.length > 0 ? (
        <SheetTable rows={sheet.rows} />
      ) : (
        <Centered>
          <span className={EMPTY_STATE}>{sheet?.chart ? "This sheet holds a chart, which can't be shown here. Download the file to see it." : "This sheet is empty."}</span>
        </Centered>
      )}
    </div>
  );
}

const columnName = (index: number) => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/** A grid like a spreadsheet's: column letters on top, row numbers on the left. */
function SheetTable({ rows }: { rows: SheetCell[][] }) {
  const shown = rows.slice(0, MAX_ROWS);
  const width = Math.min(MAX_COLUMNS, Math.max(1, ...shown.map((r) => r.length)));
  const cut = rows.length > MAX_ROWS || rows.some((r) => r.length > MAX_COLUMNS);
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5">
      {cut && <p className={`${HINT} m-0`}>Only the first {MAX_ROWS} rows and {MAX_COLUMNS} columns are shown. Download the file for all of it.</p>}
      <div className="flex-1 min-h-0 overflow-auto rounded border border-slate-200 bg-white">
        <table className="border-separate border-spacing-0 text-[12px] text-slate-800">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-slate-100 border-b border-r border-slate-200 w-10" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} scope="col" className="sticky top-0 z-10 bg-slate-100 border-b border-r border-slate-200 px-2 py-1 font-semibold text-slate-500 min-w-[72px]">
                  {columnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r}>
                <th scope="row" className="sticky left-0 z-10 bg-slate-100 border-b border-r border-slate-200 px-2 py-1 font-semibold text-slate-500 text-right">
                  {r + 1}
                </th>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="border-b border-r border-slate-100 px-2 py-1 whitespace-pre-wrap align-top max-w-[360px]">
                    {formatSheetCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocxView({ blob, title }: { blob: Blob; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      // Loaded only when a Word file is opened. Drawn into elements outside the page and shown as a
      // page of its own in a sandboxed frame: no script of a file runs, its links lead nowhere and
      // its styles stay out of the app.
      const { renderAsync } = await import("docx-preview");
      const body = document.createElement("div");
      const styles = document.createElement("div");
      await renderAsync(blob, body, styles, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        useBase64URL: true,
        renderComments: false,
        renderChanges: false,
        experimental: false,
      });
      if (live) {
        setHtml(
          `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">${styles.innerHTML}` +
            // The pages on white with a hairline round each, like a PDF's: no grey backdrop, no shadow.
            // In the middle of a frame wider than a page; from the left edge of a narrower one, so
            // scrolling sideways reaches all of the page.
            `<style>html,body{margin:0;background:#fff}.docx-wrapper{background:#fff !important;padding:0 !important;align-items:flex-start !important}` +
            `.docx-wrapper>section.docx{box-shadow:none !important;border:1px solid #e2e8f0;margin:0 auto 12px !important}</style>` +
            `</head><body>${body.innerHTML}</body></html>`,
        );
      }
    })().catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [blob]);
  if (failed) return <Centered><span className="text-[13px] text-slate-600">This Word file could not be read. Download it to open it in Word.</span></Centered>;
  if (!html) return <Loading />;
  return <iframe sandbox="" srcDoc={html} title={title} className="w-full h-full border-0 rounded bg-white" />;
}

function Loading() {
  return (
    <Centered>
      <Spin />
    </Centered>
  );
}
