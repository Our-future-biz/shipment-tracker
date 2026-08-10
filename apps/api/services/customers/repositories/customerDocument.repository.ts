import { and, eq, desc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerDocumentTable } from "../schemas/customerDocument.schema";

class CustomerDocumentRepository extends TenantRepository<typeof customerDocumentTable> {
  constructor() {
    super(db as never, customerDocumentTable, "customer_document");
  }

  // Note: fileData is deliberately excluded from list projections.
  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select({
        id: customerDocumentTable.id,
        customerId: customerDocumentTable.customerId,
        name: customerDocumentTable.name,
        type: customerDocumentTable.type,
        fileName: customerDocumentTable.fileName,
        fileType: customerDocumentTable.fileType,
        fileSize: customerDocumentTable.fileSize,
        createdAt: customerDocumentTable.createdAt,
        updatedAt: customerDocumentTable.updatedAt,
      })
      .from(customerDocumentTable)
      .where(and(
        eq(customerDocumentTable.companyId, companyId),
        eq(customerDocumentTable.customerId, customerId),
        isNull(customerDocumentTable.deletedAt),
      ))
      .orderBy(desc(customerDocumentTable.createdAt));
  }

  // Scoped by company so a raw document id from another company can't be read.
  async getFileData(id: string, companyId: string) {
    const [row] = await this.db
      .select({
        fileName: customerDocumentTable.fileName,
        fileType: customerDocumentTable.fileType,
        fileData: customerDocumentTable.fileData,
      })
      .from(customerDocumentTable)
      .where(and(
        eq(customerDocumentTable.id, id),
        eq(customerDocumentTable.companyId, companyId),
        isNull(customerDocumentTable.deletedAt),
      ))
      .limit(1);
    return row ?? null;
  }
}

export const customerDocumentRepository = new CustomerDocumentRepository();
