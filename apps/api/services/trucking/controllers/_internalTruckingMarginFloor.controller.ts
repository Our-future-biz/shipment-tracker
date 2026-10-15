import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { settingsService } from "../services/settings.service";
import type { MarginFloor } from "../interfaces/interfaces";

/**
 * Internal API for Sales: the margin floor of the company's Trucking settings (the defaults when
 * none were saved). A road quote below it needs a manager's approval before it is sent.
 */
export const _internalTruckingMarginFloor = api(
  { expose: false, auth: true, method: "GET", path: "/internal/trucking/margin-floor" },
  async (): Promise<MarginFloor> => {
    const { marginFloor } = await settingsService.get(getAuthData()!.companyID);
    return { percent: marginFloor.percent, minAmountCzk: marginFloor.minAmountCzk };
  },
);
