import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { announcementService } from "../services/announcement.service";
import type {
  AnnouncementInfo,
  AnnouncementAttachmentInfo,
  AnnouncementAttachmentContent,
  AnnouncementReadReceipts,
  NoticeboardViewer,
} from "../services/announcement.service";

// The dashboard noticeboard. Everyone reads the boards they belong to; admins and
// managers post. All identity and tenancy comes from the token.

interface AnnouncementListResponse {
  viewer: NoticeboardViewer;
  announcements: AnnouncementInfo[];
}

export const announcementList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/announcements" },
  async (): Promise<AnnouncementListResponse> => {
    return announcementService.list(requireRole());
  },
);

interface AnnouncementMarkReadRequest {
  id: string;
}

// The reader has opened this post; it stops counting as unread for them.
export const announcementMarkRead = api(
  { expose: true, auth: true, method: "POST", path: "/auth/announcements/:id/read" },
  async (req: AnnouncementMarkReadRequest): Promise<OkResponse> => {
    await announcementService.markRead(requireRole(), req.id);
    return { ok: true };
  },
);

// Who of the post's audience has opened it — for its author and for admins.
export const announcementReadReceipts = api(
  { expose: true, auth: true, method: "GET", path: "/auth/announcements/:id/read-receipts" },
  async (req: AnnouncementMarkReadRequest): Promise<AnnouncementReadReceipts> => {
    return announcementService.readReceipts(requireRole("superadmin", "admin", "manager"), req.id);
  },
);

interface AnnouncementCreateRequest {
  scope: string; // company | audience | department | branch | country
  // The addressee matching the scope; ignored for "company". For "audience" each of
  // countryCode, branchId and departmentId may be left out, meaning all of them.
  departmentId?: string;
  branchId?: string;
  country?: string & MaxLen<100>;
  countryCode?: string & MaxLen<2>;
  severity?: string; // info | warning | critical
  // The same limits the post dialog enforces; the whole list is polled, so text stays bounded.
  title: string & MinLen<1> & MaxLen<200>;
  body?: string & MaxLen<20000>;
}

interface AnnouncementCreateResponse {
  id: string;
  // Whom the post went to, worded as on the board ("Czechia · Prague Office", "All").
  target: string;
}

export const announcementCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/announcements" },
  async (req: AnnouncementCreateRequest): Promise<AnnouncementCreateResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return announcementService.create(actor, req);
  },
);

interface AnnouncementUpdateRequest {
  id: string;
  severity?: string;
  title?: string & MinLen<1> & MaxLen<200>;
  body?: string & MaxLen<20000>;
}

interface OkResponse {
  ok: boolean;
}

export const announcementUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/announcements/:id" },
  async (req: AnnouncementUpdateRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    const { id, ...patch } = req;
    await announcementService.update(actor, id, patch);
    return { ok: true };
  },
);

interface AnnouncementDeleteRequest {
  id: string;
}

export const announcementDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/announcements/:id" },
  async (req: AnnouncementDeleteRequest): Promise<OkResponse> => {
    await announcementService.delete(requireRole("superadmin", "admin", "manager"), req.id);
    return { ok: true };
  },
);

interface AnnouncementAttachmentCreateRequest {
  id: string;
  fileName: string & MinLen<1> & MaxLen<255>;
  fileType?: string;
  fileSize?: number;
  fileData: string & MinLen<1>; // base64 data URL
}

interface AnnouncementAttachmentResponse {
  attachment: AnnouncementAttachmentInfo;
}

// One document per call, so a post with several files never exceeds the body limit.
export const announcementAttachmentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/announcements/:id/attachments", bodyLimit: 20 * 1024 * 1024 },
  async (req: AnnouncementAttachmentCreateRequest): Promise<AnnouncementAttachmentResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    const { id, ...input } = req;
    return { attachment: await announcementService.addAttachment(actor, id, input) };
  },
);

interface AnnouncementAttachmentRequest {
  id: string;
}

export const announcementAttachmentContent = api(
  { expose: true, auth: true, method: "GET", path: "/auth/announcement-attachments/:id/content" },
  async (req: AnnouncementAttachmentRequest): Promise<AnnouncementAttachmentContent> => {
    return announcementService.attachmentContent(requireRole(), req.id);
  },
);

export const announcementAttachmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/announcement-attachments/:id" },
  async (req: AnnouncementAttachmentRequest): Promise<OkResponse> => {
    await announcementService.removeAttachment(requireRole("superadmin", "admin", "manager"), req.id);
    return { ok: true };
  },
);
