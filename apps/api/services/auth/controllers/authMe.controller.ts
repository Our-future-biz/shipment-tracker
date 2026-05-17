import { api, APIError, Header } from "encore.dev/api";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

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
