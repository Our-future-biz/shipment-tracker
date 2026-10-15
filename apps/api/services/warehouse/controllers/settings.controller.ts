import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { settingsService } from "../services/settings.service";
import type { DockSettingsItem, SupplierRecipientsItem, WarehouseSettingsItem } from "../interfaces/settings.interfaces";

// Warehouse settings: who gets the supplier e-mails (VGM, Survey, Remeasurement) and the docks
// with their opening hours. Everyone signed in may read them; only a manager changes them.

export const warehouseSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-settings" },
  async (): Promise<{ settings: WarehouseSettingsItem }> => {
    const { companyID, role } = getAuthData()!;
    return { settings: await settingsService.get(companyID, role) };
  },
);

interface WarehouseSettingsUpdateRequest {
  /** The version read (0 when none is saved yet); a save on top of a newer one is refused. */
  expectedVersion: number;
  /** Message types to change; the ones left out stay as stored. */
  supplierEmail?: {
    vgm?: SupplierRecipientsItem;
    survey?: SupplierRecipientsItem;
    remeasurement?: SupplierRecipientsItem;
  };
  docks?: DockSettingsItem;
}

// Saves the settings (manager only). Addresses are checked, trimmed, lower-cased and
// de-duplicated; each change is logged ("Supplier e-mail VGM: To a@x → a@x, b@y").
export const warehouseSettingsUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-settings" },
  async ({ expectedVersion, supplierEmail, docks }: WarehouseSettingsUpdateRequest): Promise<{ settings: WarehouseSettingsItem }> => {
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { settings: await settingsService.update(companyID, userID, role, expectedVersion, { supplierEmail, docks }) };
  },
);
