import { describe, expect, it } from "vitest";
import type { Announcement } from "@/hooks/useNoticeboard";
import { filterNotices } from "./noticeFilters";

const notice = (title: string, audience: Partial<Pick<Announcement, "countryCodes" | "branchIds" | "departmentIds">> = {}): Announcement =>
  ({
    id: title,
    title,
    body: "",
    authorName: "Jana",
    target: "All",
    attachments: [],
    severity: "info",
    countryCodes: [],
    branchIds: [],
    departmentIds: [],
    ...audience,
  }) as unknown as Announcement;

describe("the noticeboard's search", () => {
  it("finds a notice whatever its case and accents, the stroked letters' too", () => {
    const notices = [notice("Něco se změnilo"), notice("Pobočka Łódź otevřena"), notice("Ostrava")];
    expect(filterNotices(notices, { search: "zmenilo" }).map((n) => n.title)).toEqual(["Něco se změnilo"]);
    expect(filterNotices(notices, { search: "lodz" }).map((n) => n.title)).toEqual(["Pobočka Łódź otevřena"]);
  });
});

describe("the noticeboard's audience filters, several of each (owner's answer 22 Nov)", () => {
  const notices = [
    notice("For all"),
    notice("Czechia", { countryCodes: ["CZ"] }),
    notice("Germany FCL", { countryCodes: ["DE"], departmentIds: ["fcl"] }),
    notice("Austria and Germany", { countryCodes: ["AT", "DE"] }),
    notice("Prague branch", { branchIds: ["prg"] }),
  ];
  const titles = (f: Parameters<typeof filterNotices>[1], branchCountries?: string[]) => filterNotices(notices, f, branchCountries).map((n) => n.title);

  it("shows a notice reaching any one of the countries filtered for, and those for all", () => {
    expect(titles({ countryCodes: ["CZ", "AT"] })).toEqual(["For all", "Czechia", "Austria and Germany", "Prague branch"]);
  });

  it("needs each filtered part to be reached", () => {
    expect(titles({ countryCodes: ["DE"], departmentIds: ["lcl", "fcl"] })).toEqual(["For all", "Germany FCL", "Austria and Germany", "Prague branch"]);
    expect(titles({ departmentIds: ["lcl"] })).toEqual(["For all", "Czechia", "Austria and Germany", "Prague branch"]);
  });

  it("takes the filtered branches' countries when no country is filtered for", () => {
    expect(titles({ branchIds: ["prg"] }, ["CZ"])).toEqual(["For all", "Czechia", "Prague branch"]);
  });
});
