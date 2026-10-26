import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { noteService } from "../services/note.service";
import type { NoteItem, NoteType } from "../interfaces/interfaces";

interface NoteCreateRequest {
  customerId: string;
  type?: NoteType;
  content: string & MinLen<1> & MaxLen<20000>;
}

interface NoteCreateResponse {
  note: NoteItem;
}

// The author is always the signed-in user (from the login, never from the request).
export const noteCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/notes" },
  async ({ customerId, ...input }: NoteCreateRequest): Promise<NoteCreateResponse> => {
    const auth = getAuthData()!;
    return { note: await noteService.create(auth.companyID, customerId, auth.userID, input) };
  },
);
