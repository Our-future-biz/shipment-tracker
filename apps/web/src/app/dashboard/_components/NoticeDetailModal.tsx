"use client";

import { useState } from "react";
import { Button, Modal, Progress } from "antd";
import { useQuery } from "@tanstack/react-query";
import { CheckOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { dataUrlToBlob } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { useFilePreview, type PreviewSource } from "@/hooks/useFilePreview";
import type { Announcement, AnnouncementAttachment } from "@/hooks/useNoticeboard";
import { NoticeAttachmentList } from "./NoticeAttachmentList";
import { NoticeSeverityTag } from "./NoticeSeverityTag";
import { Pill } from "@/components/Pill";
import { HINT, LABEL_TEXT, MODAL_TITLE } from "@/styles/ui";

interface NoticeDetailModalProps {
  post: Announcement | null;
  // Closes a notice that is not waiting to be confirmed (the Close button, Escape, a click outside).
  onClose: () => void;
  // The reader confirms having read the notice (the Read button): it is marked read and the
  // dialog closes. An unread notice can be left no other way - no close icon, Escape or outside click.
  onConfirmRead: (post: Announcement) => Promise<unknown>;
}

export function NoticeDetailModal({ post, onClose, onConfirmRead }: NoticeDetailModalProps) {
  const toast = useToast();
  // Kept while the dialog animates out, so it does not go blank first.
  const [shown, setShown] = useState(post);
  if (post && post !== shown) setShown(post);
  // The notice whose Read was just pressed: the button stays busy until the server has recorded it.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // The notice's documents open in the app's one file preview.
  const filePreview = useFilePreview();
  // Documents being downloaded: any number side by side.
  const [downloading, setDownloading] = useState<string[]>([]);

  // Whoever manages the notice sees how far it has got. Keyed under the noticeboard so it
  // refreshes with the list (every poll, and whenever someone's read is recorded here).
  // Keyed on the notice still drawn during the close animation, so the section does not blink
  // out; only fetched while the dialog is open.
  const receiptsFor = shown?.canEdit ? shown.id : null;
  const { data: receipts } = useQuery({
    queryKey: ["noticeboard", "read-receipts", receiptsFor],
    queryFn: () => api.auth.announcementReadReceipts(receiptsFor!),
    enabled: !!post && !!receiptsFor,
    refetchInterval: 15000,
  });

  // A document of the notice, for the preview and for Download. Stored content is untrusted: only a
  // base64 data URL is turned into bytes, and the preview goes by those bytes, not the stored type.
  const attachmentSource = (a: AnnouncementAttachment): PreviewSource => ({
    fileName: a.fileName,
    fileType: a.fileType,
    load: async () => {
      const file = await api.auth.announcementAttachmentContent(a.id);
      return dataUrlToBlob(file.fileData, file.fileType);
    },
  });
  const attachmentOf = (attachmentId: string) => shown?.attachments.find((a) => a.id === attachmentId);

  const handlePreview = (attachmentId: string) => {
    const attachment = attachmentOf(attachmentId);
    if (attachment) void filePreview.open(attachmentSource(attachment));
  };

  // A download that fails says so itself (a toast).
  const handleDownload = async (attachmentId: string) => {
    const attachment = attachmentOf(attachmentId);
    if (!attachment || downloading.includes(attachmentId)) return;
    setDownloading((ids) => [...ids, attachmentId]);
    try {
      await filePreview.download(attachmentSource(attachment));
    } finally {
      setDownloading((ids) => ids.filter((id) => id !== attachmentId));
    }
  };

  // Who the notice is for, e.g. "Czechia · Prague Office · Accounting", or "All".
  const addressee = shown?.target ?? "";
  const initials = (shown?.authorName ?? "")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <Modal
        open={!!post}
        onCancel={onClose}
        // An unread notice is left only by confirming it; any other closes with Close, Escape or a click outside.
        // No close icon either way: the heading has no room for it.
        closable={false}
        keyboard={!shown?.unread}
        maskClosable={!shown?.unread}
        // The reader confirms the notice here (which closes it); once read, a quiet note and a Close button.
        // A notice that needs no confirming (the reader's own, or not addressed to them) has just Close.
        footer={
          shown && (
            <div className="flex justify-end pt-1">
              {shown.unread ? (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={confirmingId === shown.id}
                  onClick={async () => {
                    setConfirmingId(shown.id);
                    try {
                      await onConfirmRead(shown);
                      onClose();
                    } catch {
                      toast.error("Could not mark the notice as read");
                    } finally {
                      setConfirmingId(null);
                    }
                  }}
                >
                  Read
                </Button>
              ) : shown.readAt ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                    <CheckOutlined /> Read
                  </span>
                  <Button onClick={onClose}>Close</Button>
                </div>
              ) : (
                <Button onClick={onClose}>Close</Button>
              )}
            </div>
          )
        }
        width={720}
        destroyOnHidden
        // The heading names the dialog for screen readers.
        title={
          shown && (
            <div className="pb-4 border-b border-slate-200 font-normal">
              <div className="flex items-center gap-2.5">
                <NoticeSeverityTag severity={shown.severity} />
                <span className={`min-w-0 flex-1 truncate border-l border-slate-200 pl-2.5 ${LABEL_TEXT}`}>
                  {addressee}
                </span>
              </div>
              <h2 className={`${MODAL_TITLE} mt-3 mb-2 [overflow-wrap:anywhere]`}>{shown.title}</h2>
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
            <p className="mt-3 mb-0 text-[14px] leading-relaxed text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {shown.body || <span className="text-slate-400">No further details.</span>}
            </p>
            {shown.attachments.length > 0 && (
              <section className="mt-5 pt-4 border-t border-slate-200">
                <h3 className={`${LABEL_TEXT} mt-0 mb-2`}>
                  Attachments ({shown.attachments.length})
                </h3>
                <NoticeAttachmentList
                  files={shown.attachments.map((a) => ({
                    key: a.id,
                    fileName: a.fileName,
                    fileType: a.fileType,
                    fileSize: a.fileSize,
                  }))}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  downloadingKeys={downloading}
                />
              </section>
            )}
            {shown.canEdit && receipts && receipts.read.length + receipts.unread.length > 0 && (
              <section className="mt-5 pt-4 border-t border-slate-200">
                <h3 className={`${LABEL_TEXT} mt-0 mb-2`}>
                  Read by {receipts.read.length} of {receipts.read.length + receipts.unread.length}
                </h3>
                <Progress
                  aria-label="Read by"
                  percent={Math.round((receipts.read.length / (receipts.read.length + receipts.unread.length)) * 100)}
                  showInfo={false}
                  size={{ height: 6 }}
                  // Tailwind's emerald-500 / indigo-600 (the app's accent).
                  strokeColor={receipts.unread.length === 0 ? "#10b981" : "#4f46e5"}
                  className="m-0"
                />
                {receipts.unread.length === 0 ? (
                  <p className="mt-2 mb-0 text-[13px] text-emerald-700">Everyone it is addressed to has read it.</p>
                ) : (
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className={`shrink-0 w-16 ${HINT}`}>Not yet</span>
                    <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                      {receipts.unread.map((u, i) => (
                        <li key={i} className="min-w-0">
                          <Pill tone="amber" className="!whitespace-normal [overflow-wrap:anywhere]">
                            {u.name}
                          </Pill>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {receipts.read.length > 0 && (
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={`shrink-0 w-16 ${HINT}`}>Read</span>
                    <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                      {receipts.read.map((u, i) => (
                        <li key={i} className="min-w-0">
                          <Pill tone="slate" title={`Read ${formatDateTime(u.readAt)}`} className="!whitespace-normal [overflow-wrap:anywhere]">
                            {u.name}
                          </Pill>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </article>
        )}
      </Modal>
      {/* Beside the notice, not in it: a notice deleted while one of its files is open doesn't take the preview along. */}
      {filePreview.modal}
    </>
  );
}
