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
