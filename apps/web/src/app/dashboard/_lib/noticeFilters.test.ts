import { describe, expect, it } from "vitest";
import type { Announcement } from "@/hooks/useNoticeboard";
import { filterNotices } from "./noticeFilters";

const notice = (title: string): Announcement =>
  ({
    id: title,
    title,
    body: "",
    authorName: "Jana",
    target: "All",
    attachments: [],
    severity: "info",
    countryCode: null,
    branchId: null,
    departmentId: null,
  }) as unknown as Announcement;

describe("the noticeboard's search", () => {
  it("finds a notice whatever its case and accents, the stroked letters' too", () => {
    const notices = [notice("Něco se změnilo"), notice("Pobočka Łódź otevřena"), notice("Ostrava")];
    expect(filterNotices(notices, { search: "zmenilo" }).map((n) => n.title)).toEqual(["Něco se změnilo"]);
    expect(filterNotices(notices, { search: "lodz" }).map((n) => n.title)).toEqual(["Pobočka Łódź otevřena"]);
  });
});
