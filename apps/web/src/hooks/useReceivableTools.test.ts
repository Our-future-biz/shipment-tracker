import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { CREDIT_REREAD_MS, receivableKeys } from "./useReceivables";
import { receivableToolKeys, settleBankConfirm, settleBankIgnore, settleBankImport } from "./useReceivableTools";
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

// An open bank entry marks the invoices it may pay ("a payment may be waiting" in the drawer, on the bell and in the
// reminder form): reading a statement opens entries and setting one aside closes one, so both read the receivables again.
describe("after a statement is read or an entry set aside", () => {
  const under = (key: readonly string[]) => key.slice(0, receivableKeys.all.length);

  it("reads every receivables view again, the drawer and the bell with them, with no answer too", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    settleBankImport(client);
    expect(invalidated(spy)).toEqual([JSON.stringify(receivableKeys.all)]);
    // The statements, the drawer and the bell sit under it.
    for (const key of [receivableToolKeys.bankStatements, receivableKeys.detail("inv-1"), receivableKeys.forMe]) expect(under(key)).toEqual([...receivableKeys.all]);
  });

  it("an entry set aside: the statement, and every receivables view - not the customers' credit, as nothing was paid", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    settleBankIgnore(client, undefined, "st-1");
    expect(invalidated(spy)).toEqual(expect.arrayContaining([JSON.stringify(receivableToolKeys.bankStatement("st-1")), JSON.stringify(receivableKeys.all)]));
    expect(invalidated(spy)).not.toContain(JSON.stringify(["customers"]));
  });
});
