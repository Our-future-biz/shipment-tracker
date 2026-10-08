"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useNoticeboard } from "@/hooks/useNoticeboard";
import type { Announcement } from "@/hooks/useNoticeboard";
import { BOARDS } from "../_lib/boards";
import { NoticeBoardCard } from "./NoticeBoardCard";
import { NoticeDetailModal } from "./NoticeDetailModal";
import { NoticePostModal } from "./NoticePostModal";
import type { NoticePostTarget } from "./NoticePostModal";

const POSTING_ROLES = ["superadmin", "admin", "manager"];

export function DashboardView() {
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    announcements,
    viewer,
    isLoading,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    addAttachment,
    removeAttachment,
    markRead,
  } = useNoticeboard();
  const [openPost, setOpenPost] = useState<Announcement | null>(null);
  const [postTarget, setPostTarget] = useState<NoticePostTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  // ?notice=<id> (from the notification bell) opens that notice, then drops out of the
  // URL so the dialog can be closed and the same link used again.
  const noticeParam = searchParams.get("notice");
  useEffect(() => {
    if (!noticeParam || isLoading) return;
    setOpenPost(announcements.find((a) => a.id === noticeParam) ?? null);
    router.replace(pathname, { scroll: false });
  }, [noticeParam, isLoading, announcements, router, pathname]);

  // A notice counts as read once it has been opened and closed again.
  const handleCloseDetail = () => {
    if (openPost?.unread) markRead(openPost.id);
    setOpenPost(null);
  };

  const canPost = !!user && POSTING_ROLES.includes(user.role);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAnnouncement(deleteTarget.id);
      toast.success("Notice deleted");
    } catch {
      toast.error("Failed to delete the notice");
    }
    setDeleteTarget(null);
  };

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Dashboard" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
          {BOARDS.map((board) => {
            const posts = announcements.filter((a) => a.scope === board.scope);
            const ownTarget = viewer ? board.ownTarget(viewer) : null;
            return (
              <NoticeBoardCard
                key={board.scope}
                title={board.title}
                caption={ownTarget ?? undefined}
                posts={posts}
                isLoading={isLoading}
                emptyText={ownTarget === null && !isLoading ? board.unassignedText : "No notices."}
                showTarget={posts.some((p) => p.target !== (ownTarget ?? ""))}
                canPost={canPost}
                onPost={() => setPostTarget({ scope: board.scope })}
                onOpen={setOpenPost}
                onEdit={(post) => setPostTarget({ post })}
                onDelete={setDeleteTarget}
              />
            );
          })}
        </div>
      </div>

      <NoticeDetailModal post={openPost} onClose={handleCloseDetail} />
      <NoticePostModal
        target={postTarget}
        viewer={viewer}
        onClose={() => setPostTarget(null)}
        onCreate={createAnnouncement}
        onUpdate={updateAnnouncement}
        onAddAttachment={addAttachment}
        onRemoveAttachment={removeAttachment}
      />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete notice"
        description={`Delete "${deleteTarget?.title}"? It disappears from the board for everyone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
