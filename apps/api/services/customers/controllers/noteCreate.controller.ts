import { api, APIError } from "encore.dev/api";
import { noteService } from "../services/note.service";
import type { NoteItem } from "../interfaces/interfaces";

interface NoteCreateRequest {
  customerId: string;
  type?: string;
  content: string;
  author?: string;
}

interface NoteCreateResponse {
  note: NoteItem;
}

export const noteCreate = api(
  { expose: true, auth: false, method: "POST", path: "/customers/:customerId/notes" },
  async (req: NoteCreateRequest): Promise<NoteCreateResponse> => {
    if (!req.content) {
      throw APIError.invalidArgument("content is required");
    }
    const { customerId, ...input } = req;
    const note = await noteService.create(customerId, input);
    return { note: note as unknown as NoteItem };
  },
);
