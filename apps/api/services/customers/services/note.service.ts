import { customerNoteRepository } from "../repositories/customerNote.repository";

interface NoteInput {
  type?: string;
  content: string;
  author?: string;
}

class NoteService {
  async listByCustomer(customerId: string) {
    return customerNoteRepository.findByCustomer(customerId);
  }

  async create(customerId: string, input: NoteInput) {
    return customerNoteRepository.create({
      customerId,
      type: input.type ?? "Note",
      content: input.content,
      author: input.author ?? "",
    } as never);
  }

  async softDelete(id: string) {
    return customerNoteRepository.softDelete(id);
  }
}

export const noteService = new NoteService();
