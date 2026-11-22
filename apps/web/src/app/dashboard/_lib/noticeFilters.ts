import type { Announcement } from "@/hooks/useNoticeboard";
import { fold } from "@/lib/fold";

// The noticeboard's filters; nothing chosen is "All". Several countries, branches and departments may be
// chosen (owner's answer 22 Nov): a notice shows when it reaches any one of them.
export interface NoticeFilters {
  countryCodes?: string[];
  branchIds?: string[];
  departmentIds?: string[];
  severity?: string;
  // Free text looked up in the title, the text, the author, the audience and attachment names.
  search?: string;
}

export const hasFilters = (f: NoticeFilters) =>
  !!(f.countryCodes?.length || f.branchIds?.length || f.departmentIds?.length || f.severity || f.search?.trim());

// An audience list left empty on the notice means "all", so it reaches whatever is filtered for; a filled one
// reaches the filter when they share an entry.
const reaches = (wanted: readonly string[], filter: readonly string[] | undefined) =>
  !filter?.length || !wanted.length || wanted.some((w) => filter.includes(w));

// Every word typed must appear somewhere in the notice, case and accents ignored (lib/fold), so
// "zmenilo" finds "Něco se změnilo" and "lodz" finds "Łódź".
const matchesSearch = (n: Announcement, search: string | undefined) => {
  const words = fold(search ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold([n.title, n.body, n.authorName, n.target, ...n.attachments.map((a) => a.fileName)].join(" "));
  return words.every((w) => text.includes(w));
};

// The notices that reach the people the filters describe: a notice for "Czechia" or for "All"
// reaches Czechia, as does one for "Accounting" left on all countries. Branches filtered for stand for
// their countries too (`branchCountries`), since people at a branch get that country's notices.
export function filterNotices(notices: Announcement[], f: NoticeFilters, branchCountries: readonly string[] = []) {
  const countries = f.countryCodes?.length ? f.countryCodes : branchCountries;
  return notices.filter(
    (n) =>
      (!f.severity || n.severity === f.severity) &&
      matchesSearch(n, f.search) &&
      reaches(n.countryCodes, countries) &&
      reaches(n.branchIds, f.branchIds) &&
      reaches(n.departmentIds, f.departmentIds),
  );
}
