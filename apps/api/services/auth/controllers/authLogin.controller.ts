import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { authService } from "../services/auth.service";
import type { SessionUser } from "../services/auth.service";

interface AuthLoginRequest {
  email: string & MinLen<1> & MaxLen<320>;
  password: string & MinLen<1> & MaxLen<1000>;
}

interface AuthLoginResponse {
  token: string;
  user: SessionUser;
}

export const authLogin = api(
  { expose: true, auth: false, method: "POST", path: "/auth/login", sensitive: true },
  async (req: AuthLoginRequest): Promise<AuthLoginResponse> => {
    return authService.login(req.email, req.password);
  },
);
