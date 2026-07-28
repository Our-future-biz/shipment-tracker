import Client from "./client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

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

// Re-export types from the generated client for convenience
export type { default as Client } from "./client";
export * from "./client";
