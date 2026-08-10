import { api, APIError, Header } from "encore.dev/api";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

// NOTE: kept auth:false with manual JWT verification (not gateway auth:true) so the
// generated web client's request shape stays unchanged. Security is equivalent — the
// token is cryptographically verified here. Migrate to auth:true + getAuthData() when
// the Encore client is regenerated.
interface AuthMeRequest {
  authorization: Header<"Authorization">;
}

interface AuthMeResponse {
  user: AuthUserInfo;
}

export const authMe = api(
  { expose: true, auth: false, method: "GET", path: "/auth/me" },
  async (req: AuthMeRequest): Promise<AuthMeResponse> => {
    const header = req.authorization;
    if (!header) {
      throw APIError.unauthenticated("No authorization header");
    }
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;
    const { userId } = await authService.verifyToken(token);
    const user = await authService.getUserById(userId);
    if (!user) {
      throw APIError.unauthenticated("User not found");
    }
    return { user };
  },
);
