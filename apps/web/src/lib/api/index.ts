import Client from "./client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export const api = new Client(API_BASE);

// Re-export types from the generated client for convenience
export type { default as Client } from "./client";
export * from "./client";
