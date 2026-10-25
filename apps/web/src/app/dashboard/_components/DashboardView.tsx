"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useNoticeboard } from "@/hooks/useNoticeboard";
import type { Announcement } from "@/hooks/useNoticeboard";
import { useBranches } from "@/hooks/useOrgUnits";
import { filterNotices, hasFilters } from "../_lib/noticeFilters";
import type { NoticeFilters } from "../_lib/noticeFilters";
import { NoticeFiltersBar } from "./NoticeFiltersBar";
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

  // A notice counts as read only once the reader confirms it with the Read button in the detail;
  // opening and closing it leaves it unread.
  const handleCloseDetail = () => setOpenId(null);

  const canPost = !!user && POSTING_ROLES.includes(user.role);
  const [filters, setFilters] = useState<NoticeFilters>({});
  const { branches } = useBranches();
  const branchCountry = branches.find((b) => b.id === filters.branchId)?.countryCode;
  const shownNotices = filterNotices(announcements, filters, branchCountry);
  const filtered = hasFilters(filters);
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
          posts={shownNotices}
          headerExtra={
            <Input
              placeholder="Search notices..."
              aria-label="Search notices"
              prefix={<SearchOutlined className="text-slate-400" />}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              allowClear
              className="!w-80 !py-0.5 !ml-112"
            />
          }
          toolbar={<NoticeFiltersBar value={filters} onChange={setFilters} shown={shownNotices.length} total={announcements.length} />}
          isLoading={isLoading}
          emptyText={isError ? "Could not load notices." : filtered ? "No notices match the search or filters." : "No notices."}
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

      {/* Left only by confirming it was read (or with Close, once it is). Edit and Delete are in the table's row menu. */}
      <NoticeDetailModal
        post={openPost}
        onClose={handleCloseDetail}
        onConfirmRead={(post) => markRead(post.id)}
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
