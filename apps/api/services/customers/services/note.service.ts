import { APIError } from "encore.dev/api";
import { customerNoteRepository } from "../repositories/customerNote.repository";
import type { NewCustomerNoteRecord } from "../schemas/customerNote.schema";
import type { NoteItem, NoteType } from "../interfaces/interfaces";
import { toNoteItem } from "../lib/mappers";
import { customerService } from "./customer.service";
import { companyUsers, requireUserEmail, userEmailOf } from "../../../lib/companyUsers";

export interface NoteInput {
  type?: NoteType;
  content: string;
  /** The colleagues who went on a visit with the author, by e-mail; only a visit has them. */
  colleagues?: string[];
}

class NoteService {
  async listByCustomer(customerId: string, companyId: string): Promise<NoteItem[]> {
    return (await customerNoteRepository.findByCustomer(customerId, companyId)).map(toNoteItem);
  }

  /**
   * The author is the user `userId` (the signed-in one), recorded by e-mail as every person is; the
   * colleagues - only a visit names them - must be users of the company too, each once and never the author.
   */
  async create(companyId: string, customerId: string, userId: string, input: NoteInput): Promise<NoteItem> {
    await customerService.requireLive(customerId, companyId);
    const type = input.type ?? "Note";
    if (type !== "Visit" && (input.colleagues ?? []).some((value) => value.trim())) {
      throw APIError.invalidArgument("Colleagues: only a visit names colleagues");
    }
    const author = await userEmailOf(userId);
    const values: Omit<NewCustomerNoteRecord, "companyId"> = {
      customerId,
      type,
      content: input.content,
      author,
      colleagues: await colleaguesOf(input.colleagues ?? [], author),
    };
    const row = await customerNoteRepository.createForCompany(companyId, values);
    return toNoteItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerNoteRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Note not found");
  }
}

/** The colleagues to store: users of the company by e-mail, in the order picked, without repeats or the author. */
async function colleaguesOf(picked: string[], author: string): Promise<string[]> {
  const wanted = picked.map((value) => value.trim()).filter(Boolean);
  if (wanted.length === 0) return [];
  const users = await companyUsers();
  const emails = wanted.map((value) => requireUserEmail(value, "Colleagues", users));
  return [...new Set(emails)].filter((email) => email !== author);
}

export const noteService = new NoteService();
