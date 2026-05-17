import { api, APIError } from "encore.dev/api";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

interface AuthLoginRequest {
  email: string;
  password: string;
}

interface AuthLoginResponse {
  token: string;
  user: AuthUserInfo;
}

export const authLogin = api(
  { expose: true, auth: false, method: "POST", path: "/auth/login" },
  async (req: AuthLoginRequest): Promise<AuthLoginResponse> => {
    if (!req.email || !req.password) {
      throw APIError.invalidArgument("Email and password are required");
    }
    return authService.login(req.email, req.password);
  },
);
