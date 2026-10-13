import { resolveCountryCode } from "../../lib/geo/format";

// Who a noticeboard post is addressed to. Pure helpers (no I/O) so they can be unit-tested.

export const ANNOUNCEMENT_SCOPES = ["company", "audience", "department", "branch", "country"] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export interface Addressee {
  departmentId: string | null;
  branchId: string | null;
  country: string | null;
  countryCode: string | null;
}

// An "audience" column left empty means all; a filled one must be the reader's own.
const sameOrAll = (wanted: string | null, own: string | null) => !wanted || wanted === own;

// Whether a post is addressed to someone sitting where `viewer` does.
export function isAddressedTo(post: Addressee & { scope: string }, viewer: Addressee): boolean {
  switch (post.scope as AnnouncementScope) {
    case "company":
      return true;
    case "audience":
      return (
        sameOrAll(post.countryCode, viewer.countryCode) &&
        sameOrAll(post.branchId, viewer.branchId) &&
        sameOrAll(post.departmentId, viewer.departmentId)
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

// The country a post reaches, null for every country. Posts from before the "audience" scope
// carry no country code: a branch post is in its branch's country, a country post names its
// country in words — so the board's country filter can tell them apart from posts for all.
export function audienceCountryCode(post: {
  scope: string;
  country: string | null;
  countryCode: string | null;
  branchCountryCode: string | null;
}): string | null {
  if (post.countryCode) return post.countryCode;
  if (post.scope === "branch") return post.branchCountryCode;
  if (post.scope === "country" && post.country) return resolveCountryCode(post.country);
  return null;
}

// "Czechia · Prague Office · Accounting", or "All" when the post leaves everything open.
export const audienceLabel = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || "All";
