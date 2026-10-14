import { APIError } from "encore.dev/api";
import { isAdminLevel } from "../../../lib/rbac";
import { announcementRepository } from "../repositories/announcement.repository";
import { announcementAttachmentRepository } from "../repositories/announcementAttachment.repository";
import { departmentRepository, branchRepository, countryRepository } from "../repositories/orgUnit.repository";
import { userRepository } from "../repositories/user.repository";
import type { AnnouncementRecord } from "../schemas/announcement.schema";
import { MAX_ATTACHMENT_BYTES, parseAttachmentDataUrl } from "../lib/attachmentDataUrl";
import { type AnnouncementScope, audienceCountryCode, audienceLabel, isAddressedTo } from "../lib/announcementAudience";

export { ANNOUNCEMENT_SCOPES, type AnnouncementScope } from "../lib/announcementAudience";

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
  // Who the post is addressed to, e.g. "Czechia · Prague Office · Accounting", or "All".
  target: string;
  // The same audience as ids, each null for "all", so the board can be filtered by it.
  countryCode: string | null;
  branchId: string | null;
  departmentId: string | null;
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

// Who a post is addressed to and how far it has got: its audience split by whether they opened it.
export interface AnnouncementReadReceipts {
  read: { name: string; readAt: string }[];
  unread: { name: string }[];
}

// Where the reader sits, so the UI can caption each board and preselect targets.
export interface NoticeboardViewer {
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  country: string | null;
  countryCode: string | null;
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
  // For "audience": one of the company's countries; left out means all countries.
  countryCode?: string;
  severity?: string;
  title: string;
  body?: string;
}

interface AnnouncementPatch {
  severity?: string;
  title?: string;
  body?: string;
}

// Lengths are bounded by the request validators; a title of only spaces still counts as none.
function checkTitle(value: string | undefined): string {
  const title = value?.trim();
  if (!title) throw APIError.invalidArgument("title is required");
  return title;
}

function checkSeverity(severity: string): string {
  if (!(ANNOUNCEMENT_SEVERITIES as readonly string[]).includes(severity)) {
    throw APIError.invalidArgument("severity must be info, warning or critical");
  }
  return severity;
}

const postNotFound = () => APIError.notFound("Post not found");
const attachmentNotFound = () => APIError.notFound("Attachment not found");

class AnnouncementService {
  async list(actor: Actor): Promise<{ viewer: NoticeboardViewer; announcements: AnnouncementInfo[] }> {
    const viewer = await this.#viewer(actor);
    const admin = isAdminLevel(actor.role);
    // Mirrors the role gate on the write endpoints, so the buttons only show where they work.
    const canPost = admin || actor.role === "manager";
    const rows = await announcementRepository.listForAudience(actor.companyID, {
      all: admin,
      userId: actor.userID,
      departmentId: viewer.departmentId,
      branchId: viewer.branchId,
      country: viewer.country,
      countryCode: viewer.countryCode,
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
      target: audienceLabel([r.country, r.branchName, r.departmentName]),
      countryCode: audienceCountryCode(r),
      branchId: r.branchId,
      departmentId: r.departmentId,
      severity: r.severity,
      title: r.title,
      body: r.body,
      authorId: r.authorId,
      authorName: r.authorName || r.authorEmail,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      canEdit: admin || (canPost && r.authorId === actor.userID),
      // Admins see every board, but a post counts as unread only for the people it is addressed
      // to — the same audience its read receipts count.
      unread: r.authorId !== actor.userID && !r.readAt && isAddressedTo(r, viewer),
      attachments: attachmentsByPost.get(r.id) ?? [],
    }));
    return { viewer, announcements };
  }

  // Returns the new post's id and whom it went to, worded as on the board.
  async create(actor: Actor, input: AnnouncementInput): Promise<{ id: string; target: string }> {
    const title = checkTitle(input.title);
    const { label, ...columns } = await this.#resolveTarget(actor.companyID, input);
    const row = await announcementRepository.createForCompany(actor.companyID, {
      ...columns,
      severity: checkSeverity(input.severity ?? "info"),
      title,
      body: input.body?.trim() ?? "",
      authorId: actor.userID,
    });
    return { id: row.id, target: label };
  }

  async update(actor: Actor, id: string, patch: AnnouncementPatch): Promise<void> {
    await this.#editable(actor, id);
    const changes: AnnouncementPatch = {};
    if (patch.title !== undefined) changes.title = checkTitle(patch.title);
    if (patch.body !== undefined) changes.body = patch.body.trim();
    if (patch.severity !== undefined) changes.severity = checkSeverity(patch.severity);
    if (!(await announcementRepository.updateForCompany(id, actor.companyID, changes))) throw postNotFound();
  }

  async addAttachment(actor: Actor, id: string, input: AnnouncementAttachmentInput): Promise<AnnouncementAttachmentInfo> {
    await this.#editable(actor, id);
    const fileName = input.fileName.trim();
    if (!fileName) throw APIError.invalidArgument("fileName is required");
    // The type and size come from the content itself, not from what the client claims.
    const content = parseAttachmentDataUrl(input.fileData);
    if (!content) throw APIError.invalidArgument("fileData must be a base64 data URL");
    if (content.fileSize === 0) throw APIError.invalidArgument("The document is empty");
    if (content.fileSize > MAX_ATTACHMENT_BYTES) throw APIError.invalidArgument("The document is larger than 10 MB");
    const row = await announcementAttachmentRepository.createForCompany(actor.companyID, {
      announcementId: id,
      fileName,
      fileType: content.fileType,
      fileSize: content.fileSize,
      fileData: input.fileData,
    });
    return { id: row.id, fileName: row.fileName, fileType: row.fileType, fileSize: row.fileSize };
  }

  async removeAttachment(actor: Actor, attachmentId: string): Promise<void> {
    const attachment = await announcementAttachmentRepository.getByIdForCompany(attachmentId, actor.companyID);
    if (!attachment) throw attachmentNotFound();
    await this.#editable(actor, attachment.announcementId);
    if (!(await announcementAttachmentRepository.softDeleteForCompany(attachmentId, actor.companyID))) throw attachmentNotFound();
  }

  // Only readers of the post get its documents, so a raw attachment id from another
  // company, another board or a deleted post can't be read.
  async attachmentContent(actor: Actor, attachmentId: string): Promise<AnnouncementAttachmentContent> {
    const attachment = await announcementAttachmentRepository.getByIdForCompany(attachmentId, actor.companyID);
    if (!attachment || !(await this.#visible(actor, attachment.announcementId))) throw attachmentNotFound();
    return { fileName: attachment.fileName, fileType: attachment.fileType, fileData: attachment.fileData };
  }

  // The reader has opened this post.
  async markRead(actor: Actor, id: string): Promise<void> {
    if (!(await this.#visible(actor, id))) throw postNotFound();
    await announcementRepository.markRead(id, actor.userID);
  }

  // For whoever manages the post: which of the people it is addressed to have opened it.
  // The audience is the board's members (everyone for the company board), without the
  // author; admins who merely moderate another department's board are not counted.
  async readReceipts(actor: Actor, id: string): Promise<AnnouncementReadReceipts> {
    const post = await this.#editable(actor, id);
    const [users, branches, reads] = await Promise.all([
      userRepository.listByCompany(actor.companyID),
      branchRepository.listForCompany(actor.companyID),
      announcementRepository.listReads(id),
    ]);
    // Each user sits where their department and branch put them; the branch gives the country.
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const addressed = (u: (typeof users)[number]) => {
      const branch = u.branchId ? branchById.get(u.branchId) : undefined;
      return isAddressedTo(post, {
        departmentId: u.departmentId,
        branchId: branch?.id ?? null,
        country: branch?.country ?? null,
        countryCode: branch?.countryCode ?? null,
      });
    };
    const readAt = new Map(reads.map((r) => [r.userId, r.readAt]));
    const audience = users
      .filter((u) => u.id !== post.authorId && addressed(u))
      .map((u) => ({ name: u.displayName || u.email, readAt: readAt.get(u.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      read: audience.filter((u) => u.readAt).map((u) => ({ name: u.name, readAt: u.readAt!.toISOString() })),
      unread: audience.filter((u) => !u.readAt).map((u) => ({ name: u.name })),
    };
  }

  async delete(actor: Actor, id: string): Promise<void> {
    await this.#editable(actor, id);
    if (!(await announcementRepository.softDeleteForCompany(id, actor.companyID))) throw postNotFound();
  }

  // Whether the post is live and on a board the reader sees — the same rule as list().
  async #visible(actor: Actor, id: string): Promise<boolean> {
    const post = await announcementRepository.getByIdForCompany(id, actor.companyID);
    if (!post) return false;
    if (isAdminLevel(actor.role) || post.scope === "company" || post.authorId === actor.userID) return true;
    return isAddressedTo(post, await this.#viewer(actor));
  }

  // Authors manage their own posts; company admins manage every post. Returns the post.
  async #editable(actor: Actor, id: string): Promise<AnnouncementRecord> {
    const existing = await announcementRepository.getByIdForCompany(id, actor.companyID);
    if (!existing) throw postNotFound();
    if (!isAdminLevel(actor.role) && existing.authorId !== actor.userID) {
      throw APIError.permissionDenied("You can only change your own posts");
    }
    return existing;
  }

  // Validates the board + addressee and returns exactly the columns that board uses, with the
  // addressee worded as the board shows it.
  async #resolveTarget(companyId: string, input: AnnouncementInput) {
    const empty = { departmentId: null, branchId: null, country: null, countryCode: null };
    switch (input.scope as AnnouncementScope) {
      case "company":
        return { ...empty, scope: "company", label: audienceLabel([]) };
      case "audience": {
        // Each of country, branch and department is one of the company's own, or left out for all.
        const code = input.countryCode?.trim().toUpperCase();
        const country = code ? await countryRepository.findByCode(companyId, code) : null;
        if (code && !country) throw APIError.invalidArgument("Choose one of the organization's countries");
        const branch = input.branchId ? await branchRepository.getByIdForCompany(input.branchId, companyId) : null;
        if (input.branchId && !branch) throw APIError.invalidArgument("Choose one of the organization's branches");
        if (branch && country && branch.countryCode !== country.code) throw APIError.invalidArgument("The branch is not in this country");
        const department = input.departmentId ? await departmentRepository.getByIdForCompany(input.departmentId, companyId) : null;
        if (input.departmentId && !department) throw APIError.invalidArgument("Choose one of the organization's departments");
        // All three left at "all" is everyone: the company-wide notice.
        if (!country && !branch && !department) return { ...empty, scope: "company", label: audienceLabel([]) };
        return {
          scope: "audience",
          country: country?.name ?? null,
          countryCode: country?.code ?? null,
          branchId: branch?.id ?? null,
          departmentId: department?.id ?? null,
          label: audienceLabel([country?.name, branch?.name, department?.name]),
        };
      }
      case "department": {
        const department = input.departmentId && (await departmentRepository.getByIdForCompany(input.departmentId, companyId));
        if (!department) throw APIError.invalidArgument("Choose a department");
        return { ...empty, scope: "department", departmentId: department.id, label: audienceLabel([department.name]) };
      }
      case "branch": {
        const branch = input.branchId && (await branchRepository.getByIdForCompany(input.branchId, companyId));
        if (!branch) throw APIError.invalidArgument("Choose a branch");
        return { ...empty, scope: "branch", branchId: branch.id, label: audienceLabel([branch.name]) };
      }
      case "country": {
        const country = input.country?.trim();
        if (!country) throw APIError.invalidArgument("Choose a country");
        return { ...empty, scope: "country", country, label: audienceLabel([country]) };
      }
      default:
        throw APIError.invalidArgument("scope must be company, audience, department, branch or country");
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
      countryCode: branch?.countryCode ?? null,
    };
  }
}

export const announcementService = new AnnouncementService();
