import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { CREDIT_REREAD_MS, receivableKeys } from "./useReceivables";
import { receivableToolKeys, settleBankConfirm } from "./useReceivableTools";
import { salesManagersKeys } from "./salesQueryKeys";

const invalidated = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));

describe("after a bank entry is confirmed", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the receivables and the customers' credit again with no answer too (a refusal, or a lost answer)", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    // No data: the confirm failed - it may still have noted the payments.
    settleBankConfirm(client, undefined, "st-1");
    expect(invalidated(spy)).toEqual(
      expect.arrayContaining([
        JSON.stringify(receivableToolKeys.bankStatement("st-1")),
        JSON.stringify(receivableToolKeys.bankStatements),
        JSON.stringify(receivableKeys.all),
        JSON.stringify(["customers"]),
        JSON.stringify(salesManagersKeys.cockpit),
      ]),
    );
    const atOnce = spy.mock.calls.length;
    vi.advanceTimersByTime(CREDIT_REREAD_MS);
    expect(invalidated(spy).slice(atOnce)).toEqual(expect.arrayContaining([JSON.stringify(["customers"]), JSON.stringify(salesManagersKeys.cockpit)]));
  });
});
