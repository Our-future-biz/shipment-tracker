// In-memory stand-in for the haulier portal's repository (users, sessions, one-time links), with
// the guards of its conditional UPDATEs applied as the database would apply them. Every value
// handed to it is remembered as JSON, to prove what was never stored.

import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { PortalSessionRecord, PortalTokenRecord, PortalUserRecord } from "../schemas/portal.schema";

export const portalStore = {
  users: [] as PortalUserRecord[],
  sessions: [] as PortalSessionRecord[],
  tokens: [] as PortalTokenRecord[],
  written: [] as string[],
};

export function resetPortalStore() {
  portalStore.users = [];
  portalStore.sessions = [];
  portalStore.tokens = [];
  portalStore.written = [];
}

const remember = (v: unknown) => portalStore.written.push(JSON.stringify(v));
const copy = <T>(row: T): T => structuredClone(row);
const liveUser = (companyId: string, id: string) => portalStore.users.find((u) => u.companyId === companyId && u.id === id && !u.deletedAt);

export const portalRepository = {
  insertUser: vi.fn(async (_tx: unknown, values: Partial<PortalUserRecord>) => {
    remember(values);
    if (portalStore.users.some((u) => u.companyId === values.companyId && u.email === values.email && !u.deletedAt)) throw Object.assign(new Error("unique"), { code: "23505" });
    const row = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      phone: "",
      passwordHash: null,
      status: "ACTIVE",
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      version: 1,
      ...values,
    } as PortalUserRecord;
    portalStore.users.push(row);
    return copy(row);
  }),
  findUser: vi.fn(async (companyId: string, id: string) => copy(liveUser(companyId, id) ?? null)),
  usersOf: vi.fn(async (companyId: string, haulierId: string) => portalStore.users.filter((u) => u.companyId === companyId && u.haulierCustomerId === haulierId && !u.deletedAt).map(copy)),
  userByEmail: vi.fn(async (companyId: string, email: string) => copy(portalStore.users.find((u) => u.companyId === companyId && u.email === email && !u.deletedAt) ?? null)),
  usersByEmail: vi.fn(async (email: string) => portalStore.users.filter((u) => u.email === email && !u.deletedAt).map(copy)),
  updateUser: vi.fn(async (_tx: unknown, companyId: string, id: string, values: Partial<PortalUserRecord>, version?: number) => {
    remember(values);
    const row = liveUser(companyId, id);
    if (!row || (version !== undefined && row.version !== version)) return null;
    Object.assign(row, values, { version: row.version + 1, updatedAt: new Date() });
    return copy(row);
  }),
  failLogin: vi.fn(async (companyId: string, id: string, max: number, lockUntil: Date) => {
    const row = liveUser(companyId, id);
    if (!row) return null;
    const next = row.failedAttempts + 1;
    if (next >= max) Object.assign(row, { failedAttempts: 0, lockedUntil: lockUntil });
    else row.failedAttempts = next;
    return copy(row);
  }),
  insertSession: vi.fn(async (_tx: unknown, values: Partial<PortalSessionRecord>) => {
    remember(values);
    const row = { id: randomUUID(), revokedAt: null, ip: "", userAgent: "", ...values } as PortalSessionRecord;
    portalStore.sessions.push(row);
    return copy(row);
  }),
  sessionByHash: vi.fn(async (hash: string) => copy(portalStore.sessions.find((s) => s.tokenHash === hash) ?? null)),
  touchSession: vi.fn(async (id: string, lastSeenAt: Date, expiresAt: Date) => {
    const row = portalStore.sessions.find((s) => s.id === id && !s.revokedAt);
    if (row) Object.assign(row, { lastSeenAt, expiresAt });
  }),
  revokeSession: vi.fn(async (_tx: unknown, id: string) => {
    const row = portalStore.sessions.find((s) => s.id === id && !s.revokedAt);
    if (row) row.revokedAt = new Date();
  }),
  revokeSessionsOf: vi.fn(async (_tx: unknown, companyId: string, userIds: string[]) => {
    for (const s of portalStore.sessions.filter((x) => x.companyId === companyId && userIds.includes(x.userId) && !x.revokedAt)) s.revokedAt = new Date();
  }),
  revokeSessionsOfHaulier: vi.fn(async (companyId: string, haulierId: string) => {
    const ids = portalStore.users.filter((u) => u.companyId === companyId && u.haulierCustomerId === haulierId).map((u) => u.id);
    for (const s of portalStore.sessions.filter((x) => x.companyId === companyId && ids.includes(x.userId) && !x.revokedAt)) s.revokedAt = new Date();
  }),
  newToken: vi.fn(async (_tx: unknown, values: Omit<PortalTokenRecord, "id" | "usedAt" | "createdAt">) => {
    remember(values);
    for (const t of portalStore.tokens.filter((x) => x.userId === values.userId && !x.usedAt)) t.usedAt = new Date();
    const row = { id: randomUUID(), usedAt: null, createdAt: new Date(), ...values } as PortalTokenRecord;
    portalStore.tokens.push(row);
    return copy(row);
  }),
  closeTokens: vi.fn(async (_tx: unknown, _companyId: string, userId: string) => {
    for (const t of portalStore.tokens.filter((x) => x.userId === userId && !x.usedAt)) t.usedAt = new Date();
  }),
  tokenByHash: vi.fn(async (hash: string) => copy(portalStore.tokens.find((t) => t.tokenHash === hash) ?? null)),
  useToken: vi.fn(async (_tx: unknown, id: string, now: Date) => {
    const row = portalStore.tokens.find((t) => t.id === id && !t.usedAt && t.expiresAt.getTime() > now.getTime());
    if (!row) return false;
    row.usedAt = now;
    return true;
  }),
};
