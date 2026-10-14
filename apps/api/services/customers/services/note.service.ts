import { APIError } from "encore.dev/api";
import { customerNoteRepository } from "../repositories/customerNote.repository";
import type { NewCustomerNoteRecord } from "../schemas/customerNote.schema";
import type { NoteItem, NoteType } from "../interfaces/interfaces";
import { toNoteItem } from "../lib/mappers";
import { customerService } from "./customer.service";

export interface NoteInput {
  type?: NoteType;
  content: string;
  author?: string;
}

class NoteService {
  async listByCustomer(customerId: string, companyId: string): Promise<NoteItem[]> {
    return (await customerNoteRepository.findByCustomer(customerId, companyId)).map(toNoteItem);
  }

  async create(companyId: string, customerId: string, input: NoteInput): Promise<NoteItem> {
    await customerService.requireLive(customerId, companyId);
    const values: Omit<NewCustomerNoteRecord, "companyId"> = {
      customerId,
      type: input.type ?? "Note",
      content: input.content,
      author: input.author ?? "",
    };
    const row = await customerNoteRepository.createForCompany(companyId, values);
    return toNoteItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerNoteRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Note not found");
  }
}

export const noteService = new NoteService();
