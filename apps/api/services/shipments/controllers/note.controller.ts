import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { noteService } from "../services/note.service";
import type { ShipmentNoteChangeInput, ShipmentNoteItem } from "../interfaces/interfaces";

// The shipment's notepad: the team's notes of what is still to do, each ticked off when done.

const auth = () => getAuthData()!;

interface ShipmentNoteCreateRequest {
  shipmentId: string;
  /** The title. */
  text: string;
  details?: string;
  /** YYYY-MM-DD; left out for no deadline. */
  dueDate?: string;
}
interface ShipmentNoteUpdateRequest extends ShipmentNoteChangeInput {
  shipmentId: string;
  noteId: string;
}

export const noteList = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/notes" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ notes: ShipmentNoteItem[] }> => ({
    notes: await noteService.list(shipmentId, auth().companyID),
  }),
);

export const noteCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/notes" },
  // The author is the signed-in user, never taken from the request.
  async ({ shipmentId, text, details, dueDate }: ShipmentNoteCreateRequest): Promise<{ note: ShipmentNoteItem }> => ({
    note: await noteService.create(shipmentId, auth().companyID, auth().userID, { text, details, dueDate }),
  }),
);

export const noteUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/shipments/:shipmentId/notes/:noteId" },
  async ({ shipmentId, noteId, ...input }: ShipmentNoteUpdateRequest): Promise<{ note: ShipmentNoteItem }> => ({
    note: await noteService.update(shipmentId, noteId, auth().companyID, auth().userID, input),
  }),
);

export const noteDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/notes/:noteId" },
  async ({ shipmentId, noteId }: { shipmentId: string; noteId: string }): Promise<{ ok: boolean }> => {
    await noteService.delete(shipmentId, noteId, auth().companyID);
    return { ok: true };
  },
);
