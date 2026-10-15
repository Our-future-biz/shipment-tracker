import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { authService } from "../services/auth.service";
import type { AuthUserInfo } from "../services/auth.service";

interface AuthLoginRequest {
  email: string & MinLen<1> & MaxLen<320>;
  password: string & MinLen<1> & MaxLen<1000>;
}

interface AuthLoginResponse {
  token: string;
  user: AuthUserInfo;
}

export const authLogin = api(
  { expose: true, auth: false, method: "POST", path: "/auth/login" },
  async (req: AuthLoginRequest): Promise<AuthLoginResponse> => {
    return authService.login(req.email, req.password);
  },
);
