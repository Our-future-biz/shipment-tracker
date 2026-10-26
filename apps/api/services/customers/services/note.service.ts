import { APIError } from "encore.dev/api";
import { customerNoteRepository } from "../repositories/customerNote.repository";
import type { NewCustomerNoteRecord } from "../schemas/customerNote.schema";
import type { NoteItem, NoteType } from "../interfaces/interfaces";
import { toNoteItem } from "../lib/mappers";
import { customerService } from "./customer.service";
import { userRefs } from "../../../lib/userNames";

export interface NoteInput {
  type?: NoteType;
  content: string;
}

class NoteService {
  async listByCustomer(customerId: string, companyId: string): Promise<NoteItem[]> {
    return (await customerNoteRepository.findByCustomer(customerId, companyId)).map(toNoteItem);
  }

  /** The author is the user `userId` (the signed-in one), recorded by e-mail as every person is. */
  async create(companyId: string, customerId: string, userId: string, input: NoteInput): Promise<NoteItem> {
    await customerService.requireLive(customerId, companyId);
    const author = (await userRefs([userId])).get(userId)?.email.trim().toLowerCase() ?? "";
    const values: Omit<NewCustomerNoteRecord, "companyId"> = {
      customerId,
      type: input.type ?? "Note",
      content: input.content,
      author,
    };
    const row = await customerNoteRepository.createForCompany(companyId, values);
    return toNoteItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerNoteRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Note not found");
  }
}

export const noteService = new NoteService();
