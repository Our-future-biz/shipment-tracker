import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { noteService } from "../services/note.service";

interface NoteDeleteRequest {
  id: string;
}

interface NoteDeleteResponse {
  ok: boolean;
}

export const noteDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-notes/:id" },
  async (req: NoteDeleteRequest): Promise<NoteDeleteResponse> => {
    await noteService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
