import { APIError } from "encore.dev/api";
import { addDays, businessDay, isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import type { Actor } from "../../../lib/rbac";
import type { AbsenceInForce, UserAbsenceItem } from "../interfaces/interfaces";
import {
  ABSENCE_DAYS_BAD,
  ABSENCE_ENDED_LOOKBACK_DAYS,
  ABSENCE_LIST_LIMIT,
  ABSENCE_NOT_FOUND,
  ABSENCE_NOTE_TOO_LONG,
  ABSENT_NOT_USER,
  MAX_ABSENCE_NOTE,
  NOT_YOUR_ABSENCE,
  absenceDaysRefusal,
  coverRefusal,
  listSinceDefault,
  mayChangeAbsenceOf,
  overlapOf,
  overlapRefusal,
} from "../lib/absenceRules";
import { userAbsenceRepository, type UserAbsencePatch } from "../repositories/userAbsence.repository";
import { userRepository } from "../repositories/user.repository";
import type { UserAbsenceRecord } from "../schemas/userAbsence.schema";

/** A new absence as the request sends it. */
export interface AbsenceInput {
  /** Who is away; left out: the caller. */
  userId?: string;
  fromDate: string;
  toDate: string;
  coverUserId?: string | null;
  note?: string;
}

/** A change of an absence; left out leaves a value, a null cover clears it. */
export interface AbsencePatchInput {
  fromDate?: string;
  toDate?: string;
  coverUserId?: string | null;
  note?: string;
}

type Person = { id: string; email: string; displayName: string };

const noteOf = (note: string | undefined) => {
  const text = (note ?? "").trim();
  if (text.length > MAX_ABSENCE_NOTE) throw APIError.invalidArgument(ABSENCE_NOTE_TOO_LONG);
  return text;
};

// Users' absences (Council Outlay 11, D12; lib/absenceRules). Every user of the company sees them
// all - colleagues must see who is away; a user records and changes their own, a manager, an admin
// or a superadmin anybody's of the company. Shipments reads the ones in force for the Holiday Cover
// it sets on the absent user's jobs (inForce) and for Shipments → Managers.
class AbsenceService {
  /** The company's live absences ending on `since` (default: 30 days ago) or later, the earliest first. */
  async list(actor: Actor, opts: { since?: string; userId?: string } = {}): Promise<UserAbsenceItem[]> {
    const since = opts.since?.trim() || listSinceDefault(businessDay(new Date()));
    if (!isRealYmd(since)) throw APIError.invalidArgument("since must be a day, written as YYYY-MM-DD");
    if (opts.userId && !isUuid(opts.userId)) return [];
    const [rows, people] = await Promise.all([userAbsenceRepository.listForCompany(actor.companyID, since, ABSENCE_LIST_LIMIT, opts.userId), this.#people(actor.companyID)]);
    // An absence of somebody who left is nobody's business any more.
    return rows.filter((r) => people.has(r.userId)).map((r) => this.#item(r, people, actor));
  }

  async create(actor: Actor, input: AbsenceInput): Promise<UserAbsenceItem> {
    const userId = (input.userId ?? "").trim() || actor.userID;
    if (!mayChangeAbsenceOf(actor, userId)) throw APIError.permissionDenied(NOT_YOUR_ABSENCE);
    const absent = await this.#person(actor.companyID, userId);
    if (!absent) throw APIError.invalidArgument(ABSENT_NOT_USER);
    const fromDate = (input.fromDate ?? "").trim();
    const toDate = (input.toDate ?? "").trim();
    const days = absenceDaysRefusal(fromDate, toDate);
    if (days) throw APIError.invalidArgument(days);
    const coverUserId = await this.#cover(actor.companyID, absent.id, input.coverUserId ?? null);
    const note = noteOf(input.note);
    const created = await userAbsenceRepository.lockedForUser(actor.companyID, absent.id, async (tx) => {
      const other = overlapOf(await userAbsenceRepository.spansOfUser(tx, actor.companyID, absent.id), fromDate, toDate);
      if (other) throw APIError.failedPrecondition(overlapRefusal(absent.displayName || absent.email, other));
      return userAbsenceRepository.create(tx, { companyId: actor.companyID, userId: absent.id, fromDate, toDate, coverUserId, note, createdBy: actor.userID, updatedBy: actor.userID });
    });
    return this.#item(created, await this.#people(actor.companyID), actor);
  }

  async update(actor: Actor, id: string, patch: AbsencePatchInput): Promise<UserAbsenceItem> {
    const existing = isUuid(id) ? await userAbsenceRepository.getLive(id, actor.companyID) : null;
    if (!existing) throw APIError.notFound(ABSENCE_NOT_FOUND);
    if (!mayChangeAbsenceOf(actor, existing.userId)) throw APIError.permissionDenied(NOT_YOUR_ABSENCE);
    const absent = await this.#person(actor.companyID, existing.userId);
    if (!absent) throw APIError.invalidArgument(ABSENT_NOT_USER);
    const fromDate = patch.fromDate !== undefined ? patch.fromDate.trim() : existing.fromDate;
    const toDate = patch.toDate !== undefined ? patch.toDate.trim() : existing.toDate;
    const days = absenceDaysRefusal(fromDate, toDate);
    if (days) throw APIError.invalidArgument(days);
    const changes: UserAbsencePatch = { updatedBy: actor.userID, fromDate, toDate };
    // A cover left as it was is not checked again: one who left meanwhile is shown as nobody, not refused.
    if (patch.coverUserId !== undefined && (patch.coverUserId ?? "") !== (existing.coverUserId ?? "")) {
      changes.coverUserId = await this.#cover(actor.companyID, absent.id, patch.coverUserId);
    }
    if (patch.note !== undefined) changes.note = noteOf(patch.note);
    const updated = await userAbsenceRepository.lockedForUser(actor.companyID, absent.id, async (tx) => {
      const other = overlapOf(await userAbsenceRepository.spansOfUser(tx, actor.companyID, absent.id), fromDate, toDate, existing.id);
      if (other) throw APIError.failedPrecondition(overlapRefusal(absent.displayName || absent.email, other));
      return userAbsenceRepository.update(tx, existing.id, actor.companyID, changes);
    });
    if (!updated) throw APIError.notFound(ABSENCE_NOT_FOUND);
    return this.#item(updated, await this.#people(actor.companyID), actor);
  }

  /** Soft: Shipments still clears the Holiday Covers it set for the absence. */
  async remove(actor: Actor, id: string): Promise<void> {
    const existing = isUuid(id) ? await userAbsenceRepository.getLive(id, actor.companyID) : null;
    if (!existing) throw APIError.notFound(ABSENCE_NOT_FOUND);
    if (!mayChangeAbsenceOf(actor, existing.userId)) throw APIError.permissionDenied(NOT_YOUR_ABSENCE);
    if (!(await userAbsenceRepository.softDelete(existing.id, actor.companyID, actor.userID))) throw APIError.notFound(ABSENCE_NOT_FOUND);
  }

  /**
   * Of every company: the live absences of live users covering `day`, and those that ended within
   * ABSENCE_ENDED_LOOKBACK_DAYS before it (inForce false). For Shipments' cover job only.
   */
  async inForce(day: string): Promise<AbsenceInForce[]> {
    if (!isRealYmd(day)) throw APIError.invalidArgument(ABSENCE_DAYS_BAD);
    const rows = await userAbsenceRepository.inForce(day, addDays(day, -ABSENCE_ENDED_LOOKBACK_DAYS));
    return rows.map((r) => ({
      ...r,
      inForce: r.fromDate <= day && r.toDate >= day,
      // A cover is named as the user it is now: one who left covers nothing.
      coverUserId: r.coverEmail ? r.coverUserId : null,
    }));
  }

  // The cover named, checked: another live person of the company; null for nobody.
  async #cover(companyId: string, absentUserId: string, coverUserId: string | null): Promise<string | null> {
    const id = (coverUserId ?? "").trim();
    if (!id) return null;
    const cover = isUuid(id) ? await this.#person(companyId, id) : null;
    const refusal = coverRefusal(absentUserId, cover?.id ?? id, !!cover);
    if (refusal) throw APIError.invalidArgument(refusal);
    return cover!.id;
  }

  // A live person (never the service identity) of the company.
  async #person(companyId: string, id: string): Promise<Person | null> {
    if (!isUuid(id)) return null;
    const row = await userRepository.getByIdInCompany(id, companyId);
    return row ? { id: row.id, email: row.email, displayName: row.displayName } : null;
  }

  async #people(companyId: string): Promise<Map<string, Person>> {
    const rows = await userRepository.listByCompany(companyId);
    return new Map(rows.map((u) => [u.id, { id: u.id, email: u.email, displayName: u.displayName }]));
  }

  #item(r: UserAbsenceRecord, people: ReadonlyMap<string, Person>, actor: Actor): UserAbsenceItem {
    const user = people.get(r.userId);
    // A note may say why (sick leave, a doctor): it is the absent person's and the managers' to read -
    // the same people who may change the absence - and "" for everybody else.
    const mine = mayChangeAbsenceOf(actor, r.userId);
    const cover = r.coverUserId ? people.get(r.coverUserId) : undefined;
    return {
      id: r.id,
      userId: r.userId,
      userName: user?.displayName || user?.email || "",
      userEmail: user?.email ?? "",
      fromDate: r.fromDate,
      toDate: r.toDate,
      coverUserId: r.coverUserId,
      coverName: cover ? cover.displayName || cover.email : null,
      coverEmail: cover?.email ?? null,
      note: mine ? r.note : "",
      createdBy: r.createdBy,
      updatedBy: r.updatedBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      mayChange: mine,
    };
  }
}

export const absenceService = new AbsenceService();
