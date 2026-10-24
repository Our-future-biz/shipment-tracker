import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { salesPreferenceRepository } from "../repositories/salesPreference.repository";

// The addresses a user emailed quotations to (To, CC and BCC), remembered as the Email dialog
// hands a message over, so they can be picked again. Kept with the Sales preferences under a key of
// the user's own: only that user reads or changes them (prefGet refuses the key to anyone).

/** The key a user's addresses are kept under. */
export const EMAIL_ADDRESSES_PREFIX = "email_addresses:";
const keyOf = (actor: Actor) => `${EMAIL_ADDRESSES_PREFIX}${actor.userID}`;

/** How many are kept: the oldest go first. */
export const MAX_ADDRESSES = 300;
const MAX_PER_CALL = 50;

// An address the mail programs take: something@domain.tld, no spaces, at most 254 characters.
const isAddress = (value: string) => value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);

/** The stored list as read: addresses only, each once. */
function asList(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return withUsed([], stored.filter((a): a is string => typeof a === "string"));
}

/**
 * The list with these addresses just used: they go first, in the order given, and an address
 * already there moves up rather than being kept twice (whatever its case). Anything that is no
 * address is left out. At most MAX_ADDRESSES are kept.
 */
export function withUsed(list: string[], used: string[]): string[] {
  const fresh = used.map((a) => a.trim()).filter(isAddress);
  const lower = new Set(fresh.map((a) => a.toLowerCase()));
  const firstOf = fresh.filter((a, i) => fresh.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i);
  return [...firstOf, ...list.filter((a) => !lower.has(a.toLowerCase()))].slice(0, MAX_ADDRESSES);
}

class EmailAddressService {
  async list(actor: Actor): Promise<string[]> {
    return asList(await salesPreferenceRepository.get(keyOf(actor), actor.companyID));
  }

  /** Remembers the addresses a message was just handed over to. */
  async used(actor: Actor, addresses: string[]): Promise<string[]> {
    if (!Array.isArray(addresses) || addresses.length > MAX_PER_CALL) throw APIError.invalidArgument(`at most ${MAX_PER_CALL} addresses at a time`);
    const list = withUsed(await this.list(actor), addresses.filter((a) => typeof a === "string"));
    await salesPreferenceRepository.set(keyOf(actor), actor.companyID, list);
    return list;
  }

  /** Takes an address off the user's list. */
  async forget(actor: Actor, address: string): Promise<string[]> {
    const target = (address ?? "").trim().toLowerCase();
    const list = (await this.list(actor)).filter((a) => a.toLowerCase() !== target);
    await salesPreferenceRepository.set(keyOf(actor), actor.companyID, list);
    return list;
  }
}

export const emailAddressService = new EmailAddressService();
