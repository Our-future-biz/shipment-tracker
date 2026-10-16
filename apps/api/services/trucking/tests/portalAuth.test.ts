import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The haulier portal's own identities run for real against an in-memory repository (portalFakes):
// portal users managed by a manager, one-time links, the login with its throttle, and the
// session every portal endpoint checks. argon2 is real.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  auth: { _internalCompanyName: vi.fn(async () => ({ name: "Registered Name s.r.o." })) },
  customers: { _internalHaulierList: vi.fn(async () => ({ hauliers: [{ id: "00000000-0000-0000-0000-0000000000a1", companyName: "Bravo Trans" }] })) },
}));
vi.mock("../db/db", async () => (await import("./truckingFakes")).dbModule);
vi.mock("../../../lib/outbox/serviceIdentity", async () => (await import("./truckingFakes")).serviceIdentityModule);
vi.mock("../repositories/portal.repository", async () => ({ portalRepository: (await import("./portalFakes")).portalRepository }));
vi.mock("../repositories/event.repository", async () => (await import("./truckingFakes")).eventModule);
const hauliers = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: hauliers }));
vi.mock("../services/haulier.service", () => ({ haulierService: { get: vi.fn(async () => ({ companyName: "Bravo Trans" })) } }));
vi.mock("../services/transportOrder.service", () => ({ ourCompany: vi.fn(async () => ({ name: "SSL Forwarding s.r.o." })) }));
import { ourCompany } from "../services/transportOrder.service";
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { auth, customers } from "~encore/clients";
import { portalAuthService } from "../services/portalAuth.service";
import { portalUserService } from "../services/portalUser.service";
import { haulierService } from "../services/haulier.service";
import { hashToken } from "../lib/haulierToken";
import { clientIp, HAULIER_BLOCKED, LOG_IN_AGAIN, LOGIN_FAILED, SET_PASSWORD_LINK_INVALID, TOO_MANY_ATTEMPTS } from "../lib/portalRules";
import { portalStore, resetPortalStore } from "./portalFakes";
import { COMPANY, HAULIER, HAULIER2, SERVICE_USER, eventsOf, manager, resetStore, store, user } from "./truckingFakes";

const CLIENT = { ip: "10.0.0.1", userAgent: "Phone" };
const PASSWORD = "correct horse battery";
const tokenOf = (link: string) => link.split("/").pop()!;

/** A portal user of Bravo with the password set, and their invitation token. */
async function active(email = "eva@bravo.cz") {
  const created = await portalUserService.create(manager, HAULIER, { email, name: "Eva Malá", phone: "+420 777 1" });
  await portalAuthService.setPassword({ token: tokenOf(created.inviteLink), password: PASSWORD });
  return created;
}

const login = (email = "eva@bravo.cz", password = PASSWORD) => portalAuthService.login({ email, password }, CLIENT);

beforeEach(() => {
  resetStore();
  resetPortalStore();
  vi.clearAllMocks();
  hauliers.find.mockResolvedValue({ profile: { blocked: false }, lanes: [] });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("portal users (app side)", () => {
  it("only a manager adds, resets, disables or enables a portal user; any user lists them", async () => {
    const created = await portalUserService.create(manager, HAULIER, { email: "eva@bravo.cz", name: "Eva", phone: "" });
    const denied = { code: "permission_denied" };
    await expect(portalUserService.create(user, HAULIER, { email: "x@bravo.cz", name: "Xena", phone: "" })).rejects.toMatchObject(denied);
    await expect(portalUserService.reset(user, created.user.id)).rejects.toMatchObject(denied);
    await expect(portalUserService.disable(user, created.user.id, "left the company")).rejects.toMatchObject(denied);
    await expect(portalUserService.enable(user, created.user.id)).rejects.toMatchObject(denied);
    expect(await portalUserService.list(user, HAULIER)).toHaveLength(1);
  });

  it("adds a user with a lower-cased e-mail and a one-time link shown once; only the link's hash is stored", async () => {
    const created = await portalUserService.create(manager, HAULIER, { email: "  Eva@Bravo.CZ ", name: "Eva Malá", phone: "+420 777 1" });
    expect(created.user).toMatchObject({ email: "eva@bravo.cz", status: "INVITED", haulierCustomerId: HAULIER, lastLoginAt: null });
    expect(created.inviteLink).toMatch(/\/haulier\/portal\/set-password\/[A-Za-z0-9_-]{43}$/);
    expect(created.expiresAt).toBe("2026-10-18T10:00:00.000Z");
    const token = tokenOf(created.inviteLink);
    expect(portalStore.tokens[0]).toMatchObject({ kind: "INVITE", tokenHash: hashToken(token) });
    expect(JSON.stringify([portalStore.written, store.written])).not.toContain(token);
    expect(eventsOf("portal_user_created")[0]).toMatchObject({ customerId: HAULIER, byName: "Jana Nováková" });
    await expect(portalUserService.create(manager, HAULIER, { email: "eva@bravo.cz", name: "Eva 2", phone: "" })).rejects.toMatchObject({ code: "already_exists" });
    await expect(portalUserService.create(manager, HAULIER, { email: "not an e-mail", name: "Eva", phone: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(haulierService.get).toHaveBeenCalledWith(COMPANY, HAULIER);
  });

  it("never answers with the password hash or anything of a link", async () => {
    const created = await active();
    const listed = JSON.stringify(await portalUserService.list(user, HAULIER));
    const hash = portalStore.users[0]!.passwordHash!;
    expect(hash).toMatch(/^\$argon2id\$/);
    for (const out of [listed, JSON.stringify(created.user)]) {
      expect(out).not.toContain(hash);
      expect(out).not.toContain("passwordHash");
      expect(out).not.toContain(portalStore.tokens[0]!.tokenHash);
    }
  });
});

describe("set the password through the one-time link", () => {
  it("sets it once: the link is used, a second use and an unknown or malformed link get the same 404", async () => {
    const created = await portalUserService.create(manager, HAULIER, { email: "eva@bravo.cz", name: "Eva", phone: "" });
    const token = tokenOf(created.inviteLink);
    await portalAuthService.setPassword({ token, password: PASSWORD });
    expect(portalStore.users[0]!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(portalStore.users[0]!.passwordHash).not.toContain(PASSWORD);
    expect((await portalUserService.list(user, HAULIER))[0]!.status).toBe("ACTIVE");
    const invalid = { code: "not_found", message: SET_PASSWORD_LINK_INVALID };
    await expect(portalAuthService.setPassword({ token, password: PASSWORD })).rejects.toMatchObject(invalid);
    await expect(portalAuthService.setPassword({ token: "A".repeat(43), password: PASSWORD })).rejects.toMatchObject(invalid);
    await expect(portalAuthService.setPassword({ token: "short", password: PASSWORD })).rejects.toMatchObject(invalid);
    expect(eventsOf("portal_password_set")).toHaveLength(1);
  });

  it("refuses an expired link (72 hours) and a link of a disabled user", async () => {
    const created = await portalUserService.create(manager, HAULIER, { email: "eva@bravo.cz", name: "Eva", phone: "" });
    vi.setSystemTime(new Date("2026-10-18T10:00:01Z"));
    await expect(portalAuthService.setPassword({ token: tokenOf(created.inviteLink), password: PASSWORD })).rejects.toMatchObject({ code: "not_found" });
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
    const other = await portalUserService.create(manager, HAULIER, { email: "jan@bravo.cz", name: "Jan", phone: "" });
    portalStore.users.find((u) => u.id === other.user.id)!.status = "DISABLED";
    await expect(portalAuthService.setPassword({ token: tokenOf(other.inviteLink), password: PASSWORD })).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps the password rules: 12 characters at least, not the e-mail; a refused password leaves the link usable", async () => {
    const created = await portalUserService.create(manager, HAULIER, { email: "eva.mala@bravo.cz", name: "Eva", phone: "" });
    const token = tokenOf(created.inviteLink);
    await expect(portalAuthService.setPassword({ token, password: "short1" })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("12") });
    await expect(portalAuthService.setPassword({ token, password: "Eva.Mala@Bravo.cz" })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("e-mail") });
    await expect(portalAuthService.setPassword({ token, password: "x".repeat(201) })).rejects.toMatchObject({ code: "invalid_argument" });
    await portalAuthService.setPassword({ token, password: PASSWORD });
  });

  it("a reset ends the user's sessions at once, the old password stops working and the older link is closed", async () => {
    await active();
    const { session } = await login();
    await portalAuthService.authenticate(session);
    const userId = portalStore.users[0]!.id;
    const first = await portalUserService.reset(manager, userId);
    expect(first.resetLink).toContain("/haulier/portal/set-password/");
    await expect(portalAuthService.authenticate(session)).rejects.toMatchObject({ code: "unauthenticated", message: LOG_IN_AGAIN });
    await expect(login()).rejects.toMatchObject({ code: "unauthenticated", message: LOGIN_FAILED });
    const second = await portalUserService.reset(manager, userId);
    await expect(portalAuthService.setPassword({ token: tokenOf(first.resetLink), password: "a whole new password" })).rejects.toMatchObject({ code: "not_found" });
    await portalAuthService.setPassword({ token: tokenOf(second.resetLink), password: "a whole new password" });
    await login("eva@bravo.cz", "a whole new password");
    expect(portalStore.tokens.filter((t) => t.kind === "RESET").every((t) => t.tokenHash.length === 64)).toBe(true);
  });
});

describe("login", () => {
  it("shows our registered company name when no invoicing or quotation details are set", async () => {
    await active();
    vi.mocked(ourCompany).mockResolvedValueOnce({ name: "" } as never);
    const out = await login("eva@bravo.cz");
    expect(out.me.ourCompany).toBe("Registered Name s.r.o.");
    expect(auth._internalCompanyName).toHaveBeenCalledWith({ authData: { userID: SERVICE_USER, companyID: COMPANY, role: "user" } });
  });

  it("logs in: a session token of which only the hash is stored, a 12 hour expiry, the event", async () => {
    await active();
    const out = await login(" EVA@bravo.cz ");
    expect(out.session).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(out.expiresAt).toBe("2026-10-15T22:00:00.000Z");
    expect(out.me).toEqual({ userName: "Eva Malá", email: "eva@bravo.cz", haulierName: "Bravo Trans", ourCompany: "SSL Forwarding s.r.o." });
    expect(portalStore.sessions[0]).toMatchObject({ tokenHash: hashToken(out.session), ip: "10.0.0.1", userAgent: "Phone" });
    expect(portalStore.sessions[0]!.absoluteExpiresAt.toISOString()).toBe("2026-10-22T10:00:00.000Z");
    expect(JSON.stringify(portalStore.written)).not.toContain(out.session);
    expect(eventsOf("portal_login")[0]).toMatchObject({ customerId: HAULIER, byName: "Eva Malá (haulier)", byUserId: null });
    // The internal calls go as the manager who created the portal user, with the least role.
    expect(customers._internalHaulierList).toHaveBeenCalledWith({ ids: [HAULIER] }, { authData: { userID: SERVICE_USER, companyID: COMPANY, role: "user" } });
  });

  it("answers an unknown e-mail, a wrong password, a locked e-mail and a disabled user with the same words", async () => {
    await active();
    await active("jan@bravo.cz");
    portalStore.users.find((u) => u.email === "jan@bravo.cz")!.status = "DISABLED";
    const same = { code: "unauthenticated", message: LOGIN_FAILED };
    await expect(login("nobody@bravo.cz")).rejects.toMatchObject(same);
    await expect(login("eva@bravo.cz", "wrong password!")).rejects.toMatchObject(same);
    await expect(login("jan@bravo.cz")).rejects.toMatchObject(same);
    await expect(login("", "")).rejects.toMatchObject(same);
    for (let i = 0; i < 4; i += 1) await expect(login("eva@bravo.cz", "wrong password!")).rejects.toMatchObject(same);
    await expect(login()).rejects.toMatchObject(same);
    // No password was ever echoed into an event.
    expect(JSON.stringify(store.events)).not.toContain("wrong password!");
    expect(JSON.stringify(store.events)).not.toContain(PASSWORD);
  });

  it("spends the same argon2 work on an unknown e-mail as on a wrong password (no timing tell)", async () => {
    await active();
    const timed = async (email: string) => {
      const start = performance.now();
      await login(email, "wrong password!").catch(() => undefined);
      return performance.now() - start;
    };
    await timed("nobody@bravo.cz");
    const wrong = await timed("eva@bravo.cz");
    const unknown = await timed("nobody@bravo.cz");
    expect(unknown).toBeGreaterThan(wrong * 0.3);
  });

  it("locks the e-mail for 15 minutes after 5 wrong passwords (the right one too), then lets it in again", async () => {
    await active();
    for (let i = 0; i < 5; i += 1) await expect(login("eva@bravo.cz", "wrong password!")).rejects.toMatchObject({ message: LOGIN_FAILED });
    expect(portalStore.users[0]!.lockedUntil!.toISOString()).toBe("2026-10-15T10:15:00.000Z");
    expect(eventsOf("portal_login_failed").at(-1)).toMatchObject({ payload: expect.objectContaining({ facts: expect.objectContaining({ locked: true }) }) });
    expect((await portalUserService.list(user, HAULIER))[0]!.status).toBe("LOCKED");
    await expect(login()).rejects.toMatchObject({ message: LOGIN_FAILED });
    expect(portalStore.sessions).toHaveLength(0);
    vi.setSystemTime(new Date("2026-10-15T10:15:01Z"));
    await login();
    expect(portalStore.users[0]).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    expect(eventsOf("portal_login_failed")).toHaveLength(6);
  });

  it("refuses the login of a blocked haulier's user with a plain message", async () => {
    await active();
    hauliers.find.mockResolvedValue({ profile: { blocked: true }, lanes: [] });
    await expect(login()).rejects.toMatchObject({ code: "permission_denied", message: HAULIER_BLOCKED });
    expect(portalStore.sessions).toHaveLength(0);
  });
});

describe("login throttle per IP and per account (C20)", () => {
  const COMPANY_B = "00000000-0000-0000-0000-00000000000b";
  const managerB = { userID: "00000000-0000-0000-0000-0000000000b2", companyID: COMPANY_B, role: "manager" };
  const from = (ip: string, email = "eva@bravo.cz", password = PASSWORD) => portalAuthService.login({ email, password }, { ip, userAgent: "Phone" });

  /** The same e-mail as a portal user of another company, with its own password. */
  async function inCompanyB(password: string) {
    const created = await portalUserService.create(managerB, HAULIER, { email: "eva@bravo.cz", name: "Eva B", phone: "" });
    await portalAuthService.setPassword({ token: tokenOf(created.inviteLink), password });
    return portalStore.users.find((u) => u.companyId === COMPANY_B)!;
  }

  it("locks an IP after 20 failed logins in 15 minutes, whatever the e-mails; other IPs and later attempts get in", async () => {
    await active();
    for (let i = 0; i < 20; i += 1) await expect(from("203.0.113.9", `x${i}@spray.cz`, "guess guess guess")).rejects.toMatchObject({ message: LOGIN_FAILED });
    await expect(from("203.0.113.9")).rejects.toMatchObject({ code: "resource_exhausted", message: TOO_MANY_ATTEMPTS });
    expect(portalStore.sessions).toHaveLength(0);
    // The account itself was not touched, and another IP logs in.
    expect(portalStore.users[0]).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    await from("198.51.100.7");
    vi.setSystemTime(new Date("2026-10-15T10:15:01Z"));
    await from("203.0.113.9");
    // A second lock within a day lasts twice as long.
    for (let i = 0; i < 20; i += 1) await expect(from("203.0.113.9", `y${i}@spray.cz`, "guess guess guess")).rejects.toMatchObject({ message: LOGIN_FAILED });
    expect(portalStore.throttle[0]!.lockedUntil!.toISOString()).toBe("2026-10-15T10:45:01.000Z");
  });

  it("an account's lock grows with each lock in a row (15 min, 30 min, at most 1 hour)", async () => {
    await active();
    const lockAfterFive = async () => {
      for (let i = 0; i < 5; i += 1) await expect(from(`10.0.1.${i}`, "eva@bravo.cz", "wrong password!")).rejects.toMatchObject({ message: LOGIN_FAILED });
      return portalStore.users[0]!.lockedUntil!.toISOString();
    };
    expect(await lockAfterFive()).toBe("2026-10-15T10:15:00.000Z");
    vi.setSystemTime(new Date("2026-10-15T10:16:00Z"));
    expect(await lockAfterFive()).toBe("2026-10-15T10:46:00.000Z");
    vi.setSystemTime(new Date("2026-10-15T10:47:00Z"));
    expect(await lockAfterFive()).toBe("2026-10-15T11:47:00.000Z");
    vi.setSystemTime(new Date("2026-10-15T11:48:00Z"));
    expect(await lockAfterFive()).toBe("2026-10-15T12:48:00.000Z");
    // A login starts the progression again.
    vi.setSystemTime(new Date("2026-10-15T12:49:00Z"));
    await from("10.0.2.1");
    expect(portalStore.users[0]).toMatchObject({ failedAttempts: 0, lockLevel: 0 });
  });

  it("one e-mail in two companies: the account the password matches logs in, the other is not charged a failure", async () => {
    await active();
    const b = await inCompanyB("battery staple horse correct");
    const out = await from("10.0.0.1", "eva@bravo.cz", "battery staple horse correct");
    expect(portalStore.sessions.find((x) => x.tokenHash === hashToken(out.session))!.companyId).toBe(COMPANY_B);
    expect(portalStore.users.find((u) => u.companyId === COMPANY)!.failedAttempts).toBe(0);
    // A password matching neither counts on both accounts tried.
    await expect(from("10.0.0.1", "eva@bravo.cz", "wrong password!")).rejects.toMatchObject({ message: LOGIN_FAILED });
    expect(portalStore.users.map((u) => u.failedAttempts)).toEqual([1, 1]);
    expect(b.id).toBeTruthy();
  });

  it("a blocked haulier in one company does not stop the same e-mail's account in another", async () => {
    await active();
    await inCompanyB(PASSWORD);
    hauliers.find.mockImplementation(async (companyId: string) => ({ profile: { blocked: companyId === COMPANY }, lanes: [] }));
    const out = await from("10.0.0.1");
    expect(portalStore.sessions.find((x) => x.tokenHash === hashToken(out.session))!.companyId).toBe(COMPANY_B);
    hauliers.find.mockResolvedValue({ profile: { blocked: true }, lanes: [] });
    await expect(from("10.0.0.1")).rejects.toMatchObject({ code: "permission_denied", message: HAULIER_BLOCKED });
  });
});

describe("the client's IP for the throttle", () => {
  it("is the entry the last trusted proxy appended, never the client's own first entry", () => {
    expect(clientIp("6.6.6.6, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIp("6.6.6.6, 203.0.113.9, 10.0.0.2", 2)).toBe("203.0.113.9");
    expect(clientIp(undefined, 1)).toBe("");
    expect(clientIp("203.0.113.9", 2)).toBe("");
  });
});

describe("the session every portal endpoint checks", () => {
  it("answers a missing, malformed, unknown, expired or revoked session with the same 401", async () => {
    await active();
    const { session } = await login();
    const again = { code: "unauthenticated", message: LOG_IN_AGAIN };
    await expect(portalAuthService.authenticate(undefined)).rejects.toMatchObject(again);
    await expect(portalAuthService.authenticate("short")).rejects.toMatchObject(again);
    await expect(portalAuthService.authenticate("B".repeat(43))).rejects.toMatchObject(again);
    const caller = await portalAuthService.authenticate(session);
    expect(caller).toMatchObject({ companyId: COMPANY, haulierId: HAULIER, who: "Eva Malá (haulier)" });
    // Slides 12 hours from each request...
    vi.setSystemTime(new Date("2026-10-15T21:00:00Z"));
    await portalAuthService.authenticate(session);
    expect(portalStore.sessions[0]!.expiresAt.toISOString()).toBe("2026-10-16T09:00:00.000Z");
    // ...and ends 12 hours after the last one.
    vi.setSystemTime(new Date("2026-10-16T09:00:01Z"));
    await expect(portalAuthService.authenticate(session)).rejects.toMatchObject(again);
    // Logout revokes.
    const next = await login();
    await portalAuthService.logout(await portalAuthService.authenticate(next.session));
    await expect(portalAuthService.authenticate(next.session)).rejects.toMatchObject(again);
    expect(eventsOf("portal_logout")).toHaveLength(1);
  });

  it("never lives past 7 days after the login, however busy", async () => {
    await active();
    const { session } = await login();
    for (let h = 10; h <= 7 * 24; h += 10) {
      vi.setSystemTime(new Date(Date.parse("2026-10-15T10:00:00Z") + h * 3600_000));
      await portalAuthService.authenticate(session);
    }
    vi.setSystemTime(new Date("2026-10-22T10:00:01Z"));
    await expect(portalAuthService.authenticate(session)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("a disabled user is refused and their sessions end; enabling lets them log in again", async () => {
    await active();
    const { session } = await login();
    const id = portalStore.users[0]!.id;
    const disabled = await portalUserService.disable(manager, id, "left the company");
    expect(disabled.status).toBe("DISABLED");
    expect(portalStore.sessions[0]!.revokedAt).not.toBeNull();
    await expect(portalAuthService.authenticate(session)).rejects.toMatchObject({ code: "unauthenticated", message: LOG_IN_AGAIN });
    await expect(login()).rejects.toMatchObject({ message: LOGIN_FAILED });
    await expect(portalUserService.reset(manager, id)).rejects.toMatchObject({ code: "failed_precondition" });
    await portalUserService.enable(manager, id);
    await login();
    expect(eventsOf("portal_user_disabled")[0]).toMatchObject({ payload: expect.objectContaining({ reason: "left the company" }) });
  });

  it("a session of a user disabled behind its back is refused and ended at the next request", async () => {
    await active();
    const { session } = await login();
    portalStore.users[0]!.status = "DISABLED";
    await expect(portalAuthService.authenticate(session)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(portalStore.sessions[0]!.revokedAt).not.toBeNull();
  });

  it("a blocked haulier: the session is refused with a plain message and every session of its users ends", async () => {
    await active();
    await active("jan@bravo.cz");
    const a = await login();
    const b = await login("jan@bravo.cz");
    hauliers.find.mockResolvedValue({ profile: { blocked: true }, lanes: [] });
    await expect(portalAuthService.authenticate(a.session)).rejects.toMatchObject({ code: "permission_denied", message: HAULIER_BLOCKED });
    expect(portalStore.sessions.every((s) => s.revokedAt)).toBe(true);
    hauliers.find.mockResolvedValue({ profile: { blocked: false }, lanes: [] });
    await expect(portalAuthService.authenticate(b.session)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("a session stays with its haulier: another haulier's user gets their own haulier", async () => {
    const other = await portalUserService.create(manager, HAULIER2, { email: "ola@gama.cz", name: "Ola", phone: "" });
    await portalAuthService.setPassword({ token: tokenOf(other.inviteLink), password: PASSWORD });
    const { session } = await login("ola@gama.cz");
    expect((await portalAuthService.authenticate(session)).haulierId).toBe(HAULIER2);
  });
});
