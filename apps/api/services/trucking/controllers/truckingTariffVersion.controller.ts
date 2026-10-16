import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { tariffService } from "../services/tariff.service";
import type { TariffVersionDetail, TariffVersionInput } from "../interfaces/interfaces";

interface TruckingTariffVersionResponse {
  version: TariffVersionDetail;
}

interface TruckingTariffVersionCreateRequest {
  /** The tariff */
  id: string;
  input: TariffVersionInput;
}

// Saves a new DRAFT version of a MATRIX tariff (manager), with its validation findings. Errors do
// not stop a draft from being saved; they stop its activation.
export const truckingTariffVersionCreate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/tariffs/:id/versions" },
  async ({ id, input }: TruckingTariffVersionCreateRequest): Promise<TruckingTariffVersionResponse> => {
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { version: await tariffService.createVersion(companyID, userID, role, id, input) };
  },
);

interface TruckingTariffVersionGetRequest {
  id: string;
}

// One version with its whole input and findings.
export const truckingTariffVersionGet = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/tariff-versions/:id" },
  async ({ id }: TruckingTariffVersionGetRequest): Promise<TruckingTariffVersionResponse> => {
    return { version: await tariffService.getVersion(getAuthData()!.companyID, id) };
  },
);

interface TruckingTariffVersionActivateRequest {
  id: string;
  /** YYYY-MM-DD, today or later */
  validFrom: string;
}

// Activates a draft without errors from validFrom (manager). The version binding into that day
// ends the day before; versions scheduled from that day on are superseded.
export const truckingTariffVersionActivate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/tariff-versions/:id/activate" },
  async ({ id, validFrom }: TruckingTariffVersionActivateRequest): Promise<TruckingTariffVersionResponse> => {
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { version: await tariffService.activate(companyID, userID, role, id, validFrom) };
  },
);

interface TruckingTariffVersionDiscardResponse {
  ok: boolean;
}

// Throws a draft away (manager; soft delete).
export const truckingTariffVersionDiscard = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/tariff-versions/:id/discard" },
  async ({ id }: TruckingTariffVersionGetRequest): Promise<TruckingTariffVersionDiscardResponse> => {
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    await tariffService.discard(companyID, userID, role, id);
    return { ok: true };
  },
);
