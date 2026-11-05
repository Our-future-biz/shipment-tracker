import { api, APIError, Header } from "encore.dev/api";
import { authService } from "../services/auth.service";
import type { SessionUser, WorkingCompany } from "../services/auth.service";

// auth:false with the token verified here (the same check the gateway does): the web passes
// the header explicitly, so moving to auth:true would change the generated client call.
interface AuthMeRequest {
  authorization: Header<"Authorization">;
  /** A superadmin's company switcher: the company chosen to work as. */
  actingCompany?: Header<"X-Acting-Company">;
}

interface AuthMeResponse {
  user: SessionUser;
  /**
   * The company the session works as: the user's own, or for a superadmin the one chosen in the
   * header. A choice that is no company (deleted since) answers the user's own, so the web drops it.
   */
  company: WorkingCompany;
}

export const authMe = api(
  { expose: true, auth: false, method: "GET", path: "/auth/me" },
  async (req: AuthMeRequest): Promise<AuthMeResponse> => {
    const header = req.authorization;
    if (!header) throw APIError.unauthenticated("No authorization header");
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;
    const user = await authService.me(token);
    return { user, company: await authService.workingCompany(user, req.actingCompany) };
  },
);
