import { APIError } from "encore.dev/api";
import { shipmentNoteRepository, type NoteChange } from "../repositories/shipmentNote.repository";
import type { ShipmentNoteRecord } from "../schemas/shipmentNote.schema";
import { iso } from "../../../lib/db/serialize";
import { userEmails } from "../lib/userEmails";
import type { ShipmentNoteChangeInput, ShipmentNoteItem } from "../interfaces/interfaces";
import { shipmentService } from "./shipment.service";
import { isRealYmd } from "../../../lib/businessDate";

/** The longest title: one line. */
export const NOTE_MAX_LENGTH = 300;
/** The longest details: a few lines, not a document. */
export const DETAILS_MAX_LENGTH = 2000;

/** A to-do's title as stored: trimmed, and never empty or longer than NOTE_MAX_LENGTH. */
export function noteText(text: string | undefined): string {
  const clean = (text ?? "").trim();
  if (!clean) throw APIError.invalidArgument("Write a title for the to-do");
  if (clean.length > NOTE_MAX_LENGTH) throw APIError.invalidArgument(`A title can hold up to ${NOTE_MAX_LENGTH} characters`);
  return clean;
}

/** A to-do's details as stored: trimmed, "" for none. */
export function noteDetails(details: string | undefined): string {
  const clean = (details ?? "").trim();
  if (clean.length > DETAILS_MAX_LENGTH) throw APIError.invalidArgument(`The details can hold up to ${DETAILS_MAX_LENGTH} characters`);
  return clean;
}

/** A deadline as stored: a real day, or null for none. */
export function noteDueDate(dueDate: string | undefined): string | null {
  const clean = (dueDate ?? "").trim();
  if (!clean) return null;
  if (!isRealYmd(clean)) throw APIError.invalidArgument("The deadline must be a day as YYYY-MM-DD");
  return clean;
}

/** What a new to-do holds besides its title. */
export interface NewNote {
  text: string;
  details?: string;
  dueDate?: string;
}

const item = (r: ShipmentNoteRecord, emails: Map<string, string>): ShipmentNoteItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  text: r.text,
  details: r.details,
  dueDate: r.dueDate,
  authorName: r.authorId ? emails.get(r.authorId) ?? "" : "",
  createdAt: iso(r.createdAt),
  done: r.doneAt !== null,
  doneAt: r.doneAt ? iso(r.doneAt) : null,
  doneByName: r.doneById ? emails.get(r.doneById) ?? "" : "",
  pinned: r.pinned,
  pinnedAt: r.pinnedAt ? iso(r.pinnedAt) : null,
});

// The shipment's notepad. Anyone of the company may write, tick off, change or delete a note: it is
// the team's shared to-do list for the shipment, not a field of its details.
class NoteService {
  async list(shipmentId: string, companyId: string): Promise<ShipmentNoteItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    const [rows, emails] = await Promise.all([shipmentNoteRepository.listByShipmentId(shipmentId, companyId), userEmails()]);
    return rows.map((r) => item(r, emails));
  }

  async create(shipmentId: string, companyId: string, userId: string, input: NewNote): Promise<ShipmentNoteItem> {
    const values = { text: noteText(input.text), details: noteDetails(input.details), dueDate: noteDueDate(input.dueDate) };
    await shipmentService.requireLive(shipmentId, companyId);
    const row = await shipmentNoteRepository.createForCompany(companyId, { shipmentId, ...values, authorId: userId });
    return item(row, await userEmails());
  }

  async update(shipmentId: string, id: string, companyId: string, userId: string, input: ShipmentNoteChangeInput): Promise<ShipmentNoteItem> {
    const change: NoteChange = {};
    if (input.text !== undefined) change.text = noteText(input.text);
    if (input.details !== undefined) change.details = noteDetails(input.details);
    if (input.dueDate !== undefined) change.dueDate = noteDueDate(input.dueDate);
    if (input.done !== undefined) {
      change.doneAt = input.done ? new Date() : null;
      change.doneById = input.done ? userId : null;
    }
    if (input.pinned !== undefined) {
      change.pinned = input.pinned;
      // The latest starred goes to the very top.
      change.pinnedAt = input.pinned ? new Date() : null;
    }
    const row = await shipmentNoteRepository.updateNote(id, shipmentId, companyId, change);
    if (!row) throw APIError.notFound("Note not found");
    return item(row, await userEmails());
  }

  async delete(shipmentId: string, id: string, companyId: string): Promise<void> {
    if (!(await shipmentNoteRepository.deleteNote(id, shipmentId, companyId))) throw APIError.notFound("Note not found");
  }
}

export const noteService = new NoteService();
