import { api, APIError } from "encore.dev/api";
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
    if (!(await announcementService.markRead(requireRole(), req.id))) {
      throw APIError.notFound("Post not found");
    }
    return { ok: true };
  },
);

// Who of the post's audience has opened it — for its author and for admins.
export const announcementReadReceipts = api(
  { expose: true, auth: true, method: "GET", path: "/auth/announcements/:id/read-receipts" },
  async (req: AnnouncementMarkReadRequest): Promise<AnnouncementReadReceipts> => {
    const actor = requireRole("superadmin", "admin", "manager");
    const receipts = await announcementService.readReceipts(actor, req.id);
    if (!receipts) throw APIError.notFound("Post not found");
    return receipts;
  },
);

interface AnnouncementCreateRequest {
  scope: string; // company | department | branch | country
  // The addressee matching the scope; ignored for "company".
  departmentId?: string;
  branchId?: string;
  country?: string;
  severity?: string; // info | warning | critical
  title: string;
  body?: string;
}

interface AnnouncementCreateResponse {
  id: string;
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
  title?: string;
  body?: string;
}

interface OkResponse {
  ok: boolean;
}

export const announcementUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/announcements/:id" },
  async (req: AnnouncementUpdateRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    const { id, ...patch } = req;
    if (!(await announcementService.update(actor, id, patch))) {
      throw APIError.notFound("Post not found");
    }
    return { ok: true };
  },
);

interface AnnouncementDeleteRequest {
  id: string;
}

export const announcementDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/announcements/:id" },
  async (req: AnnouncementDeleteRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    if (!(await announcementService.delete(actor, req.id))) {
      throw APIError.notFound("Post not found");
    }
    return { ok: true };
  },
);

interface AnnouncementAttachmentCreateRequest {
  id: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  fileData: string; // base64 data URL
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
    const attachment = await announcementService.addAttachment(actor, id, input);
    if (!attachment) throw APIError.notFound("Post not found");
    return { attachment };
  },
);

interface AnnouncementAttachmentRequest {
  id: string;
}

export const announcementAttachmentContent = api(
  { expose: true, auth: true, method: "GET", path: "/auth/announcement-attachments/:id/content" },
  async (req: AnnouncementAttachmentRequest): Promise<AnnouncementAttachmentContent> => {
    const content = await announcementService.attachmentContent(requireRole(), req.id);
    if (!content) throw APIError.notFound("Attachment not found");
    return content;
  },
);

export const announcementAttachmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/announcement-attachments/:id" },
  async (req: AnnouncementAttachmentRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    if (!(await announcementService.removeAttachment(actor, req.id))) {
      throw APIError.notFound("Attachment not found");
    }
    return { ok: true };
  },
);
