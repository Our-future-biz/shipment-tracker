import { APIError } from "encore.dev/api";
import { isAdminLevel } from "../../../lib/rbac";
import { announcementRepository } from "../repositories/announcement.repository";
import { announcementAttachmentRepository } from "../repositories/announcementAttachment.repository";
import { departmentRepository, branchRepository, countryRepository } from "../repositories/orgUnit.repository";
import { userRepository } from "../repositories/user.repository";
import type { AnnouncementRecord } from "../schemas/announcement.schema";
import { MAX_ATTACHMENT_BYTES, parseAttachmentDataUrl } from "../lib/attachmentDataUrl";
import { type AnnouncementScope, type AudienceLists, audienceCountryCodes, audienceLabel, isAddressedTo } from "../lib/announcementAudience";

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
  // The same audience as ids, each empty for "all", so the board can be filtered by it.
  countryCodes: string[];
  branchIds: string[];
  departmentIds: string[];
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
  // When the reader opened it; null when not (yet). The bell keeps a read post for 7 days.
  readAt: string | null;
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
  // For "audience" from a page loaded before several could be chosen: its one country (code). It, branchId and
  // departmentId are each taken as a list of one (review of system-23).
  countryCode?: string;
  // For "audience": the company's countries (codes), branches and departments it is for, each left out or
  // empty for all of them. Several of each may be chosen (owner's answer 22 Nov).
  countryCodes?: string[];
  branchIds?: string[];
  departmentIds?: string[];
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
const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];
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
    const names = await this.#audienceNames(actor.companyID, rows);
    const attachmentsByPost = new Map<string, AnnouncementAttachmentInfo[]>();
    for (const { announcementId, ...file } of attachments) {
      attachmentsByPost.set(announcementId, [...(attachmentsByPost.get(announcementId) ?? []), file]);
    }
    const announcements = rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      target:
        r.scope === "audience"
          ? audienceLabel([names.countries(r.countryCodes), names.branches(r.branchIds), names.departments(r.departmentIds)])
          : audienceLabel([r.country, r.branchName, r.departmentName]),
      countryCodes: audienceCountryCodes(r),
      branchIds: r.scope === "audience" ? r.branchIds : r.branchId ? [r.branchId] : [],
      departmentIds: r.scope === "audience" ? r.departmentIds : r.departmentId ? [r.departmentId] : [],
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
      readAt: r.readAt ? new Date(r.readAt).toISOString() : null,
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
    const empty = { departmentId: null, branchId: null, country: null, countryCode: null, countryCodes: [], branchIds: [], departmentIds: [] };
    switch (input.scope as AnnouncementScope) {
      case "company":
        return { ...empty, scope: "company", label: audienceLabel([]) };
      case "audience": {
        // Each country, branch and department is one of the company's own; a list left empty is all of them. A
        // page loaded before several could be chosen sends its one country, branch and department in countryCode,
        // branchId and departmentId: each is taken as a list of one, merged with the lists, not dropped - dropped,
        // "Brno, all countries, all departments" was posted to everyone (review of system-23).
        const codes = unique([...(input.countryCodes ?? []), input.countryCode ?? ""].map((c) => c.trim().toUpperCase()));
        const branchIds = unique([...(input.branchIds ?? []), input.branchId ?? ""]);
        const departmentIds = unique([...(input.departmentIds ?? []), input.departmentId ?? ""]);
        // Nothing chosen is no audience: a notice to everyone is a company notice, which the page asks
        // "Send to all?" for before it sends one.
        if (!codes.length && !branchIds.length && !departmentIds.length) {
          throw APIError.invalidArgument("Choose a country, branch or department; a notice to all is a company notice");
        }
        const [countries, branches, departments] = await Promise.all([
          countryRepository.listByName(companyId),
          branchRepository.listByName(companyId),
          departmentRepository.listByName(companyId),
        ]);
        const chosenCountries = codes.map((code) => countries.find((c) => c.code === code));
        if (chosenCountries.some((c) => !c)) throw APIError.invalidArgument("Choose the organization's own countries");
        const chosenBranches = branchIds.map((id) => branches.find((b) => b.id === id));
        if (chosenBranches.some((b) => !b)) throw APIError.invalidArgument("Choose the organization's own branches");
        const outside = chosenBranches.find((b) => codes.length > 0 && !codes.includes(b!.countryCode ?? ""));
        if (outside) throw APIError.invalidArgument(`${outside.name} is not in the countries chosen`);
        const chosenDepartments = departmentIds.map((id) => departments.find((d) => d.id === id));
        if (chosenDepartments.some((d) => !d)) throw APIError.invalidArgument("Choose the organization's own departments");
        return {
          ...empty,
          scope: "audience",
          countryCodes: chosenCountries.map((c) => c!.code),
          branchIds: chosenBranches.map((b) => b!.id),
          departmentIds: chosenDepartments.map((d) => d!.id),
          label: audienceLabel([chosenCountries.map((c) => c!.name), chosenBranches.map((b) => b!.name), chosenDepartments.map((d) => d!.name)]),
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

  // The names of the countries, branches and departments the audience posts are for, looked up once per list -
  // the ones removed from the organization since too, so a post still says whom it was for by name (review of
  // system-23: the pickers' live lists left a removed branch as its raw id).
  async #audienceNames(companyId: string, rows: (AudienceLists & { scope: string })[]) {
    const audience = rows.filter((r) => r.scope === "audience");
    const keys = (list: (r: AudienceLists) => readonly string[]) => unique(audience.flatMap(list));
    const lists = audience.length
      ? await Promise.all([
          countryRepository.namesByCodes(companyId, keys((r) => r.countryCodes)),
          branchRepository.namesByIds(companyId, keys((r) => r.branchIds)),
          departmentRepository.namesByIds(companyId, keys((r) => r.departmentIds)),
        ])
      : [[], [], []];
    // The first row of a key names it (a country's live row comes before its removed ones).
    const byKey = <T,>(items: T[], key: (t: T) => string, name: (t: T) => string) => {
      const map = new Map<string, string>();
      for (const item of items) if (!map.has(key(item))) map.set(key(item), name(item));
      return map;
    };
    const [countries, branches, departments] = [
      byKey(lists[0], (c) => c.code, (c) => c.name),
      byKey(lists[1], (b) => b.id, (b) => b.name),
      byKey(lists[2], (d) => d.id, (d) => d.name),
    ];
    // One whose row is not there at all keeps its id or code, so the post still says whom it was for.
    const named = (map: Map<string, string>) => (keys: readonly string[]) => keys.map((k) => map.get(k) ?? k);
    return { countries: named(countries), branches: named(branches), departments: named(departments) };
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
