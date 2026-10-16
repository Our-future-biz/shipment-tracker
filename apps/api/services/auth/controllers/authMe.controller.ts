import { api, APIError, Header } from "encore.dev/api";
import { authService } from "../services/auth.service";
import type { SessionUser } from "../services/auth.service";

// auth:false with the token verified here (the same check the gateway does): the web passes
// the header explicitly, so moving to auth:true would change the generated client call.
interface AuthMeRequest {
  authorization: Header<"Authorization">;
}

interface AuthMeResponse {
  user: SessionUser;
}

export const authMe = api(
  { expose: true, auth: false, method: "GET", path: "/auth/me" },
  async (req: AuthMeRequest): Promise<AuthMeResponse> => {
    const header = req.authorization;
    if (!header) throw APIError.unauthenticated("No authorization header");
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;
    return { user: await authService.me(token) };
  },
);
