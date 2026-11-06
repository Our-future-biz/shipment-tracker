import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { NoteType } from "../interfaces/interfaces";
import { noteService } from "../services/note.service";

interface NoteFromShipmentRequest {
  customerId: string;
  type: NoteType;
  content: string & MinLen<1> & MaxLen<20000>;
}

/**
 * Internal API of the shipments service: a line in the customer's Communication log when the
 * customer was told something about a shipment, as the user who told them.
 */
export const _internalNoteFromShipment = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/:customerId/notes" },
  async ({ customerId, type, content }: NoteFromShipmentRequest): Promise<void> => {
    const auth = getAuthData()!;
    await noteService.create(auth.companyID, customerId, auth.userID, { type, content });
  },
);
