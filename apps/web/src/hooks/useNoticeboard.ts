"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, services } from "@/lib/api";
import { fileToDataUrl } from "@/lib/files";

export type Announcement = services.AnnouncementInfo;
export type AnnouncementAttachment = services.AnnouncementAttachmentInfo;
export type NoticeboardViewer = services.NoticeboardViewer;
export type NewAnnouncementInput = controllers.AnnouncementCreateRequest;
export type UpdateAnnouncementInput = controllers.AnnouncementUpdateRequest;

const KEY = ["noticeboard"];
// One stable empty list while loading, so effects keyed on the list do not re-run every render.
const NO_ANNOUNCEMENTS: Announcement[] = [];

export const useNoticeboard = () => {
  const qc = useQueryClient();
  // Polled so a colleague's new notice reaches the bell and the boards without a reload.
  const query = useQuery({ queryKey: KEY, queryFn: () => api.auth.announcementList(), refetchInterval: 15000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  const create = useMutation({
    mutationFn: (input: NewAnnouncementInput) => api.auth.announcementCreate(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAnnouncementInput }) => api.auth.announcementUpdate(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.auth.announcementDelete(id), onSuccess: invalidate });
  const attach = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) =>
      api.auth.announcementAttachmentCreate(id, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: await fileToDataUrl(file),
      }),
    onSuccess: invalidate,
  });
  const detach = useMutation({ mutationFn: (id: string) => api.auth.announcementAttachmentDelete(id), onSuccess: invalidate });
  const markRead = useMutation({ mutationFn: (id: string) => api.auth.announcementMarkRead(id), onSuccess: invalidate });

  return {
    announcements: query.data?.announcements ?? NO_ANNOUNCEMENTS,
    viewer: query.data?.viewer,
    // The list has arrived at least once; a failed first request leaves this false.
    hasLoaded: query.data !== undefined,
    // Nothing to show because the request failed (a failed refresh keeps the old list).
    isError: query.isError && query.data === undefined,
    createAnnouncement: create.mutateAsync,
    updateAnnouncement: update.mutateAsync,
    deleteAnnouncement: remove.mutateAsync,
    addAttachment: attach.mutateAsync,
    removeAttachment: detach.mutateAsync,
    markRead: markRead.mutate,
  };
};
