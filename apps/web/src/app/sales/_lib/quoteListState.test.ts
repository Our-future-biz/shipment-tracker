import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, businessToday } from "@/lib/date";
import { filtersToQuery, listHref, readList } from "./quoteListState";

describe("the Sales managers' list filters", () => {
  it("reads follow-up due and valid within N days from the address, and writes them back", () => {
    const list = readList(new URLSearchParams("status=quoted&followup=due&valid=7"));
    expect(list.filters).toMatchObject({ statuses: ["quoted"], followUpDue: true, validWithinDays: 7 });
    expect(listHref("/sales/quotes", new URLSearchParams(), list)).toBe("/sales/quotes?status=quoted&valid=7&followup=due");
  });

  it("drops what the server would not understand", () => {
    expect(readList(new URLSearchParams("followup=yes&valid=0")).filters).toMatchObject({ followUpDue: undefined, validWithinDays: undefined });
    expect(readList(new URLSearchParams("valid=999")).filters.validWithinDays).toBeUndefined();
    expect(readList(new URLSearchParams("valid=2.5")).filters.validWithinDays).toBeUndefined();
  });

  it("asks the server for validity from today to today + N days", () => {
    expect(filtersToQuery({ statuses: [], validWithinDays: 7, followUpDue: true })).toMatchObject({
      validFrom: businessToday(),
      validTo: addDays(businessToday(), 7),
      followUp: "due",
    });
    expect(filtersToQuery({ statuses: [] })).toMatchObject({ validFrom: undefined, validTo: undefined, followUp: undefined });
  });

  describe("at 00:30 in Prague, still the day before in UTC", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-03T23:30:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("counts validity from Prague's day, as the cockpit tile does, whatever the viewer's clock", () => {
      expect(filtersToQuery({ statuses: [], validWithinDays: 7 })).toMatchObject({ validFrom: "2026-11-04", validTo: "2026-11-11" });
    });
  });
});
