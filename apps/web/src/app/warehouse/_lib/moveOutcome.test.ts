import { describe, expect, it } from "vitest";
import { moveOutcome, noneMoved, notMovedText } from "./moveOutcome";

const STOP =
  "Warehouse Released can't be set: the job is on prepayment and not paid - INV-1 (100.00 EUR left to pay). A manager can release it with a reason";
const UNCHECKED = "Whether the job is paid could not be checked: try again in a moment. A manager can release it with a reason";
const refused = (code: string, message: string) => Object.assign(new Error(message), { code });
const ok = (): PromiseSettledResult<unknown> => ({ status: "fulfilled", value: {} });
const no = (reason: unknown): PromiseSettledResult<unknown> => ({ status: "rejected", reason });
const messageOf = (e: unknown) => (e instanceof Error ? e.message : "the server could not be reached");
const jobs: Record<string, string> = { a: "CZ001", b: "CZ002", c: "CZ003" };
const jobOf = (id: string) => jobs[id] ?? "";

describe("a move of several shipments, per shipment", () => {
  it("tells the moved, the stopped for prepayment and the otherwise refused apart", () => {
    const o = moveOutcome(["a", "b", "c"], [ok(), no(refused("failed_precondition", STOP)), no(refused("permission_denied", "Only a manager may clear it"))], messageOf);
    expect(o.done).toBe(false);
    expect(o.moved).toEqual(["a"]);
    expect(o.stopped).toEqual([{ shipmentId: "b", stop: { kind: "unpaid", message: STOP } }]);
    expect(o.failed).toEqual([{ shipmentId: "c", message: "Only a manager may clear it" }]);
  });

  it("reads the could-not-be-checked refusal as a stop too", () => {
    const o = moveOutcome(["a"], [no(refused("failed_precondition", UNCHECKED))], messageOf);
    expect(o.stopped[0]?.stop.kind).toBe("unchecked");
  });

  it("is done only when every shipment moved; a missing answer is a failure", () => {
    expect(moveOutcome(["a", "b"], [ok(), ok()], messageOf).done).toBe(true);
    const o = moveOutcome(["a", "b"], [ok()], messageOf);
    expect(o.done).toBe(false);
    expect(o.failed.map((f) => f.shipmentId)).toEqual(["b"]);
  });

  it("names each job that was not moved, and leaves the stopped out when the dialog shows them", () => {
    const o = moveOutcome(["a", "b", "c"], [ok(), no(refused("failed_precondition", STOP)), no(new Error("Not received yet"))], messageOf);
    expect(notMovedText(o, jobOf)).toBe(`2 of 3 shipments not moved - CZ003: Not received yet; CZ002: ${STOP}`);
    expect(notMovedText(o, jobOf, false)).toBe("1 of 3 shipments not moved - CZ003: Not received yet");
    expect(notMovedText(moveOutcome(["a"], [ok()], messageOf), jobOf)).toBeNull();
  });

  it("gives a single shipment's reason alone", () => {
    expect(notMovedText(moveOutcome(["a"], [no(new Error("Not received yet"))], messageOf), jobOf)).toBe("Not received yet");
    expect(notMovedText(noneMoved(["a"], "the server could not be reached"), jobOf)).toBe("the server could not be reached");
  });
});
