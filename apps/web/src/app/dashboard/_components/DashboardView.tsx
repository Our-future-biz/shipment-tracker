"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useNoticeboard } from "@/hooks/useNoticeboard";
import type { Announcement } from "@/hooks/useNoticeboard";
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
    hasLoaded,
    isError,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    addAttachment,
    removeAttachment,
    markRead,
  } = useNoticeboard();
  // The open notice is looked up in the live list, so the dialog follows edits made
  // elsewhere and closes when the notice is deleted.
  const [openId, setOpenId] = useState<string | null>(null);
  const openPost = (openId && announcements.find((a) => a.id === openId)) || null;
  // The post dialog gets a new key for every opening, which gives it a fresh form.
  const [postDialog, setPostDialog] = useState<{ key: number; target: NoticePostTarget | null }>({ key: 0, target: null });
  // The notice stays set while the confirmation animates out, so its text does not change.
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Blocks a second click that lands before the button has re-rendered as busy.
  const deleteRunning = useRef(false);

  // ?notice=<id> (from the notification bell) opens that notice, then drops out of the
  // URL so the dialog can be closed and the same link used again.
  const noticeParam = searchParams.get("notice");
  const handledParam = useRef<string | null>(null);
  useEffect(() => {
    if (!noticeParam) {
      handledParam.current = null;
      return;
    }
    // Once per link: the list refreshes while the URL is still being rewritten.
    if (!hasLoaded || handledParam.current === noticeParam) return;
    handledParam.current = noticeParam;
    if (announcements.some((a) => a.id === noticeParam)) setOpenId(noticeParam);
    else toast.info("This notice is no longer available");
    router.replace(pathname, { scroll: false });
  }, [noticeParam, hasLoaded, announcements, router, pathname, toast]);

  // Someone deleted the notice the reader has open.
  useEffect(() => {
    if (!openId || !hasLoaded || openPost) return;
    setOpenId(null);
    toast.info("This notice has been deleted");
  }, [openId, hasLoaded, openPost, toast]);

  // A notice counts as read once it has been opened and closed again — or left open while the
  // reader goes elsewhere (Back, a sidebar link), which never closes the dialog.
  const openUnread = useRef<string | null>(null);
  openUnread.current = openPost?.unread ? openPost.id : null;
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  useEffect(
    () => () => {
      if (openUnread.current) markReadRef.current(openUnread.current);
    },
    [],
  );

  const handleCloseDetail = () => {
    if (openPost?.unread) markRead(openPost.id);
    setOpenId(null);
  };

  const canPost = !!user && POSTING_ROLES.includes(user.role);
  // Until the list has arrived or failed — including while the request is held back offline.
  const isLoading = !hasLoaded && !isError;

  const openPostDialog = (target: NoticePostTarget) => setPostDialog((d) => ({ key: d.key + 1, target }));

  const handleDelete = async () => {
    if (!deleteTarget || deleteRunning.current) return;
    deleteRunning.current = true;
    setDeleting(true);
    try {
      await deleteAnnouncement(deleteTarget.id);
      toast.success("Notice deleted");
    } catch {
      toast.error("Failed to delete the notice");
    } finally {
      deleteRunning.current = false;
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Dashboard" />
        {/* One board: every notice addressed to the reader, each tagged with whom it is for. */}
        <NoticeBoardCard
          title="Noticeboard"
          posts={announcements}
          isLoading={isLoading}
          emptyText={isError ? "Could not load notices." : "No notices."}
          showTarget
          canPost={canPost}
          onPost={() => openPostDialog("new")}
          onOpen={(post) => setOpenId(post.id)}
          onEdit={(post) => openPostDialog({ post })}
          onDelete={(post) => {
            setDeleteTarget(post);
            setDeleteOpen(true);
          }}
        />
      </div>

      {/* Editing or deleting from the detail closes it first; the next dialog takes over. */}
      <NoticeDetailModal
        post={openPost}
        onClose={handleCloseDetail}
        onEdit={(post) => {
          handleCloseDetail();
          openPostDialog({ post });
        }}
        onDelete={(post) => {
          handleCloseDetail();
          setDeleteTarget(post);
          setDeleteOpen(true);
        }}
      />
      <NoticePostModal
        key={postDialog.key}
        target={postDialog.target}
        onClose={() => setPostDialog((d) => ({ ...d, target: null }))}
        onCreate={createAnnouncement}
        onUpdate={updateAnnouncement}
        onAddAttachment={addAttachment}
        onRemoveAttachment={removeAttachment}
      />
      <ConfirmModal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete notice"
        description={`Delete "${deleteTarget?.title}"? It disappears from the board for everyone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
