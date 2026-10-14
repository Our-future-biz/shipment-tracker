import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { invoicingService } from "../services/invoicing.service";
import type { BillingOverrideItem, BillingSettingsInput, BillingSettingsItem } from "../interfaces/interfaces";

interface UpsertBillingSettingsRequest extends BillingSettingsInput {
  shipmentId: string;
}

interface UpsertBillingSettingsResponse {
  billingSettings: BillingSettingsItem;
}

export const invoicingUpsertBillingSettings = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/billing" },
  async ({ shipmentId, ...input }: UpsertBillingSettingsRequest): Promise<UpsertBillingSettingsResponse> => {
    return { billingSettings: await invoicingService.upsertBillingSettings(shipmentId, getAuthData()!.companyID, input) };
  },
);

interface UpsertBillingOverrideRequest {
  shipmentId: string;
  rowKey: string & MinLen<1> & MaxLen<200>;
  /** decimal string; "" removes the override's amount */
  billingAmount: string;
}

interface UpsertBillingOverrideResponse {
  override: BillingOverrideItem;
}

// Overriding a billed amount changes what the customer is invoiced: managers and up only.
export const invoicingUpsertBillingOverride = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/billing/overrides" },
  async (req: UpsertBillingOverrideRequest): Promise<UpsertBillingOverrideResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { override: await invoicingService.upsertBillingOverride(req.shipmentId, actor.companyID, req.rowKey, req.billingAmount) };
  },
);
