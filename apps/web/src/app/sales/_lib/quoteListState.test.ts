import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, businessToday } from "@/lib/date";
import { DEFAULT_PAGE_SIZE } from "@/components/DataTable";
import { activeColumnFilters, builtinViewOf, filtersToQuery, hasFilters, listHref, readList } from "./quoteListState";

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

describe("column filters", () => {
  it("are read from the address as f.<column>, unknown columns and empty values left out", () => {
    const list = readList(new URLSearchParams("f.customer=Alza&f.origin=%20&f.data=x&f.incoterm=FOB"));
    expect(list.filters.columns).toEqual([
      { key: "customer", value: "Alza" },
      { key: "incoterm", value: "FOB" },
    ]);
    expect(readList(new URLSearchParams("")).filters.columns).toBeUndefined();
  });

  it("are written to the address, replacing the ones it had, and asked of the server", () => {
    const columns = [{ key: "customer", value: " Alza " }, { key: "commodity", value: "" }];
    const href = listHref("/sales/quotes", new URLSearchParams("f.origin=Praha&chat=QCZ1"), { search: "", filters: { statuses: [], columns }, sort: "", page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(href).toBe("/sales/quotes?chat=QCZ1&f.customer=Alza");
    expect(filtersToQuery({ statuses: [], columns }).columnFilters).toBe(JSON.stringify([{ key: "customer", value: "Alza" }]));
    expect(filtersToQuery({ statuses: [] }).columnFilters).toBeUndefined();
  });

  it("count as filters, and make a built-in view another one", () => {
    expect(hasFilters({ statuses: [], columns: [{ key: "customer", value: "Alza" }] })).toBe(true);
    expect(hasFilters({ statuses: [], columns: [{ key: "customer", value: " " }] })).toBe(false);
    expect(builtinViewOf({ statuses: ["draft"], columns: [{ key: "customer", value: "Alza" }] })).toBeUndefined();
    expect(builtinViewOf({ statuses: ["draft"], columns: [] })).toBe("drafts");
  });

  it("from a saved view of unknown age keep only known columns with a value", () => {
    expect(activeColumnFilters([{ key: "customer", value: "x" }, { key: 3, value: "y" }, null, "z", { key: "method", value: 1 }])).toEqual([{ key: "customer", value: "x" }]);
    expect(activeColumnFilters("nonsense")).toEqual([]);
    // No more and no longer than the server takes: an address with more must not fail the list.
    const many = Array.from({ length: 12 }, (_, i) => ({ key: "customer", value: `c${i}` }));
    expect(activeColumnFilters(many)).toHaveLength(10);
    expect(activeColumnFilters([{ key: "customer", value: `${"č".repeat(150)}` }])[0]!.value).toHaveLength(100);
  });
});
