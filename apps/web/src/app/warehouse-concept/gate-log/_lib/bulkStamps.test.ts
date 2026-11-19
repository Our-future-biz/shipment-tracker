import { describe, expect, it } from "vitest";
import { skippedText, skippingPaymentStops } from "./bulkStamps";

// The server's refusals, as the client throws them: a failed precondition with its sentence.
const refusal = (message: string) => Object.assign(new Error(message), { code: "failed_precondition" });
const STOP = "The WH release can't be stamped: the job is on prepayment and not paid - FV2026001 (1,200.00 EUR left to pay). As a manager you can release it all the same: give a reason (at least 3 characters)";
const UNCHECKED = "Whether the job is paid could not be checked: try again in a moment. A manager can release it with a reason";

// The bulk runner as the Gate Log calls it (tabs/shared runBulk): one call per row, failures kept with their reason.
async function runAll<T>(rows: T[], fn: (row: T) => Promise<unknown>) {
  const settled = await Promise.allSettled(rows.map(fn));
  return {
    done: rows.filter((_, i) => settled[i]!.status === "fulfilled"),
    failed: rows.flatMap((row, i) => (settled[i]!.status === "rejected" ? [{ row, reason: String((settled[i] as PromiseRejectedResult).reason.message) }] : [])),
  };
}

describe("a bulk WH release in the Gate Log", () => {
  it("skips the rows the prepayment stop holds, stamps the others, and keeps any other refusal a failure", async () => {
    const answers: Record<string, Error | null> = { A: null, B: refusal(STOP), C: refusal(UNCHECKED), D: refusal("Release gates are NOT armed") };
    const bulk = skippingPaymentStops("impRelease", async (row: string) => {
      if (answers[row]) throw answers[row];
    });
    expect(bulk.split(await runAll(["A", "B", "C", "D"], bulk.run))).toEqual({
      done: ["A"],
      failed: [{ row: "D", reason: "Release gates are NOT armed" }],
      skipped: ["B", "C"],
    });
  });

  it("skips nothing of any other stamp", async () => {
    const bulk = skippingPaymentStops("gateOut", async () => {
      throw refusal(STOP);
    });
    expect(bulk.split(await runAll(["A"], bulk.run))).toEqual({ done: [], failed: [{ row: "A", reason: STOP }], skipped: [] });
  });

  it("names the skipped rows and says to open the job", () => {
    expect(skippedText(["WCZ1", "WCZ2"], (r) => r)).toBe("WCZ1, WCZ2: held for payment - open the job to release it with a reason");
    expect(skippedText(["A", "B", "C", "D", "E", "F", ""], (r) => r)).toBe("A, B, C, D, E, … and 2 more: held for payment - open the job to release it with a reason");
  });
});
