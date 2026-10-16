import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { authService } from "../services/auth.service";

interface ServiceUserResponse {
  userId: string;
}

// Internal only: the caller's company's service identity ("Trucking (system)"), created on first
// use. System and haulier actions written to other services are sent as this user (see
// lib/outbox/serviceIdentity). It can never sign in and is not listed among the users.
export const _internalServiceUser = api(
  { expose: false, auth: true, method: "POST", path: "/auth/internal/service-user" },
  async (): Promise<ServiceUserResponse> => {
    return { userId: await authService.serviceUser(getAuthData()!.companyID) };
  },
);
