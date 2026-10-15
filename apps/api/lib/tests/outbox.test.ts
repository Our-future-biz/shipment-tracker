import { describe, expect, it, vi } from "vitest";
import { nextAttemptAt, OUTBOX_MAX_ATTEMPTS, outboxErrorCode, outboxGivesUp, retryDelayMinutes } from "../outbox/outboxRetry";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers, type OutboxOutcome } from "../outbox/outboxDelivery";

interface Row {
  id: string;
  attempts: number;
}

const coded = (code: string) => Object.assign(new Error(code), { code });

function handlers(send: (row: Row) => Promise<void>) {
  return {
    send: vi.fn(send),
    errorText: (err: unknown) => `text:${outboxErrorCode(err)}`,
    onSent: vi.fn(async () => {}),
    onRetry: vi.fn(async () => {}),
    onFailed: vi.fn(async () => {}),
  } satisfies OutboxHandlers<Row>;
}

describe("outbox retry rules", () => {
  it("waits 2, 4, 8 … minutes, never more than an hour", () => {
    expect([0, 1, 2, 3, 5, 6, 15].map(retryDelayMinutes)).toEqual([2, 2, 4, 8, 32, 60, 60]);
    expect(nextAttemptAt(3, 1_000).getTime()).toBe(1_000 + 8 * 60_000);
  });

  it("reads the error code of an API error or any error carrying one", () => {
    expect(outboxErrorCode(coded("not_found"))).toBe("not_found");
    expect(outboxErrorCode(new Error("boom"))).toBe("");
    expect(outboxErrorCode(null)).toBe("");
  });

  it("gives up on permanent errors at once and on others after the last attempt", () => {
    for (const code of ["not_found", "invalid_argument", "permission_denied", "unauthenticated", "failed_precondition"]) {
      expect(outboxGivesUp(coded(code), 1)).toBe(true);
    }
    expect(outboxGivesUp(coded("unavailable"), 1)).toBe(false);
    expect(outboxGivesUp(coded("unavailable"), OUTBOX_MAX_ATTEMPTS - 1)).toBe(false);
    expect(outboxGivesUp(coded("unavailable"), OUTBOX_MAX_ATTEMPTS)).toBe(true);
    expect(outboxGivesUp(new Error("boom"), 3, 3)).toBe(true);
  });
});

describe("deliverOutboxRow", () => {
  it("settles a delivered row as sent", async () => {
    const h = handlers(async () => {});
    const row = { id: "a", attempts: 1 };
    expect(await deliverOutboxRow(row, h)).toBe("sent");
    expect(h.onSent).toHaveBeenCalledWith(row);
    expect(h.onRetry).not.toHaveBeenCalled();
  });

  it("puts a passing failure back with the growing wait and its own wording", async () => {
    const err = coded("unavailable");
    const h = handlers(async () => Promise.reject(err));
    const before = Date.now();
    expect(await deliverOutboxRow({ id: "a", attempts: 3 }, h)).toBe("retry");
    const [, error, next, passed] = h.onRetry.mock.calls[0] as unknown as [Row, string, Date, unknown];
    expect(error).toBe("text:unavailable");
    expect(passed).toBe(err);
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 8 * 60_000);
    expect(h.onSent).not.toHaveBeenCalled();
  });

  it("fails a row for good on a permanent error or when the attempts are used up", async () => {
    const h = handlers(async () => Promise.reject(coded("not_found")));
    expect(await deliverOutboxRow({ id: "a", attempts: 1 }, h)).toBe("failed");
    expect(h.onFailed).toHaveBeenCalledWith({ id: "a", attempts: 1 }, "text:not_found", expect.any(Error));

    const tired = handlers(async () => Promise.reject(coded("unavailable")));
    expect(await deliverOutboxRow({ id: "b", attempts: 2 }, { ...tired, maxAttempts: 2 })).toBe("failed");
    expect(tired.onRetry).not.toHaveBeenCalled();
  });
});

describe("runOutboxDelivery", () => {
  it("claims in rounds until the queue is drained and counts the outcomes", async () => {
    const queue: OutboxOutcome[][] = [["sent", "retry"], ["failed"], []];
    const claim = vi.fn(async () => queue.shift() ?? []);
    const out = await runOutboxDelivery({ claim, deliver: async (o) => o, onError: () => {}, batch: 2 });
    expect(out).toEqual({ sent: 1, retry: 1, failed: 1 });
    // The second round was short and sent nothing, so no third claim.
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("stops after the given number of rounds", async () => {
    const claim = vi.fn(async () => ["sent", "sent"] as OutboxOutcome[]);
    const out = await runOutboxDelivery({ claim, deliver: async (o) => o, onError: () => {}, batch: 2, rounds: 3 });
    expect(out.sent).toBe(6);
    expect(claim).toHaveBeenCalledTimes(3);
  });

  it("never throws: reports the error and returns what was done", async () => {
    const onError = vi.fn();
    let round = 0;
    const claim = async () => {
      if (round++) throw new Error("db down");
      return ["sent", "sent"] as OutboxOutcome[];
    };
    const out = await runOutboxDelivery({ claim, deliver: async (o) => o, onError, batch: 2 });
    expect(out).toEqual({ sent: 2, retry: 0, failed: 0 });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "db down" }));
  });
});
