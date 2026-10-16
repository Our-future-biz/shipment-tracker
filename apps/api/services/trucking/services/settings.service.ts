import { APIError } from "encore.dev/api";
import { settingsRepository } from "../repositories/settings.repository";
import type { TruckingSettingsRecord } from "../schemas/truckingSettings.schema";
import type { TruckingSettings, TruckingSettingsInput } from "../interfaces/interfaces";
import { cleanSettings, readSettings, settingsChanges } from "../lib/settingsRules";
import { requireManager } from "../lib/roles";
import { userName } from "../lib/users";

export const SETTINGS_CONFLICT = "Settings were changed by someone else. Reload and try again.";

const toSettings = (row: TruckingSettingsRecord | null): TruckingSettings => ({
  ...readSettings(row),
  version: row?.version ?? 0,
  updatedAt: row ? row.updatedAt.toISOString() : null,
  updatedBy: row ? row.updatedBy || null : null,
});

class SettingsService {
  /** The company's trucking settings, or the defaults (version 0) when none are saved yet. */
  async get(companyId: string): Promise<TruckingSettings> {
    return toSettings(await settingsRepository.find(companyId));
  }

  /** Codes of the company's vehicle types (what a haulier profile may list). */
  async vehicleCodes(companyId: string): Promise<string[]> {
    return (await this.get(companyId)).vehicleTypes.map((v) => v.code);
  }

  // Manager only (the controller checks the role too). The whole settings are sent; refused when
  // someone saved since the client read them (`version`). A save without the hub or the free
  // waiting time keeps the saved one.
  async update(
    companyId: string,
    userId: string,
    role: string,
    input: Omit<TruckingSettingsInput, "hub" | "waitingFreeTime"> & { hub?: TruckingSettingsInput["hub"]; waitingFreeTime?: TruckingSettingsInput["waitingFreeTime"] },
    version: number,
  ): Promise<TruckingSettings> {
    requireManager(role, "change the trucking settings");
    if (!Number.isInteger(version) || version < 0) throw APIError.invalidArgument("version must be the version you read (0 when none is saved yet)");
    const row = await settingsRepository.find(companyId);
    const stored = readSettings(row);
    const next = cleanSettings({ ...input, hub: input.hub ?? stored.hub, waitingFreeTime: input.waitingFreeTime ?? stored.waitingFreeTime });
    const cur = toSettings(row);
    if (cur.version !== version) throw APIError.aborted(SETTINGS_CONFLICT);
    const changes = settingsChanges(readSettings(row), next);
    if (!Object.keys(changes).length) return cur;
    const by = await userName(userId);
    const saved = await settingsRepository.save(companyId, version, next, by, {
      kind: "settings_updated",
      customerId: null,
      byUserId: userId || null,
      byName: by,
      payload: { changes },
    });
    if (!saved) throw APIError.aborted(SETTINGS_CONFLICT);
    return toSettings(saved);
  }
}

export const settingsService = new SettingsService();
