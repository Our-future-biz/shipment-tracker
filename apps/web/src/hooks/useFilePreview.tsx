"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Modal } from "antd";
import { apiFileUrl } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface PreviewFile {
  fileName: string;
  contentUrl: string;
}

// What the browser shows in the page. The server answers with the file's real type only for the
// types it lets be shown; anything else comes as a binary and is downloaded.
const SHOWN_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"];

/**
 * A stored file looked at in a dialog of the app, from a blob of its bytes. A link opened in a tab
 * of its own doesn't do: the API serves files sandboxed (lib/fileContent.ts), so nothing they hold
 * can run on its origin, and a PDF served so isn't shown by the browser but saved - ad blockers
 * also tend to stop that URL.
 */
export function useFilePreview() {
  const toast = useToast();
  const [preview, setPreview] = useState<{ name: string; url: string; type: string } | null>(null);
  // Asking for another file while one is loading replaces it.
  const request = useRef(0);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const open = async ({ fileName, contentUrl }: PreviewFile) => {
    const mine = ++request.current;
    try {
      const response = await fetch(apiFileUrl(contentUrl));
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      if (mine !== request.current) return;
      if (SHOWN_TYPES.includes(blob.type)) {
        setPreview({ name: fileName, url: URL.createObjectURL(blob), type: blob.type });
        return;
      }
      const link = document.createElement("a");
      link.href = apiFileUrl(contentUrl, true);
      link.download = fileName;
      link.click();
    } catch {
      if (mine === request.current) toast.error("Could not open the document — try downloading it instead");
    }
  };

  /** For a link to the file: a click previews it in the app, and the link stays one for a screen reader. */
  const previewOnClick = (file: PreviewFile) => (event: MouseEvent) => {
    event.preventDefault();
    void open(file);
  };

  const close = () => setPreview(null);
  const modal = (
    <Modal open={!!preview} title={preview?.name} onCancel={close} footer={null} width="80vw" classNames={{ body: "!p-0 !h-[78vh]" }} destroyOnHidden>
      {preview &&
        (preview.type.startsWith("image/") ? (
          <div className="h-full overflow-auto bg-slate-100 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain" />
          </div>
        ) : (
          <iframe src={preview.url} title={preview.name} className="w-full h-full border-0" />
        ))}
    </Modal>
  );

  return { open, previewOnClick, modal };
}
