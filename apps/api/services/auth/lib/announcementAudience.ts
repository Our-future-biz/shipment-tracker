import { resolveCountryCode } from "../../../lib/geo/format";

// Who a noticeboard post is addressed to. Pure helpers (no I/O) so they can be unit-tested.

export const ANNOUNCEMENT_SCOPES = ["company", "audience", "department", "branch", "country"] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

/** Where a reader sits: their department and branch, and the branch's country. */
export interface Addressee {
  departmentId: string | null;
  branchId: string | null;
  country: string | null;
  countryCode: string | null;
}

/**
 * Whom an "audience" post is for: the countries (codes), branches and departments chosen, each empty for all
 * of them (owner's answer 22 Nov: several of each may be chosen).
 */
export interface AudienceLists {
  countryCodes: readonly string[];
  branchIds: readonly string[];
  departmentIds: readonly string[];
}

/** A post as its audience is judged: its scope, the single columns of the older scopes, and the lists. */
export type AddressedPost = Addressee & AudienceLists & { scope: string };

// An "audience" list left empty means all; a filled one must hold the reader's own.
const anyOrAll = (wanted: readonly string[], own: string | null) => wanted.length === 0 || (!!own && wanted.includes(own));

// Whether a post is addressed to someone sitting where `viewer` does.
export function isAddressedTo(post: AddressedPost, viewer: Addressee): boolean {
  switch (post.scope as AnnouncementScope) {
    case "company":
      return true;
    case "audience":
      return (
        anyOrAll(post.countryCodes, viewer.countryCode) &&
        anyOrAll(post.branchIds, viewer.branchId) &&
        anyOrAll(post.departmentIds, viewer.departmentId)
      );
    case "department":
      return !!viewer.departmentId && post.departmentId === viewer.departmentId;
    case "branch":
      return !!viewer.branchId && post.branchId === viewer.branchId;
    case "country":
      return !!viewer.country && post.country?.toLowerCase() === viewer.country.toLowerCase();
    default:
      return false;
  }
}

// The countries a post reaches, none for every country. Posts from before the "audience" scope carry
// no country code: a branch post is in its branch's country, a country post names its country in
// words - so the board's country filter can tell them apart from posts for all.
export function audienceCountryCodes(post: {
  scope: string;
  country: string | null;
  countryCodes: readonly string[];
  branchCountryCode: string | null;
}): string[] {
  if (post.scope === "audience") return [...post.countryCodes];
  if (post.scope === "branch") return post.branchCountryCode ? [post.branchCountryCode] : [];
  if (post.scope === "country" && post.country) {
    const code = resolveCountryCode(post.country);
    return code ? [code] : [];
  }
  return [];
}

// "Czechia · Prague Office · Accounting", or "All" when the post leaves everything open. A part naming
// several is them joined: "Czechia, Germany · FCL, LCL".
export const audienceLabel = (parts: (string | readonly string[] | null | undefined)[]) =>
  parts
    .map((p) => (Array.isArray(p) ? p.filter(Boolean).join(", ") : (p as string | null | undefined)))
    .filter(Boolean)
    .join(" · ") || "All";
