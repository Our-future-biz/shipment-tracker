import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { noteService } from "../services/note.service";
import type { NoteItem, NoteType } from "../interfaces/interfaces";

interface NoteCreateRequest {
  customerId: string;
  type?: NoteType;
  content: string & MinLen<1> & MaxLen<20000>;
  author?: string & MaxLen<200>;
}

interface NoteCreateResponse {
  note: NoteItem;
}

export const noteCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/notes" },
  async ({ customerId, ...input }: NoteCreateRequest): Promise<NoteCreateResponse> => {
    return { note: await noteService.create(getAuthData()!.companyID, customerId, input) };
  },
);
