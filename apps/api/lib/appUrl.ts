// Where the web app lives (APP_URL): links in e-mails and on printed documents (the haulier's
// order link, the portal's set-password link) are built on it. Local development and tests fall
// back to http://localhost:3001; every other environment must set it - a service that builds such
// links checks it when it starts (resolveAppUrl in its encore.service.ts) and refuses to start
// without it, so a production link can never point at localhost. Pure: no Encore runtime here, so
// unit tests can import what uses it.

export const LOCAL_APP_URL = "http://localhost:3001";

/** The parts of Encore's environment meta (appMeta().environment) the check reads. */
export interface AppEnvironment {
  type: string;
  cloud: string;
}

/** APP_URL as used (no trailing slash); throws when it is missing or not a URL outside local development and tests. */
export function resolveAppUrl(value: string | undefined, env: AppEnvironment | null): string {
  const local = !env || env.cloud === "local" || env.type === "test";
  const url = (value ?? "").trim().replace(/\/+$/, "");
  if (!url) {
    if (local) return LOCAL_APP_URL;
    throw new Error("APP_URL is not set: set it to the web app's address (for example https://shipment-tracker-web.vercel.app) for this environment");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`APP_URL "${url}" is not a URL`);
  }
  if (!local && parsed.protocol !== "https:") throw new Error(`APP_URL must be an https:// address outside local development (it is "${url}")`);
  return url;
}

/** The web app's address now (the start-up check made sure it is set where it must be). */
export const appUrl = (): string => resolveAppUrl(process.env.APP_URL, null);
