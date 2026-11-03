import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
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
    const today = dayjs();
    expect(filtersToQuery({ statuses: [], validWithinDays: 7, followUpDue: true })).toMatchObject({
      validFrom: today.format("YYYY-MM-DD"),
      validTo: today.add(7, "day").format("YYYY-MM-DD"),
      followUp: "due",
    });
    expect(filtersToQuery({ statuses: [] })).toMatchObject({ validFrom: undefined, validTo: undefined, followUp: undefined });
  });
});
