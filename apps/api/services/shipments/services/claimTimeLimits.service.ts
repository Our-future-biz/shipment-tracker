import { APIError } from "encore.dev/api";
import { isoOrNull } from "../../../lib/db/serialize";
import { userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import type { ClaimMode, ClaimModeLimits, ClaimModesLimits, ClaimTimeLimitsSettings } from "../interfaces/interfaces";
import { GENERAL_PRACTICE, TIME_LIMITS_OFF, savedLimits, type ClaimTimeLimits } from "../lib/claimTimeLimits";
import { claimTimeLimitsRepository } from "../repositories/claimTimeLimits.repository";
import type { ClaimTimeLimitsRecord } from "../schemas/claimTimeLimits.schema";

// The company's claim time limits (Council Outlay 11, D21): read by the Claims tab and Shipments →
// Managers, kept by a manager (the controller lets only managers in). Switched off by default -
// general practice, not confirmed with the insurer; switching them on stamps who confirmed the
// numbers and when (lib/claimTimeLimits).

/** The numbers of a row, by mode. */
export function limitsOfRow(row: ClaimTimeLimitsRecord): ClaimModesLimits {
  return {
    sea: { noticeDays: row.seaNoticeDays, suitMonths: row.seaSuitMonths },
    air: { noticeDays: row.airNoticeDays, suitMonths: row.airSuitMonths },
    rail: { noticeDays: row.railNoticeDays, suitMonths: row.railSuitMonths },
    road: { noticeDays: row.roadNoticeDays, suitMonths: row.roadSuitMonths },
  };
}

/** The settings as the page shows them: a company that never saved any has the general practice, off. */
export function settingsOfRow(row: ClaimTimeLimitsRecord | null): ClaimTimeLimitsSettings {
  if (!row) {
    return { enabled: false, limits: GENERAL_PRACTICE, generalPractice: GENERAL_PRACTICE, saved: false, confirmedBy: "", confirmedAt: null, updatedBy: "", updatedAt: null };
  }
  return {
    enabled: row.enabled,
    limits: limitsOfRow(row),
    generalPractice: GENERAL_PRACTICE,
    saved: true,
    confirmedBy: row.confirmedBy,
    confirmedAt: isoOrNull(row.confirmedAt),
    updatedBy: row.updatedBy,
    updatedAt: isoOrNull(row.updatedAt),
  };
}

/** The limits as the rules read them: off unless the company switched them on. */
export const timeLimitsOfRow = (row: ClaimTimeLimitsRecord | null): ClaimTimeLimits => (row?.enabled ? { enabled: true, limits: limitsOfRow(row) } : TIME_LIMITS_OFF);

export interface ClaimTimeLimitsSave {
  enabled: boolean;
  sea?: ClaimModeLimits;
  air?: ClaimModeLimits;
  rail?: ClaimModeLimits;
  road?: ClaimModeLimits;
}

class ClaimTimeLimitsService {
  /** The company's limits as the rules read them (the Claims tab, Shipments → Managers). */
  async of(companyId: string): Promise<ClaimTimeLimits> {
    return timeLimitsOfRow(await claimTimeLimitsRepository.of(companyId));
  }

  async settings(companyId: string): Promise<ClaimTimeLimitsSettings> {
    return settingsOfRow(await claimTimeLimitsRepository.of(companyId));
  }

  /**
   * Saves the company's limits. Switched on, the four modes' numbers come in the same save - that is
   * the manager confirming them - and who and when are stamped; switched off, the stamps are cleared
   * and a mode not sent keeps its numbers. Who saves is stamped by e-mail: when that can't be read
   * nothing is saved (a confirmation by nobody is no confirmation).
   */
  async save(actor: Actor, input: ClaimTimeLimitsSave): Promise<ClaimTimeLimitsSettings> {
    const row = await claimTimeLimitsRepository.of(actor.companyID);
    const sent: Partial<Record<ClaimMode, ClaimModeLimits>> = { sea: input.sea, air: input.air, rail: input.rail, road: input.road };
    const result = savedLimits(input.enabled, sent, row ? limitsOfRow(row) : GENERAL_PRACTICE);
    if ("problem" in result) throw APIError.invalidArgument(result.problem);
    const by = await userEmailOf(actor.userID);
    const { sea, air, rail, road } = result.limits;
    const saved = await claimTimeLimitsRepository.save(actor.companyID, {
      enabled: input.enabled,
      seaNoticeDays: sea.noticeDays,
      airNoticeDays: air.noticeDays,
      railNoticeDays: rail.noticeDays,
      roadNoticeDays: road.noticeDays,
      seaSuitMonths: sea.suitMonths,
      airSuitMonths: air.suitMonths,
      railSuitMonths: rail.suitMonths,
      roadSuitMonths: road.suitMonths,
      ...(input.enabled ? { confirmedByUserId: actor.userID, confirmedBy: by, confirmedAt: new Date() } : { confirmedByUserId: null, confirmedBy: "", confirmedAt: null }),
      updatedByUserId: actor.userID,
      updatedBy: by,
    });
    return settingsOfRow(saved);
  }
}

export const claimTimeLimitsService = new ClaimTimeLimitsService();
