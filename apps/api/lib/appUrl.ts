// Where the web app lives (APP_URL): links in e-mails and on printed documents (the haulier's
// order link, the portal's set-password link) are built on it. Encore Cloud provides no plain
// environment variables, so a missing or unusable APP_URL must never stop a service: local
// development and tests fall back to http://localhost:3001, every other environment to the
// production web app (CLOUD_APP_URL) — a link then points at production, never at localhost.
// The service that builds links calls appUrlProblem() at start-up and logs the reason. Pure: no
// Encore runtime here, so unit tests can import what uses it.

export const LOCAL_APP_URL = "http://localhost:3001";
/** The production web app; used outside local development when APP_URL is missing or unusable. */
export const CLOUD_APP_URL = "https://shipment-tracker-web.vercel.app";

/** The parts of Encore's environment meta (appMeta().environment) the check reads. */
export interface AppEnvironment {
  type: string;
  cloud: string;
}

const isLocal = (env: AppEnvironment | null) => !env || env.cloud === "local" || env.type === "test";

/** Why APP_URL can't be used as given in this environment; null when it is fine. */
export function appUrlProblem(value: string | undefined, env: AppEnvironment | null): string | null {
  const url = (value ?? "").trim().replace(/\/+$/, "");
  if (!url) return isLocal(env) ? null : "APP_URL is not set";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `APP_URL "${url}" is not a URL`;
  }
  if (!isLocal(env) && parsed.protocol !== "https:") return `APP_URL must be an https:// address outside local development (it is "${url}")`;
  return null;
}

/** APP_URL as used (no trailing slash); never throws — falls back as described above. */
export function resolveAppUrl(value: string | undefined, env: AppEnvironment | null): string {
  const url = (value ?? "").trim().replace(/\/+$/, "");
  if (!appUrlProblem(value, env) && url) return url;
  return isLocal(env) ? LOCAL_APP_URL : CLOUD_APP_URL;
}

let environment: AppEnvironment | null = null;

/** Called once by the service at start-up with appMeta().environment. */
export function configureAppEnvironment(env: AppEnvironment): void {
  environment = env;
}

/** The web app's address now. */
export const appUrl = (): string => resolveAppUrl(process.env.APP_URL, environment);
