"use client";

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

export function NoticeDetailModal({ post, onClose }: NoticeDetailModalProps) {
  const toast = useToast();

  const handleDownload = async (attachmentId: string) => {
    try {
      const file = await api.auth.announcementAttachmentContent(attachmentId);
      downloadDataUrl(file.fileData, file.fileName);
    } catch {
      toast.error("Failed to download the document");
    }
  };

  const board = BOARDS.find((b) => b.scope === post?.scope)?.title ?? "";
  const addressee = post?.target ? `${board} · ${post.target}` : board;

  return (
    <Modal open={!!post} onCancel={onClose} footer={null} width={720} destroyOnHidden>
      {post && (
        <article>
          <header className="pr-8 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <NoticeSeverityTag severity={post.severity} />
              <span>{addressee}</span>
            </div>
            <h2 className="mt-2 mb-1 text-[22px] leading-tight font-bold text-slate-800 [overflow-wrap:anywhere]">{post.title}</h2>
            <div className="text-xs text-slate-500">
              Posted by {post.authorName} · {formatDateTime(post.createdAt)}
            </div>
          </header>
          <p className="mt-4 mb-0 text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {post.body || <span className="text-slate-400">No further details.</span>}
          </p>
          {post.attachments.length > 0 && (
            <section className="mt-5 pt-4 border-t border-slate-200">
              <h3 className="mt-0 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Documents ({post.attachments.length})
              </h3>
              <NoticeAttachmentList
                files={post.attachments.map((a) => ({ key: a.id, fileName: a.fileName, fileSize: a.fileSize }))}
                onOpen={handleDownload}
              />
            </section>
          )}
        </article>
      )}
    </Modal>
  );
}
