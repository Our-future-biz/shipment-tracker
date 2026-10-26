import type { Announcement } from "@/hooks/useNoticeboard";

// The noticeboard's filters; undefined is "All".
export interface NoticeFilters {
  countryCode?: string;
  branchId?: string;
  departmentId?: string;
  severity?: string;
  // Free text looked up in the title, the text, the author, the audience and attachment names.
  search?: string;
}

export const hasFilters = (f: NoticeFilters) =>
  !!(f.countryCode || f.branchId || f.departmentId || f.severity || f.search?.trim());

// An audience field left empty on the notice means "all", so it reaches whatever is filtered for.
const reaches = (wanted: string | null, filter: string | undefined) =>
  !filter || !wanted || wanted === filter;

// Lower case without accents, so "zmenilo" finds "Něco se změnilo".
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Every word typed must appear somewhere in the notice.
const matchesSearch = (n: Announcement, search: string | undefined) => {
  const words = fold(search ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold([n.title, n.body, n.authorName, n.target, ...n.attachments.map((a) => a.fileName)].join(" "));
  return words.every((w) => text.includes(w));
};

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
      matchesSearch(n, f.search) &&
      reaches(n.countryCode, country) &&
      reaches(n.branchId, f.branchId) &&
      reaches(n.departmentId, f.departmentId),
  );
}
