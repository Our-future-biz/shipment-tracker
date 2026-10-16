import { APIError } from "encore.dev/api";
import { settingsRepository } from "../repositories/settings.repository";
import type { WarehouseSettingsRecord } from "../schemas/warehouseSettings.schema";
import type { WarehouseSettingsItem } from "../interfaces/settings.interfaces";
import { emailConfigured } from "../../../lib/email";
import { isManager, userName } from "./users";
import { InputError, inputMessage } from "./inputError";
import {
  DEFAULT_DOCKS,
  DEFAULT_SUPPLIER_EMAIL,
  cleanDocks,
  cleanRecipients,
  readDocks,
  readSupplierEmail,
  settingsChanges,
  SUPPLIER_KINDS,
  type DockSettings,
  type SupplierEmailSettings,
} from "./settingsRules";

/** What a settings save may change; parts left out stay as stored. */
export interface WarehouseSettingsPatch {
  supplierEmail?: Partial<Record<(typeof SUPPLIER_KINDS)[number], unknown>>;
  docks?: unknown;
}

export interface EffectiveSettings {
  supplierEmail: SupplierEmailSettings;
  docks: DockSettings;
  version: number;
  row: WarehouseSettingsRecord | null;
}

const MAX_EVENTS_SHOWN = 50;

class SettingsService {
  /** The company's settings, or the defaults when none are saved yet. Read by the e-mail and the dock KPIs. */
  async effective(companyId: string): Promise<EffectiveSettings> {
    const row = await settingsRepository.find(companyId);
    return {
      supplierEmail: row ? readSupplierEmail(row.supplierEmail) : DEFAULT_SUPPLIER_EMAIL,
      docks: row ? readDocks(row.docks) : DEFAULT_DOCKS,
      version: row?.version ?? 0,
      row,
    };
  }

  async get(companyId: string, role: string): Promise<WarehouseSettingsItem> {
    return this.item(await this.effective(companyId), role);
  }

  // Manager only (the controller checks the role too). Refused when someone saved since the
  // client read the settings (`expectedVersion`), with the addresses or times that are wrong.
  async update(companyId: string, userId: string, role: string, expectedVersion: number, patch: WarehouseSettingsPatch): Promise<WarehouseSettingsItem> {
    if (!isManager(role)) throw APIError.permissionDenied("Only a manager can change the warehouse settings");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw APIError.invalidArgument("expectedVersion must be the version you read (0 when none is saved yet)");
    const cur = await this.effective(companyId);
    if (cur.version !== expectedVersion) throw APIError.aborted("Someone else changed the warehouse settings meanwhile — reload and make your change again");
    const next = { supplierEmail: { ...cur.supplierEmail }, docks: cur.docks };
    try {
      if (patch.supplierEmail !== undefined) {
        if (!patch.supplierEmail || typeof patch.supplierEmail !== "object" || Array.isArray(patch.supplierEmail)) throw new InputError("Supplier e-mail settings are not valid");
        for (const k of Object.keys(patch.supplierEmail)) {
          if (!(SUPPLIER_KINDS as readonly string[]).includes(k)) throw new InputError(`Unknown message type "${k}" — use ${SUPPLIER_KINDS.join(", ")}`);
        }
        for (const k of SUPPLIER_KINDS) {
          if (patch.supplierEmail[k] !== undefined) next.supplierEmail[k] = cleanRecipients(patch.supplierEmail[k], k);
        }
      }
      if (patch.docks !== undefined) next.docks = cleanDocks(patch.docks);
    } catch (err) {
      throw APIError.invalidArgument(inputMessage(err, "The settings are not valid"));
    }
    const changes = settingsChanges(cur, next);
    if (!changes.length) return this.item(cur, role);
    const by = await userName(userId);
    const at = new Date().toISOString();
    const saved = await settingsRepository.save(
      companyId,
      expectedVersion,
      next,
      by,
      changes.map((label) => ({ at, by, label })),
    );
    if (!saved) throw APIError.aborted("Someone else changed the warehouse settings meanwhile — reload and make your change again");
    return this.item({ supplierEmail: readSupplierEmail(saved.supplierEmail), docks: readDocks(saved.docks), version: saved.version, row: saved }, role);
  }

  private item(s: EffectiveSettings, role: string): WarehouseSettingsItem {
    const events = Array.isArray(s.row?.events) ? s.row!.events : [];
    return {
      supplierEmail: s.supplierEmail,
      docks: s.docks,
      version: s.version,
      updatedAt: s.row ? s.row.updatedAt.toISOString() : null,
      updatedBy: s.row?.updatedBy ?? "",
      // Newest save first; the lines of one save in the order they were written.
      events: events
        .map((e, i) => ({ e, i }))
        .sort((a, b) => (a.e.at === b.e.at ? a.i - b.i : a.e.at < b.e.at ? 1 : -1))
        .slice(0, MAX_EVENTS_SHOWN)
        .map((x) => x.e),
      canEdit: isManager(role),
      emailConfigured: emailConfigured(),
    };
  }
}

export const settingsService = new SettingsService();
