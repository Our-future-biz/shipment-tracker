import { eq, and, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { quoteAttachmentTable } from "../schemas/quoteAttachment.schema";
import type { QuoteTransaction } from "./salesQuote.repository";

// The files attached to quotes on the old quotes page. Nothing lists, adds or serves them any
// more; their rows and the files in the bucket stay stored. What is left to do with them is
// below.
class QuoteAttachmentRepository extends TenantRepository<typeof quoteAttachmentTable> {
  constructor() {
    super(db, quoteAttachmentTable, "quote_attachment");
  }

  // The attachments of a quote that is being deleted, in the transaction that deletes it: they
  // go with the quote or not at all. Only the rows, stamped with the moment of the quote's own
  // deletion - the files stay in the bucket, so a quote that is brought back (deleted_at cleared)
  // can have exactly these attachments brought back with it.
  async deleteForQuote(tx: QuoteTransaction, quoteNumber: string, companyId: string, at: Date): Promise<void> {
    await tx
      .update(quoteAttachmentTable)
      .set({ deletedAt: at, updatedAt: at })
      .where(and(
        eq(quoteAttachmentTable.companyId, companyId),
        eq(quoteAttachmentTable.quoteNumber, quoteNumber),
        isNull(quoteAttachmentTable.deletedAt),
      ));
  }
}

export const quoteAttachmentRepository = new QuoteAttachmentRepository();
