import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { permissionsService } from "../services/permissions.service";
import type { SalesPermissions } from "../interfaces/interfaces";

/**
 * What the signed-in user may do in Sales beyond a single quote: the screens show, hide and lock
 * their controls by these flags and hold no rule about roles themselves. The endpoints refuse by
 * the same policy, whatever a screen shows.
 */
export const salesPermissions = api(
  { expose: true, auth: true, method: "GET", path: "/sales/permissions" },
  async (): Promise<SalesPermissions> => {
    return permissionsService.get(getAuthData()!);
  },
);
