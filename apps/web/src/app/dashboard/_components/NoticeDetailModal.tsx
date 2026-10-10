"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Modal } from "antd";
import { useQuery } from "@tanstack/react-query";
import { DeleteOutlined, EditOutlined, EllipsisOutlined } from "@ant-design/icons";
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
  // Offered from the menu in the heading to those who may change the notice.
  onEdit: (post: Announcement) => void;
  onDelete: (post: Announcement) => void;
}

// What the browser renders itself. The preview is typed from this list, never from the
// stored content, so a file that claims to be a PDF cannot open as a web page. SVG is
// left out on purpose: the preview is a blob of this site, and an SVG opened from it in
// a tab of its own could run script here — SVG files are download-only.
const PREVIEW_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"];

export function NoticeDetailModal({ post, onClose, onEdit, onDelete }: NoticeDetailModalProps) {
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

  // Whoever manages the notice sees how far it has got. Keyed under the noticeboard so it
  // refreshes with the list (every poll, and whenever someone's read is recorded here).
  const receiptsFor = post?.canEdit ? post.id : null;
  const { data: receipts } = useQuery({
    queryKey: ["noticeboard", "read-receipts", receiptsFor],
    queryFn: () => api.auth.announcementReadReceipts(receiptsFor!),
    enabled: !!receiptsFor,
    refetchInterval: 15000,
  });

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

  // The department's own name says more than "Department"; the company board has none.
  const addressee = shown?.target || (BOARDS.find((b) => b.scope === shown?.scope)?.title ?? "");
  const initials = (shown?.authorName ?? "")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
          <div className="pb-4 border-b border-slate-200 font-normal">
            <div className="flex items-center gap-2.5 pr-8">
              <NoticeSeverityTag severity={shown.severity} />
              <span className="min-w-0 flex-1 truncate border-l border-slate-200 pl-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {addressee}
              </span>
              {shown.canEdit && (
                <Dropdown
                  trigger={["click"]}
                  placement="bottomRight"
                  menu={{
                    items: [
                      { key: "edit", label: "Edit notice", icon: <EditOutlined />, onClick: () => onEdit(shown) },
                      { key: "delete", label: "Delete notice", icon: <DeleteOutlined />, danger: true, onClick: () => onDelete(shown) },
                    ],
                  }}
                >
                  <Button type="text" size="small" icon={<EllipsisOutlined className="!text-[20px]" />} aria-label="Notice actions" className="!text-slate-600 hover:!text-slate-900" />
                </Dropdown>
              )}
            </div>
            <h2 className="mt-3 mb-2 text-[22px] leading-tight font-bold text-slate-800 [overflow-wrap:anywhere]">{shown.title}</h2>
            <div className="flex items-center gap-2 text-[13px] text-slate-500">
              <span aria-hidden className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700">
                {initials}
              </span>
              <span className="min-w-0 truncate">{shown.authorName}</span>
              <span className="shrink-0">· {formatDateTime(shown.createdAt)}</span>
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
                Attachments ({shown.attachments.length})
              </h3>
              <NoticeAttachmentList
                files={shown.attachments.map((a) => ({
                  key: a.id,
                  fileName: a.fileName,
                  fileType: a.fileType,
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
          {shown.canEdit && receipts && receipts.read.length + receipts.unread.length > 0 && (
            <section className="mt-5 pt-4 border-t border-slate-200">
              <h3 className="mt-0 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Read by {receipts.read.length} of {receipts.read.length + receipts.unread.length}
              </h3>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${receipts.unread.length === 0 ? "bg-emerald-500" : "bg-indigo-500"}`}
                  style={{ width: `${(receipts.read.length / (receipts.read.length + receipts.unread.length)) * 100}%` }}
                />
              </div>
              {receipts.unread.length === 0 ? (
                <p className="mt-2 mb-0 text-[13px] text-emerald-700">Everyone it is addressed to has read it.</p>
              ) : (
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="shrink-0 w-16 text-xs text-slate-500">Not yet</span>
                  <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                    {receipts.unread.map((u, i) => (
                      <li key={i} className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 [overflow-wrap:anywhere]">
                        {u.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {receipts.read.length > 0 && (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="shrink-0 w-16 text-xs text-slate-500">Read</span>
                  <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                    {receipts.read.map((u, i) => (
                      <li key={i} title={`Read ${formatDateTime(u.readAt)}`} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 [overflow-wrap:anywhere]">
                        {u.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
