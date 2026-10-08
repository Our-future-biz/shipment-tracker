import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { announcementAttachmentTable } from "../schemas/announcement.schema";

class AnnouncementAttachmentRepository extends TenantRepository<typeof announcementAttachmentTable> {
  constructor() {
    super(db as never, announcementAttachmentTable, "announcement_attachment");
  }

  // Every live attachment in the company, without the bytes — the noticeboard lists them per post.
  async listMeta(companyId: string) {
    return this.db
      .select({
        id: announcementAttachmentTable.id,
        announcementId: announcementAttachmentTable.announcementId,
        fileName: announcementAttachmentTable.fileName,
        fileType: announcementAttachmentTable.fileType,
        fileSize: announcementAttachmentTable.fileSize,
      })
      .from(announcementAttachmentTable)
      .where(and(eq(announcementAttachmentTable.companyId, companyId), isNull(announcementAttachmentTable.deletedAt)))
      .orderBy(asc(announcementAttachmentTable.createdAt));
  }
}

export const announcementAttachmentRepository = new AnnouncementAttachmentRepository();
