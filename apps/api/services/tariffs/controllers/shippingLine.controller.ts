import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { oceanTariffService, type ShippingLineDetail, type ShippingLineItem } from "../services/oceanTariff.service";

interface ShippingLineListResponse {
  /** Customer Database companies with the Shipping line role, by name */
  lines: ShippingLineItem[];
}

// The shipping lines with their tariffs at a glance (Tariffs → Shipping Lines).
export const shippingLineList = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/lines" },
  async (): Promise<ShippingLineListResponse> => {
    return { lines: await oceanTariffService.lines(getAuthData()!.companyID) };
  },
);

interface ShippingLineGetRequest {
  /** The line's Customer Database id */
  customerId: string;
}

// One shipping line with its tariffs and their versions, newest first.
export const shippingLineGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/lines/:customerId" },
  async ({ customerId }: ShippingLineGetRequest): Promise<ShippingLineDetail> => {
    return oceanTariffService.line(getAuthData()!.companyID, customerId);
  },
);
