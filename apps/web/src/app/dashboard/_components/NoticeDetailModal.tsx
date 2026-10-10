"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { downloadDataUrl } from "@/lib/files";
import { useToast } from "@/lib/toast";
import type { Announcement } from "@/hooks/useNoticeboard";
import { BOARDS } from "../_lib/boards";
import { NoticeAttachmentList } from "./NoticeAttachmentList";
import { NoticeSeverityTag } from "./NoticeSeverityTag";

interface NoticeDetailModalProps {
  post: Announcement | null;
  onClose: () => void;
}

// What the browser renders itself. The preview is typed from this list, never from the
// stored content, so a file that claims to be a PDF cannot open as a web page. SVG is
// left out on purpose: the preview is a blob of this site, and an SVG opened from it in
// a tab of its own could run script here — SVG files are download-only.
const PREVIEW_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"];

export function NoticeDetailModal({ post, onClose }: NoticeDetailModalProps) {
  const toast = useToast();
  // Kept while the dialog animates out, so it does not go blank first.
  const [shown, setShown] = useState(post);
  if (post && post !== shown) setShown(post);

  const [preview, setPreview] = useState<{ name: string; url: string; type: string } | null>(null);
  // Documents being fetched: any number of downloads side by side, one preview at a time.
  const [downloading, setDownloading] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  // Bumped whenever a loading preview stops being wanted: another one was asked for, or
  // the notice was closed or changed.
  const previewRequest = useRef(0);

  // A preview belongs to the notice it was opened from.
  const postId = post?.id;
  useEffect(() => {
    const requests = previewRequest;
    requests.current++;
    setPreview(null);
    setPreviewing(null);
    // Leaving the page drops a preview that is still loading as well.
    return () => {
      requests.current++;
    };
  }, [postId]);

  // The preview is a blob of the file; free it once it is no longer shown.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  // Stored content is untrusted: only a data URL may be fetched or handed to the browser.
  const loadContent = async (attachmentId: string) => {
    const file = await api.auth.announcementAttachmentContent(attachmentId);
    if (!file.fileData.startsWith("data:")) throw new Error("Not a data URL");
    return file;
  };

  const handleDownload = async (attachmentId: string) => {
    if (downloading.includes(attachmentId)) return;
    setDownloading((ids) => [...ids, attachmentId]);
    try {
      const file = await loadContent(attachmentId);
      downloadDataUrl(file.fileData, file.fileName);
    } catch {
      toast.error("Failed to download the document");
    } finally {
      setDownloading((ids) => ids.filter((id) => id !== attachmentId));
    }
  };

  const handlePreview = async (attachmentId: string) => {
    const type = shown?.attachments.find((a) => a.id === attachmentId)?.fileType ?? "";
    if (previewing === attachmentId || !PREVIEW_TYPES.includes(type)) return;
    // Asking for another document while one is loading replaces it.
    const request = ++previewRequest.current;
    setPreviewing(attachmentId);
    try {
      const file = await loadContent(attachmentId);
      const bytes = await (await fetch(file.fileData)).arrayBuffer();
      // No longer wanted: the notice was closed or another document was chosen meanwhile.
      if (request !== previewRequest.current) return;
      setPreview({ name: file.fileName, url: URL.createObjectURL(new Blob([bytes], { type })), type });
    } catch {
      if (request === previewRequest.current) toast.error("Could not open the document — try downloading it instead");
    } finally {
      if (request === previewRequest.current) setPreviewing(null);
    }
  };

  const closePreview = () => setPreview(null);

  const board = BOARDS.find((b) => b.scope === shown?.scope)?.title ?? "";
  const addressee = [board, shown?.target].filter(Boolean).join(" · ");

  return (
    <Modal
      open={!!post}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnHidden
      // The heading names the dialog for screen readers.
      title={
        shown && (
          <div className="pr-8 pb-4 border-b border-slate-200 font-normal">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <NoticeSeverityTag severity={shown.severity} />
              <span className="min-w-0 truncate">{addressee}</span>
            </div>
            <h2 className="mt-2 mb-1 text-[22px] leading-tight font-bold text-slate-800 [overflow-wrap:anywhere]">{shown.title}</h2>
            <div className="text-xs text-slate-500 [overflow-wrap:anywhere]">
              Posted by {shown.authorName} · {formatDateTime(shown.createdAt)}
            </div>
          </div>
        )
      }
    >
      {shown && (
        <article>
          <p className="mt-3 mb-0 text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {shown.body || <span className="text-slate-400">No further details.</span>}
          </p>
          {shown.attachments.length > 0 && (
            <section className="mt-5 pt-4 border-t border-slate-200">
              <h3 className="mt-0 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Documents ({shown.attachments.length})
              </h3>
              <NoticeAttachmentList
                files={shown.attachments.map((a) => ({
                  key: a.id,
                  fileName: a.fileName,
                  fileSize: a.fileSize,
                  previewable: PREVIEW_TYPES.includes(a.fileType),
                }))}
                onOpen={handleDownload}
                onPreview={handlePreview}
                downloadingKeys={downloading}
                previewingKey={previewing}
              />
            </section>
          )}
        </article>
      )}
      <Modal open={!!preview} title={preview?.name} onCancel={closePreview} footer={null} width="80vw" styles={{ body: { padding: 0, height: "78vh" } }} destroyOnHidden>
        {preview &&
          (preview.type.startsWith("image/") ? (
            <div className="h-full overflow-auto bg-slate-100 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.name}
                className="max-w-full max-h-full object-contain"
                onError={() => {
                  closePreview();
                  toast.error("Could not open the document — try downloading it instead");
                }}
              />
            </div>
          ) : (
            <iframe src={preview.url} title={preview.name} className="w-full h-full border-0" />
          ))}
      </Modal>
    </Modal>
  );
}
