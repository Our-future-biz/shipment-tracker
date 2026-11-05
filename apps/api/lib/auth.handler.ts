import { authHandler } from "encore.dev/auth";
import { Header, Gateway, APIError } from "encore.dev/api";
import { authService } from "../services/auth/services/auth.service";

interface AuthParams {
  authorization: Header<"Authorization">;
  /** A superadmin's company switcher: the company to work as (its id). Ignored for anyone else. */
  actingCompany?: Header<"X-Acting-Company">;
}

export interface AuthData {
  userID: string;
  /** The company every endpoint reads and writes: the user's own, or the one a superadmin works as. */
  companyID: string;
  role: string;
  /** The user's own company, where a superadmin working as another company still belongs; unset on service calls. */
  homeCompanyID?: string;
}

export const auth = authHandler(async (params: AuthParams): Promise<AuthData> => {
  const header = params.authorization;
  if (!header) {
    throw APIError.unauthenticated("Missing authorization header");
  }
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  // Checks the user too (still live, same token version), and takes role and company from them.
  const { userId, companyId, role } = await authService.authenticate(token);
  // Superadmins see and change every company: one chosen in the header is the company of the request.
  const acting = await authService.actingCompany(role, companyId, params.actingCompany);
  return { userID: userId, companyID: acting ?? companyId, role, homeCompanyID: companyId };
});

// Activate the auth handler so endpoints marked `auth: true` are authenticated.
export const gateway = new Gateway({ authHandler: auth });
