import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { noteService } from "../services/note.service";
import type { NoteItem } from "../interfaces/interfaces";

interface NoteListRequest {
  customerId: string;
}

interface NoteListResponse {
  data: NoteItem[];
}

export const noteList = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:customerId/notes" },
  async (req: NoteListRequest): Promise<NoteListResponse> => {
    const data = await noteService.listByCustomer(req.customerId, getAuthData()!.companyID);
    return { data: data as unknown as NoteItem[] };
  },
);
