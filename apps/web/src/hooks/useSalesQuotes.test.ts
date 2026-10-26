import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { customerQuotesKeys, followupTaskKeys, quoteShipmentsKeys, salesQuoteKeys } from "./salesQueryKeys";
import { invalidateQuoteLists, refreshQuoteCopies } from "./useSalesQuotes";

vi.mock("@/lib/api", () => ({ api: {} }));

describe("invalidateQuoteLists", () => {
  it("marks every copy of the quotes out of date - the shipments counted per quote too, which a new shipment changes", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidateQuoteLists({ invalidateQueries } as unknown as QueryClient, { refetchType: "none" });
    const calls = invalidateQueries.mock.calls.map((c) => (c as unknown as [{ queryKey: readonly unknown[]; refetchType?: string }])[0]);
    expect(calls.map((c) => c.queryKey)).toEqual(expect.arrayContaining([salesQuoteKeys.lists, salesQuoteKeys.quotes, customerQuotesKeys.all, quoteShipmentsKeys.all]));
    for (const call of calls) expect(call.refetchType).toBe("none");
  });

  it("keeps the shipments of a page of quotes under the key the invalidation names", () => {
    expect(quoteShipmentsKeys.of(["QCZ20261010001"]).slice(0, 1)).toEqual(quoteShipmentsKeys.all);
  });
});

describe("refreshQuoteCopies", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the quotes and follow-up tasks out of date at once, and reads them again once the server has rewritten its copies", () => {
    vi.useFakeTimers();
    const invalidateQueries = vi.fn(async () => undefined);
    refreshQuoteCopies({ invalidateQueries } as unknown as QueryClient, 1500);
    const calls = () => invalidateQueries.mock.calls.map((c) => (c as unknown as [{ queryKey: readonly unknown[]; refetchType?: string }])[0]);

    const now = calls();
    expect(now.map((c) => c.queryKey)).toEqual(expect.arrayContaining([salesQuoteKeys.lists, salesQuoteKeys.quotes, customerQuotesKeys.all, followupTaskKeys.all]));
    for (const call of now) expect(call.refetchType).toBe("none");

    vi.advanceTimersByTime(1500);
    const later = calls().slice(now.length);
    expect(later.map((c) => c.queryKey)).toEqual(expect.arrayContaining([salesQuoteKeys.lists, salesQuoteKeys.quotes, customerQuotesKeys.all, followupTaskKeys.all]));
    for (const call of later) expect(call.refetchType).toBeUndefined();
  });
});
