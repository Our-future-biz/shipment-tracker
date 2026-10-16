import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { getAuthData } from "~encore/auth";
import { auth } from "~encore/clients";
import type { AppModule } from "../services/auth/interfaces/interfaces";

// Per-company module hiding (company.hidden_modules, set by a superadmin). A hidden module's
// endpoints refuse the company's users; superadmins always get through. Internal calls, crons,
// the outbox and subscriptions are not guarded - only what a user reaches.
//
// A company's hidden modules are asked of the auth service once and kept for CACHE_MS in each
// process, so a change made by a superadmin reaches the other services within a minute (at once in
// the process that made it, see forgetHiddenModules). When auth cannot be asked, the last answer
// is used if there is one.

export type { AppModule };

export const MODULE_HIDDEN = "This module is not enabled for your company";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; hidden: AppModule[] }>();

/** The modules the company hides (cached for a minute). */
export async function hiddenModulesOf(companyId: string): Promise<AppModule[]> {
  const kept = cache.get(companyId);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.hidden;
  try {
    const { hiddenModules } = await auth._internalCompanyModules({ companyId });
    cache.set(companyId, { at: Date.now(), hidden: hiddenModules });
    return hiddenModules;
  } catch (err) {
    if (kept) {
      log.warn("modules: auth did not answer, using the last known hidden modules", { companyId, error: String(err) });
      return kept.hidden;
    }
    throw err;
  }
}

/** Whether the module is hidden for the company (not counting superadmins). */
export async function moduleHidden(companyId: string, module: AppModule): Promise<boolean> {
  return (await hiddenModulesOf(companyId)).includes(module);
}

/** Drops the cached answer for a company (its modules were just changed in this process). */
export function forgetHiddenModules(companyId: string): void {
  cache.delete(companyId);
}

/** Refuses the signed-in user when the module is hidden for their company; superadmins always pass. */
export async function requireModule(module: AppModule): Promise<void> {
  const authData = getAuthData();
  if (!authData) throw APIError.unauthenticated("Not authenticated");
  if (authData.role === "superadmin") return;
  if (await moduleHidden(authData.companyID, module)) throw APIError.permissionDenied(MODULE_HIDDEN);
}
