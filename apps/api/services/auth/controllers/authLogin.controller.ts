import { api, type Header } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { clientIp, TRUSTED_PROXY_HOPS } from "../../../lib/loginRules";
import { authService } from "../services/auth.service";
import type { SessionUser } from "../services/auth.service";

interface AuthLoginRequest {
  email: string & MinLen<1> & MaxLen<320>;
  password: string & MinLen<1> & MaxLen<1000>;
  forwardedFor?: Header<"X-Forwarded-For">;
}

interface AuthLoginResponse {
  token: string;
  user: SessionUser;
}

export const authLogin = api(
  { expose: true, auth: false, method: "POST", path: "/auth/login", sensitive: true },
  async (req: AuthLoginRequest): Promise<AuthLoginResponse> => {
    // The client IP feeds the failed-login throttle (per IP and per e-mail).
    const { ip, trusted } = clientIp(req.forwardedFor, TRUSTED_PROXY_HOPS);
    return authService.login(req.email, req.password, { ip, ipTrusted: trusted });
  },
);
