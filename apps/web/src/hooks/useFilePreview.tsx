"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { apiFileUrl, isNotFound } from "@/lib/api";
import { decodeText, previewTypeOf, type PreviewType } from "@/lib/filePreview";
import { useMessages, useToast } from "@/lib/toast";
import { FilePreviewDialog, type FilePreviewState } from "@/components/FilePreviewDialog";

/**
 * A file to look at. Either a signed link the API hands out (`contentUrl`, opened without the login
 * header), with `refreshUrl` giving a fresh one when it has expired (links last an hour), or a
 * `load` that brings the bytes any other way: an endpoint behind the login header, base64 or a data
 * URL from JSON, a PDF made in the browser, a file the user just picked.
 */
export type PreviewSource =
  | {
      fileName: string;
      contentUrl: string;
      /** The type the file was stored with, a hint next to its bytes. */
      fileType?: string;
      refreshUrl?: () => Promise<string | null | undefined>;
    }
  | { fileName: string; load: () => Promise<Blob>; fileType?: string };

/** A link that no longer leads to the file: expired (after an hour) or the file is gone. */
class GoneError extends Error {}

/** Thrown by a `load` that knows why there is nothing to show; its message is what the user reads. */
export class PreviewUnavailableError extends Error {}

async function fetchLink(contentUrl: string): Promise<Response> {
  const response = await fetch(apiFileUrl(contentUrl));
  if (response.status === 404) throw new GoneError();
  if (!response.ok) throw new Error(String(response.status));
  return response;
}

/** The file's bytes, from wherever it comes. An expired link is renewed once when the caller can. */
export async function loadPreviewSource(source: PreviewSource): Promise<Blob> {
  if ("load" in source) return source.load();
  try {
    return await (await fetchLink(source.contentUrl)).blob();
  } catch (err) {
    const fresh = err instanceof GoneError && source.refreshUrl ? await source.refreshUrl() : null;
    if (!fresh) throw err;
    return (await fetchLink(fresh)).blob();
  }
}

/** Hands bytes to the browser as a download under the given name; the page stays where it is. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Freed once the browser has taken the download over.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * What the dialog's frame, picture or "Open in new tab" shows. Only kinds a browser shows safely get
 * one: a PDF or a raster picture as a blob of its own type; an SVG as a data: URL, never a blob of
 * the app's origin (opened on its own, a same-origin SVG could run a script in the app); text as
 * UTF-8, so a tab of its own reads it right. Word, Excel, CSV and the rest get none.
 */
async function viewUrlOf(blob: Blob, type: PreviewType): Promise<string> {
  if (type.kind === "pdf") return URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  if (type.kind === "image" && type.mime === "image/svg+xml") return asDataUrl(new Blob([blob], { type: "image/svg+xml" }));
  if (type.kind === "image") return URL.createObjectURL(new Blob([blob], { type: type.mime }));
  if (type.kind === "text") {
    const text = decodeText(new Uint8Array(await blob.arrayBuffer()));
    return URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  }
  return "";
}

const failureMessage = (err: unknown) =>
  err instanceof PreviewUnavailableError
    ? err.message
    : err instanceof GoneError
      ? "The file could not be found. Its link may have expired: close this and open the file again from the list."
      : isNotFound(err)
        ? "The file could not be found. It may have been deleted."
        : "The file could not be loaded. Check the connection and try again.";

/**
 * The app's one preview of a stored file: a dialog of the app (FilePreviewDialog) that shows it
 * from a blob of its bytes - PDF, pictures, text, CSV, Excel and Word - and offers Download for
 * anything else. A link opened in a tab of its own doesn't do: the API serves files sandboxed
 * (lib/fileContent.ts), so a PDF served so isn't shown but saved, and ad blockers often stop it.
 *
 * `open(file)` shows a file; `previewOnClick(file)` is the click handler for a link to it;
 * `download(file)` saves it without leaving the page; `close()` shuts the preview (for a place whose
 * content goes away under it); `modal` has to be rendered once.
 */
export function useFilePreview() {
  const toast = useToast();
  const message = useMessages();
  const [state, setState] = useState<FilePreviewState | null>(null);
  const shown = useRef<PreviewSource | null>(null);
  // Asking for another file while one is loading replaces it.
  const request = useRef(0);
  // Downloads on their way, so a second click on the same file doesn't save it twice.
  const downloading = useRef(new Set<string>());

  useEffect(() => {
    if (state?.status !== "ready" || !state.url.startsWith("blob:")) return;
    const url = state.url;
    return () => URL.revokeObjectURL(url);
  }, [state]);

  // Leaving the page drops a file still loading: no preview of it is made, so no blob is left over.
  useEffect(() => {
    const requests = request;
    return () => {
      requests.current++;
    };
  }, []);

  const open = async (source: PreviewSource) => {
    const mine = ++request.current;
    shown.current = source;
    // The dialog opens at once, so a big file is never a click that seems to do nothing.
    setState({ status: "loading", fileName: source.fileName });
    try {
      const blob = await loadPreviewSource(source);
      const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
      if (mine !== request.current) return;
      const type = previewTypeOf(head, source.fileName, source.fileType || blob.type);
      // The URL shown carries the type the bytes are, so a PDF frame or a picture gets it right even
      // when the server sent "octet-stream"; the bytes themselves stay as loaded, for Download.
      const url = await viewUrlOf(blob, type);
      if (mine !== request.current) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        return;
      }
      setState({ status: "ready", fileName: source.fileName, blob, type, url });
    } catch (err) {
      if (mine === request.current) setState({ status: "error", fileName: source.fileName, message: failureMessage(err) });
    }
  };

  /** Saves the file without leaving the page; a link that no longer works says so instead. */
  const download = async (source: PreviewSource) => {
    const key = "contentUrl" in source ? source.contentUrl : `load:${source.fileName}`;
    if (downloading.current.has(key)) return;
    downloading.current.add(key);
    // A big file takes a while to come: the user sees that it is on its way.
    const notice = `download:${key}`;
    void message.open({ key: notice, type: "loading", content: `Downloading ${source.fileName}…`, duration: 0 });
    try {
      saveBlob(await loadPreviewSource(source), source.fileName);
    } catch (err) {
      toast.error(
        err instanceof PreviewUnavailableError
          ? err.message
          : err instanceof GoneError
            ? `${source.fileName} could not be found: its link may have expired. Open it again from the list.`
            : isNotFound(err)
              ? `${source.fileName} could not be found. It may have been deleted.`
              : `Could not download ${source.fileName}`,
      );
    } finally {
      downloading.current.delete(key);
      message.destroy(notice);
    }
  };

  /**
   * For a link to the file: a click shows it in the app (also with Ctrl or Cmd - the dialog has
   * "Open in new tab"), and the link stays one for a screen reader.
   */
  const previewOnClick = (source: PreviewSource) => (event: MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    void open(source);
  };

  const close = () => {
    request.current++;
    shown.current = null;
    setState(null);
  };

  const modal = (
    <FilePreviewDialog
      state={state}
      onClose={close}
      onRetry={() => shown.current && void open(shown.current)}
      // The bytes already here are saved; only a file that did not load is asked for again.
      onDownload={() => {
        if (state?.status === "ready") saveBlob(state.blob, state.fileName);
        else if (shown.current) void download(shown.current);
      }}
    />
  );

  return { open, previewOnClick, download, close, modal };
}
