import type { Announcement } from "@/hooks/useNoticeboard";

// The noticeboard's filters; undefined is "All".
export interface NoticeFilters {
  countryCode?: string;
  branchId?: string;
  departmentId?: string;
  severity?: string;
}

export const hasFilters = (f: NoticeFilters) =>
  !!(f.countryCode || f.branchId || f.departmentId || f.severity);

// An audience field left empty on the notice means "all", so it reaches whatever is filtered for.
const reaches = (wanted: string | null, filter: string | undefined) =>
  !filter || !wanted || wanted === filter;

// The notices that reach the people the filters describe: a notice for "Czechia" or for "All"
// reaches Czechia, as does one for "Accounting" left on all countries. A branch filter stands for
// its country too (`branchCountry`), since people at that branch get that country's notices.
export function filterNotices(
  notices: Announcement[],
  f: NoticeFilters,
  branchCountry?: string | null,
) {
  const country = f.countryCode ?? branchCountry ?? undefined;
  return notices.filter(
    (n) =>
      (!f.severity || n.severity === f.severity) &&
      reaches(n.countryCode, country) &&
      reaches(n.branchId, f.branchId) &&
      reaches(n.departmentId, f.departmentId),
  );
}
