import { authHandler } from "encore.dev/auth";
import { Header, Gateway, APIError } from "encore.dev/api";
import { authService } from "../services/auth/services/auth.service";

interface AuthParams {
  authorization: Header<"Authorization">;
}

export interface AuthData {
  userID: string;
  companyID: string;
  role: string;
}

export const auth = authHandler(async (params: AuthParams): Promise<AuthData> => {
  const header = params.authorization;
  if (!header) {
    throw APIError.unauthenticated("Missing authorization header");
  }
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  // Checks the user too (still live, same token version), and takes role and company from them.
  const { userId, companyId, role } = await authService.authenticate(token);
  return { userID: userId, companyID: companyId, role };
});

// Activate the auth handler so endpoints marked `auth: true` are authenticated.
export const gateway = new Gateway({ authHandler: auth });
