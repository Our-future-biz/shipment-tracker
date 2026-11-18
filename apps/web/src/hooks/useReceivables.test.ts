import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { CREDIT_REREAD_MS, creditWarningKey, receivableKeys, settleReceivableWrite } from "./useReceivables";
import { salesManagersKeys } from "./salesQueryKeys";

const invalidated = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));

describe("after a write on a customer invoice", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the receivables, the credit warning and the Sales managers' cockpit again at once", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    settleReceivableWrite(client, undefined, "cust-1", false);
    expect(invalidated(spy)).toEqual(
      expect.arrayContaining([JSON.stringify(receivableKeys.all), JSON.stringify(creditWarningKey("cust-1")), JSON.stringify(salesManagersKeys.cockpit)]),
    );
  });

  it("after a payment, reads the credit again once the outbox has updated the customer's list", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    settleReceivableWrite(client, undefined, "cust-1", true);
    const atOnce = spy.mock.calls.length;
    vi.advanceTimersByTime(CREDIT_REREAD_MS - 1);
    expect(spy.mock.calls.length).toBe(atOnce);
    vi.advanceTimersByTime(1);
    const later = invalidated(spy).slice(atOnce);
    expect(later).toEqual(expect.arrayContaining([JSON.stringify(creditWarningKey("cust-1")), JSON.stringify(salesManagersKeys.cockpit)]));
  });

  it("does not read the credit a second time after a note", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    settleReceivableWrite(client, undefined, "cust-1", false);
    const atOnce = spy.mock.calls.length;
    vi.advanceTimersByTime(CREDIT_REREAD_MS * 2);
    expect(spy.mock.calls.length).toBe(atOnce);
  });
});
