import { api } from "encore.dev/api";
import { invoicingService } from "../services/invoicing.service";
import type { BillingSettingsItem, BillingOverrideItem } from "../interfaces/interfaces";

interface UpsertBillingSettingsRequest {
  shipmentId: string;
  billingCurrency?: string;
  roe?: string;
  quoteRef?: string;
}

interface UpsertBillingSettingsResponse {
  billingSettings: BillingSettingsItem;
}

export const invoicingUpsertBillingSettings = api(
  { expose: true, auth: false, method: "POST", path: "/invoicing/:shipmentId/billing" },
  async (req: UpsertBillingSettingsRequest): Promise<UpsertBillingSettingsResponse> => {
    const { shipmentId, ...data } = req;
    const billingSettings = await invoicingService.upsertBillingSettings(shipmentId, data);
    return { billingSettings: billingSettings as unknown as BillingSettingsItem };
  },
);

interface UpsertBillingOverrideRequest {
  shipmentId: string;
  rowKey: string;
  billingAmount: string;
}

interface UpsertBillingOverrideResponse {
  override: BillingOverrideItem;
}

export const invoicingUpsertBillingOverride = api(
  { expose: true, auth: false, method: "POST", path: "/invoicing/:shipmentId/billing/overrides" },
  async (req: UpsertBillingOverrideRequest): Promise<UpsertBillingOverrideResponse> => {
    const override = await invoicingService.upsertBillingOverride(req.shipmentId, req.rowKey, req.billingAmount);
    return { override: override as unknown as BillingOverrideItem };
  },
);
