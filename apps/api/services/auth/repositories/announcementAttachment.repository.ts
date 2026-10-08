import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { announcementAttachmentTable } from "../schemas/announcement.schema";

class AnnouncementAttachmentRepository extends TenantRepository<typeof announcementAttachmentTable> {
  constructor() {
    super(db as never, announcementAttachmentTable, "announcement_attachment");
  }

  // The live attachments of the given posts, without the bytes — the noticeboard lists them per post.
  async listMeta(companyId: string, announcementIds: string[]) {
    if (announcementIds.length === 0) return [];
    return this.db
      .select({
        id: announcementAttachmentTable.id,
        announcementId: announcementAttachmentTable.announcementId,
        fileName: announcementAttachmentTable.fileName,
        fileType: announcementAttachmentTable.fileType,
        fileSize: announcementAttachmentTable.fileSize,
      })
      .from(announcementAttachmentTable)
      .where(
        and(
          eq(announcementAttachmentTable.companyId, companyId),
          inArray(announcementAttachmentTable.announcementId, announcementIds),
          isNull(announcementAttachmentTable.deletedAt),
        ),
      )
      .orderBy(asc(announcementAttachmentTable.createdAt));
  }
}

export const announcementAttachmentRepository = new AnnouncementAttachmentRepository();
