import { APIError } from "encore.dev/api";
import { inTx, type Tx } from "../db/db";
import { portalRepository } from "../repositories/portal.repository";
import { appendEvent } from "../repositories/event.repository";
import type { PortalUserRecord } from "../schemas/portal.schema";
import type { TruckingEventKind } from "../schemas/truckingEvent.schema";
import type { PortalUserItem } from "../interfaces/portal.interfaces";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import { newToken } from "../lib/haulierToken";
import { cleanText, LINK_VALID_MS, normaliseEmail, portalUserItem, setPasswordUrl } from "../lib/portalRules";
import { requireManager } from "../lib/roles";
import { userName } from "../lib/users";
import { haulierService } from "./haulier.service";
import { appUrl } from "../../../lib/appUrl";
import { isUniqueViolation } from "../../../lib/db/errors";

// The app's side of the haulier portal: a haulier's portal users. Any user sees them; a manager
// adds one, resets a password, disables or enables. E-mail sending is off, so an invitation or a
// reset gives the manager a one-time link to pass on - shown once, only its SHA-256 is stored.

const MAX_REASON = 500;
export const PORTAL_USER_CONFLICT = "The portal user was changed by someone else. Reload and try again.";
const EMAIL_TAKEN = "A portal user with this e-mail already exists";

const notFound = () => APIError.notFound("Portal user not found");

class PortalUserService {
  private async load(actor: Actor, id: string): Promise<PortalUserRecord> {
    const u = isUuid(id) ? await portalRepository.findUser(actor.companyID, id) : null;
    if (!u) throw notFound();
    return u;
  }

  private async log(tx: Tx, actor: Actor, by: string, u: PortalUserRecord, kind: TruckingEventKind, summary: string, reason?: string) {
    await appendEvent(tx, actor.companyID, {
      kind,
      customerId: u.haulierCustomerId,
      byUserId: actor.userID || null,
      byName: by,
      payload: { changes: {}, summary, ...(reason ? { reason } : {}), facts: { portalUserId: u.id, email: u.email } },
    });
  }

  /** A new one-time link of the user (the older open ones are closed). */
  private async link(tx: Tx, actor: Actor, u: PortalUserRecord, kind: "INVITE" | "RESET") {
    const { token, hash } = newToken();
    const expiresAt = new Date(Date.now() + LINK_VALID_MS);
    await portalRepository.newToken(tx, { companyId: actor.companyID, userId: u.id, kind, tokenHash: hash, expiresAt, createdBy: actor.userID });
    return { link: setPasswordUrl(appUrl(), token), expiresAt: expiresAt.toISOString() };
  }

  /** Any user: the haulier's portal users. */
  async list(actor: Actor, customerId: string): Promise<PortalUserItem[]> {
    if (!isUuid(customerId)) throw APIError.notFound("Haulier not found");
    const now = new Date();
    return (await portalRepository.usersOf(actor.companyID, customerId)).map((u) => portalUserItem(u, now));
  }

  /** Manager: a new portal user of a haulier (Customer Database company with the role haulier) and the invitation link. */
  async create(actor: Actor, customerId: string, input: { email: unknown; name: unknown; phone: unknown }): Promise<{ user: PortalUserItem; inviteLink: string; expiresAt: string }> {
    requireManager(actor.role, "add a portal user");
    const email = normaliseEmail(input.email);
    if (!email) throw APIError.invalidArgument("Give a valid e-mail");
    const name = cleanText(input.name, "Give the name", 2, 100);
    const phone = cleanText(input.phone ?? "", "The phone", 0, 50);
    await haulierService.get(actor.companyID, customerId);
    if (await portalRepository.userByEmail(actor.companyID, email)) throw APIError.alreadyExists(EMAIL_TAKEN);
    const by = await userName(actor.userID);
    try {
      return await inTx(async (tx) => {
        const u = await portalRepository.insertUser(tx, { companyId: actor.companyID, haulierCustomerId: customerId, email, name, phone, createdBy: actor.userID });
        const { link, expiresAt } = await this.link(tx, actor, u, "INVITE");
        await this.log(tx, actor, by, u, "portal_user_created", `Portal user ${name} (${email}) added; invitation link valid 72 hours`);
        return { user: portalUserItem(u, new Date()), inviteLink: link, expiresAt };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw APIError.alreadyExists(EMAIL_TAKEN);
      throw err;
    }
  }

  /**
   * Manager: a one-time link to set a new password. The old password stops working and every
   * session of the user ends at once.
   */
  async reset(actor: Actor, id: string): Promise<{ resetLink: string; expiresAt: string }> {
    requireManager(actor.role, "reset a portal password");
    const u = await this.load(actor, id);
    if (u.status === "DISABLED") throw APIError.failedPrecondition("Enable the portal user first");
    const by = await userName(actor.userID);
    return inTx(async (tx) => {
      const row = await portalRepository.updateUser(tx, actor.companyID, u.id, { passwordHash: null, failedAttempts: 0, lockedUntil: null }, u.version);
      if (!row) throw APIError.aborted(PORTAL_USER_CONFLICT);
      await portalRepository.revokeSessionsOf(tx, actor.companyID, [u.id]);
      const { link, expiresAt } = await this.link(tx, actor, u, "RESET");
      await this.log(tx, actor, by, u, "portal_user_reset", `Portal password of ${u.name} reset; link valid 72 hours`);
      return { resetLink: link, expiresAt };
    });
  }

  /** Manager: the user can no longer log in; their sessions and open links end. */
  async disable(actor: Actor, id: string, reason: unknown): Promise<PortalUserItem> {
    requireManager(actor.role, "disable a portal user");
    const why = cleanText(reason, "Give the reason for disabling", 3, MAX_REASON);
    const u = await this.load(actor, id);
    if (u.status === "DISABLED") throw APIError.failedPrecondition("The portal user is already disabled");
    const by = await userName(actor.userID);
    const row = await inTx(async (tx) => {
      const row = await portalRepository.updateUser(tx, actor.companyID, u.id, { status: "DISABLED" }, u.version);
      if (!row) throw APIError.aborted(PORTAL_USER_CONFLICT);
      await portalRepository.revokeSessionsOf(tx, actor.companyID, [u.id]);
      await portalRepository.closeTokens(tx, actor.companyID, u.id);
      await this.log(tx, actor, by, u, "portal_user_disabled", `Portal user ${u.name} disabled: ${why}`, why);
      return row;
    });
    return portalUserItem(row, new Date());
  }

  /** Manager: a disabled user may log in again (with the password they had; reset it when unsure). */
  async enable(actor: Actor, id: string): Promise<PortalUserItem> {
    requireManager(actor.role, "enable a portal user");
    const u = await this.load(actor, id);
    if (u.status !== "DISABLED") throw APIError.failedPrecondition("The portal user is not disabled");
    const by = await userName(actor.userID);
    const row = await inTx(async (tx) => {
      const row = await portalRepository.updateUser(tx, actor.companyID, u.id, { status: "ACTIVE", failedAttempts: 0, lockedUntil: null }, u.version);
      if (!row) throw APIError.aborted(PORTAL_USER_CONFLICT);
      await this.log(tx, actor, by, u, "portal_user_enabled", `Portal user ${u.name} enabled`);
      return row;
    });
    return portalUserItem(row, new Date());
  }
}

export const portalUserService = new PortalUserService();
