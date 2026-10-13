import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { canEditSalesSettings, canManageSales } from "../../../lib/salesPolicy";
import type { SalesPermissions } from "../interfaces/interfaces";

class PermissionsService {
  // What the signed-in user may do in Sales, as the flags the screens show and hide by. The
  // answers are the policy's (salesPolicy) - the ones the endpoints themselves refuse by.
  get(actor: Actor): SalesPermissions {
    const settings = canEditSalesSettings(actor.role);
    return { canManageSales: canManageSales(actor.role), canEditTerms: settings, canEditCompanyDetails: settings };
  }

  // Refuses whoever may not change the settings all of Sales shares: the Terms & Conditions
  // templates and the company details on quotations. Reading them is not asked about here - it
  // stays open to everybody, since documents print them.
  requireSettingsEditor(actor: Actor): void {
    if (!canEditSalesSettings(actor.role)) {
      throw APIError.permissionDenied("only managers and admins can change this");
    }
  }
}

export const permissionsService = new PermissionsService();
