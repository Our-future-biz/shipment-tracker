import { and, eq, desc, isNull } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerDocumentTable } from "../schemas/customerDocument.schema";

class CustomerDocumentRepository extends BaseRepository<typeof customerDocumentTable> {
  constructor() {
    super(db as never, customerDocumentTable, "customer_document");
  }

  async findByCustomer(customerId: string) {
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
      .where(and(eq(customerDocumentTable.customerId, customerId), isNull(customerDocumentTable.deletedAt)))
      .orderBy(desc(customerDocumentTable.createdAt));
  }

  async getFileData(id: string) {
    const [row] = await this.db
      .select({
        fileName: customerDocumentTable.fileName,
        fileType: customerDocumentTable.fileType,
        fileData: customerDocumentTable.fileData,
      })
      .from(customerDocumentTable)
      .where(and(eq(customerDocumentTable.id, id), isNull(customerDocumentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }
}

export const customerDocumentRepository = new CustomerDocumentRepository();
