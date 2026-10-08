import { APIError } from "encore.dev/api";
import { isAdminLevel } from "../../../lib/rbac";
import { announcementRepository } from "../repositories/announcement.repository";
import { announcementAttachmentRepository } from "../repositories/announcementAttachment.repository";
import { departmentRepository, branchRepository } from "../repositories/orgUnit.repository";
import { userRepository } from "../repositories/user.repository";

export const ANNOUNCEMENT_SCOPES = ["company", "department", "branch", "country"] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export const ANNOUNCEMENT_SEVERITIES = ["info", "warning", "critical"] as const;

export interface AnnouncementAttachmentInfo {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface AnnouncementAttachmentInput {
  fileName: string;
  fileType?: string;
  fileSize?: number;
  fileData: string; // base64 data URL
}

export interface AnnouncementAttachmentContent {
  fileName: string;
  fileType: string;
  fileData: string; // base64 data URL
}

export interface AnnouncementInfo {
  id: string;
  scope: string;
  // Who the post is addressed to within its board, e.g. the department name; empty for "company".
  target: string;
  severity: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  // Posted by someone else and not opened by the reader yet.
  unread: boolean;
  attachments: AnnouncementAttachmentInfo[];
}

// Where the reader sits, so the UI can caption each board and preselect targets.
export interface NoticeboardViewer {
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  country: string | null;
}

interface Actor {
  userID: string;
  companyID: string;
  role: string;
}

interface AnnouncementInput {
  scope: string;
  departmentId?: string;
  branchId?: string;
  country?: string;
  severity?: string;
  title: string;
  body?: string;
}

interface AnnouncementPatch {
  severity?: string;
  title?: string;
  body?: string;
}

function checkSeverity(severity: string): string {
  if (!(ANNOUNCEMENT_SEVERITIES as readonly string[]).includes(severity)) {
    throw APIError.invalidArgument("severity must be info, warning or critical");
  }
  return severity;
}

class AnnouncementService {
  async list(actor: Actor): Promise<{ viewer: NoticeboardViewer; announcements: AnnouncementInfo[] }> {
    const viewer = await this.#viewer(actor);
    const admin = isAdminLevel(actor.role);
    const rows = await announcementRepository.listForAudience(actor.companyID, {
      all: admin,
      userId: actor.userID,
      departmentId: viewer.departmentId,
      branchId: viewer.branchId,
      country: viewer.country,
    });
    const attachments = await announcementAttachmentRepository.listMeta(
      actor.companyID,
      rows.map((r) => r.id),
    );
    const attachmentsByPost = new Map<string, AnnouncementAttachmentInfo[]>();
    for (const { announcementId, ...file } of attachments) {
      attachmentsByPost.set(announcementId, [...(attachmentsByPost.get(announcementId) ?? []), file]);
    }
    const announcements = rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      target: r.departmentName ?? r.branchName ?? r.country ?? "",
      severity: r.severity,
      title: r.title,
      body: r.body,
      authorId: r.authorId,
      authorName: r.authorName || r.authorEmail,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      canEdit: admin || r.authorId === actor.userID,
      unread: r.authorId !== actor.userID && !r.readAt,
      attachments: attachmentsByPost.get(r.id) ?? [],
    }));
    return { viewer, announcements };
  }

  async create(actor: Actor, input: AnnouncementInput): Promise<{ id: string }> {
    const title = input.title?.trim();
    if (!title) throw APIError.invalidArgument("title is required");
    const target = await this.#resolveTarget(actor.companyID, input);
    const row = await announcementRepository.createForCompany(actor.companyID, {
      ...target,
      severity: checkSeverity(input.severity ?? "info"),
      title,
      body: input.body?.trim() ?? "",
      authorId: actor.userID,
    } as never);
    return { id: row.id };
  }

  async update(actor: Actor, id: string, patch: AnnouncementPatch): Promise<boolean> {
    if (!(await this.#editable(actor, id))) return false;
    const changes: AnnouncementPatch = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw APIError.invalidArgument("title is required");
      changes.title = title;
    }
    if (patch.body !== undefined) changes.body = patch.body.trim();
    if (patch.severity !== undefined) changes.severity = checkSeverity(patch.severity);
    return !!(await announcementRepository.updateForCompany(id, actor.companyID, changes));
  }

  async addAttachment(actor: Actor, id: string, input: AnnouncementAttachmentInput): Promise<AnnouncementAttachmentInfo | null> {
    if (!(await this.#editable(actor, id))) return null;
    const fileName = input.fileName?.trim();
    if (!fileName || !input.fileData) throw APIError.invalidArgument("fileName and fileData are required");
    const row = await announcementAttachmentRepository.createForCompany(actor.companyID, {
      announcementId: id,
      fileName,
      fileType: input.fileType ?? "",
      fileSize: input.fileSize ?? 0,
      fileData: input.fileData,
    } as never);
    return { id: row.id, fileName: row.fileName, fileType: row.fileType, fileSize: row.fileSize };
  }

  async removeAttachment(actor: Actor, attachmentId: string): Promise<boolean> {
    const attachment = await announcementAttachmentRepository.getByIdForCompany(attachmentId, actor.companyID);
    if (!attachment || !(await this.#editable(actor, attachment.announcementId))) return false;
    return !!(await announcementAttachmentRepository.softDeleteForCompany(attachmentId, actor.companyID));
  }

  // Only readers of the post get its documents, so a raw attachment id from another
  // company, another board or a deleted post can't be read.
  async attachmentContent(actor: Actor, attachmentId: string): Promise<AnnouncementAttachmentContent | null> {
    const attachment = await announcementAttachmentRepository.getByIdForCompany(attachmentId, actor.companyID);
    if (!attachment || !(await this.#visible(actor, attachment.announcementId))) return null;
    return { fileName: attachment.fileName, fileType: attachment.fileType, fileData: attachment.fileData };
  }

  // The reader has opened this post.
  async markRead(actor: Actor, id: string): Promise<boolean> {
    if (!(await this.#visible(actor, id))) return false;
    await announcementRepository.markRead(id, actor.userID);
    return true;
  }

  async delete(actor: Actor, id: string): Promise<boolean> {
    if (!(await this.#editable(actor, id))) return false;
    return !!(await announcementRepository.softDeleteForCompany(id, actor.companyID));
  }

  // Whether the post is live and on a board the reader sees — the same rule as list().
  async #visible(actor: Actor, id: string): Promise<boolean> {
    const post = await announcementRepository.getByIdForCompany(id, actor.companyID);
    if (!post) return false;
    if (isAdminLevel(actor.role) || post.scope === "company" || post.authorId === actor.userID) return true;
    const viewer = await this.#viewer(actor);
    switch (post.scope as AnnouncementScope) {
      case "department":
        return !!viewer.departmentId && post.departmentId === viewer.departmentId;
      case "branch":
        return !!viewer.branchId && post.branchId === viewer.branchId;
      case "country":
        return !!viewer.country && post.country?.toLowerCase() === viewer.country.toLowerCase();
      default:
        return false;
    }
  }

  // Authors manage their own posts; company admins manage every post.
  async #editable(actor: Actor, id: string): Promise<boolean> {
    const existing = await announcementRepository.getByIdForCompany(id, actor.companyID);
    if (!existing) return false;
    if (!isAdminLevel(actor.role) && existing.authorId !== actor.userID) {
      throw APIError.permissionDenied("You can only change your own posts");
    }
    return true;
  }

  // Validates the board + addressee and returns exactly the columns that board uses.
  async #resolveTarget(companyId: string, input: AnnouncementInput) {
    const empty = { departmentId: null, branchId: null, country: null };
    switch (input.scope as AnnouncementScope) {
      case "company":
        return { ...empty, scope: "company" };
      case "department": {
        const department = input.departmentId && (await departmentRepository.getByIdForCompany(input.departmentId, companyId));
        if (!department) throw APIError.invalidArgument("Choose a department");
        return { ...empty, scope: "department", departmentId: department.id };
      }
      case "branch": {
        const branch = input.branchId && (await branchRepository.getByIdForCompany(input.branchId, companyId));
        if (!branch) throw APIError.invalidArgument("Choose a branch");
        return { ...empty, scope: "branch", branchId: branch.id };
      }
      case "country": {
        const country = input.country?.trim();
        if (!country) throw APIError.invalidArgument("Choose a country");
        return { ...empty, scope: "country", country };
      }
      default:
        throw APIError.invalidArgument("scope must be company, department, branch or country");
    }
  }

  async #viewer(actor: Actor): Promise<NoticeboardViewer> {
    const user = await userRepository.getByIdInCompany(actor.userID, actor.companyID);
    const [department, branch] = await Promise.all([
      user?.departmentId ? departmentRepository.getByIdForCompany(user.departmentId, actor.companyID) : null,
      user?.branchId ? branchRepository.getByIdForCompany(user.branchId, actor.companyID) : null,
    ]);
    return {
      departmentId: department?.id ?? null,
      departmentName: department?.name ?? null,
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      country: branch?.country ?? null,
    };
  }
}

export const announcementService = new AnnouncementService();
