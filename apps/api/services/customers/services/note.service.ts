import { customerNoteRepository } from "../repositories/customerNote.repository";

interface NoteInput {
  type?: string;
  content: string;
  author?: string;
}

class NoteService {
  async listByCustomer(customerId: string, companyId: string) {
    return customerNoteRepository.findByCustomer(customerId, companyId);
  }

  async create(companyId: string, customerId: string, input: NoteInput) {
    return customerNoteRepository.createForCompany(companyId, {
      customerId,
      type: input.type ?? "Note",
      content: input.content,
      author: input.author ?? "",
    } as never);
  }

  async softDelete(id: string, companyId: string) {
    return customerNoteRepository.softDeleteForCompany(id, companyId);
  }
}

export const noteService = new NoteService();
