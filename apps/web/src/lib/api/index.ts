import Client, { ErrCode, isAPIError } from "./client";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

/**
 * A file link the browser opens itself (<a href>, <img src>): the API returns `contentUrl` as a
 * relative path carrying a short-lived signed token, so no auth header is needed. `download`
 * asks for it as a download instead of inline.
 */
export const apiFileUrl = (contentUrl: string, download = false): string =>
  `${API_BASE}${contentUrl}${download ? `${contentUrl.includes("?") ? "&" : "?"}download=1` : ""}`;

// Attach the logged-in user's bearer token so authenticated endpoints can
// derive the actor (e.g. who deleted a shipment) server-side.
const authFetcher: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
};

export const api = new Client(API_BASE, { fetcher: authFetcher });

// The client of the public pages (the haulier's transport-order link): it sends no session, so a
// signed-in user's token never travels with a request a link opened, and the endpoints answer the
// same for everyone (`auth: false` endpoints are plain methods of the generated client).
export const publicApi = new Client(API_BASE);

// The same client, except that its requests outlive the page (fetch keepalive), so a save on its
// way when the tab closes still arrives. Browsers take such a request only with a small body -
// 64 KiB for all of a page's together - and refuse a bigger one outright.
export const keepaliveApi = api.with({ requestInit: { keepalive: true } });
const KEEPALIVE_MAX_BYTES = 60 * 1024;

/** The client for a write of `body`: the keepalive one when the body fits its limit, else the ordinary one. */
export const clientForBody = (body: unknown): Client =>
  // Measured in bytes, as the browser counts: a Czech letter takes two.
  new Blob([JSON.stringify(body)]).size <= KEEPALIVE_MAX_BYTES ? keepaliveApi : api;

// Why a request was refused, in the API's own sentence ("quote QCZ... not found") - or that the
// server could not be reached, when there is none: no connection, or a reply that did not come
// from the API, for which the client reports the code "unknown" and a text not worth showing.
export function apiErrorMessage(err: unknown): string {
  return isAPIError(err) && err.code !== ErrCode.Unknown && err.message ? err.message : "the server could not be reached";
}

// The server's word that what was asked for does not exist: an answer, where any other failure
// says nothing about it.
export function isNotFound(err: unknown): boolean {
  return isAPIError(err) && err.code === ErrCode.NotFound;
}

// Re-export types from the generated client for convenience
export type { default as Client } from "./client";
export * from "./client";
