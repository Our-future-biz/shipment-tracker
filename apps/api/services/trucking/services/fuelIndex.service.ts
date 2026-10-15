import { APIError } from "encore.dev/api";
import { fuelIndexRepository } from "../repositories/fuelIndex.repository";
import type { FuelIndexMonth } from "../interfaces/interfaces";
import { cleanFuelIndex } from "../lib/tariffRules";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";

class FuelIndexService {
  /** Every month set, newest first. */
  async list(companyId: string): Promise<FuelIndexMonth[]> {
    return (await fuelIndexRepository.list(companyId)).map((r) => ({ month: r.month, percent: r.percent }));
  }

  /** Manager only: sets (adds or overwrites) one month's %. */
  async set(companyId: string, userId: string, role: string, month: string, percent: number): Promise<FuelIndexMonth[]> {
    if (!isManager(role)) throw APIError.permissionDenied("Only a manager can set the fuel index");
    const next = cleanFuelIndex(month, percent);
    const before = (await this.list(companyId)).find((m) => m.month === next.month)?.percent ?? null;
    if (before === next.percent) return this.list(companyId);
    const by = await userName(userId);
    await fuelIndexRepository.set(companyId, next.month, next.percent, by, {
      kind: "fuel_index_set",
      customerId: null,
      byUserId: userId || null,
      byName: by,
      payload: { changes: { [next.month]: { before, after: next.percent } } },
    });
    return this.list(companyId);
  }
}

export const fuelIndexService = new FuelIndexService();
