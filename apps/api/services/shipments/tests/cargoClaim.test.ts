import { describe, expect, it } from "vitest";
import {
  ANY_CLAIM_STATUSES,
  CARRIER_DAY_NEEDED,
  INSURER_DAY_NEEDED,
  SETTLED_AMOUNT_NEEDED,
  cargoClaimColumns,
  cargoStateProblem,
  claimSummary,
  claimWords,
  isOpenClaim,
  statusProblem,
} from "../lib/cargoClaim";
import { isClosedStatus } from "../lib/costClaim";

// A cargo claim's life (Council Outlay 11, D20) beside a claim on costs' own.

const state = { status: "open" as const, noticeDate: null, insurerNotifiedOn: null, settledAmount: null, settledCurrency: "" };

describe("a claim's statuses", () => {
  it("are each kind's own", () => {
    expect(statusProblem("cargo", "with_insurer")).toBeNull();
    expect(statusProblem("cargo", "accepted")).toBe("The status of a claim on the shipment must be one of: open, notified, with_insurer, settled, rejected, withdrawn");
    expect(statusProblem("cost", "accepted")).toBeNull();
    expect(statusProblem("cost", "settled")).toBe("The claim status must be one of: open, accepted, rejected, withdrawn");
    expect(ANY_CLAIM_STATUSES).toEqual(["open", "accepted", "rejected", "withdrawn", "notified", "with_insurer", "settled"]);
  });

  it("say whether it is still open", () => {
    for (const s of ["open", "notified", "with_insurer"] as const) expect([isOpenClaim("cargo", s), isClosedStatus(s)]).toEqual([true, false]);
    for (const s of ["settled", "rejected", "withdrawn"] as const) expect([isOpenClaim("cargo", s), isClosedStatus(s)]).toEqual([false, true]);
    expect(isOpenClaim("cost", "open")).toBe(true);
    expect(isOpenClaim("cost", "accepted")).toBe(false);
  });
});

describe("a cargo claim's own fields", () => {
  it("go into the columns as they take them, an empty one clearing", () => {
    expect(cargoClaimColumns({ insurerNotifiedOn: "2026-11-12", settledAmount: " 500.5 ", settledCurrency: "czk" })).toEqual({ columns: { insurerNotifiedOn: "2026-11-12", settledAmount: "500.5", settledCurrency: "CZK" } });
    expect(cargoClaimColumns({ insurerNotifiedOn: "", settledAmount: "", settledCurrency: "" })).toEqual({ columns: { insurerNotifiedOn: null, settledAmount: null, settledCurrency: "" } });
    expect(cargoClaimColumns({})).toEqual({ columns: {} });
  });

  it("are refused when they are not what the columns take", () => {
    expect(cargoClaimColumns({ insurerNotifiedOn: "12.11.2026" })).toEqual({ problem: "The day the insurer was notified must be a day as YYYY-MM-DD" });
    expect(cargoClaimColumns({ settledAmount: "-5" })).toEqual({ problem: "The settled amount must be a number with at most 2 decimal places, like 120.50" });
    expect(cargoClaimColumns({ settledCurrency: "€" })).toEqual({ problem: "The currency must be a 3-letter code, like EUR" });
  });
});

describe("what a cargo claim's status asks for", () => {
  it("notified the carrier's day, with the insurer the insurer's, settled the amount and its currency", () => {
    expect(cargoStateProblem({ ...state, status: "notified" })).toBe(CARRIER_DAY_NEEDED);
    expect(cargoStateProblem({ ...state, status: "notified", noticeDate: "2026-11-11" })).toBeNull();
    expect(cargoStateProblem({ ...state, status: "with_insurer" })).toBe(INSURER_DAY_NEEDED);
    expect(cargoStateProblem({ ...state, status: "settled", settledAmount: "5" })).toBe(SETTLED_AMOUNT_NEEDED);
    expect(cargoStateProblem({ ...state, status: "settled", settledAmount: "5", settledCurrency: "EUR" })).toBeNull();
    expect(cargoStateProblem({ ...state, status: "rejected" })).toBeNull();
  });
});

describe("a claim in the job's history", () => {
  const base = { cargoState: "", supplier: "", invoiceNumber: "", reason: "", note: "", amount: "", claimAmount: null, claimCurrency: "", status: "open" as const };

  it("is named by what tells it from the job's other claims", () => {
    expect(claimWords({ ...base, kind: "cargo", cargoState: "Damaged" })).toBe("Cargo claim (Damaged)");
    expect(claimWords({ ...base, kind: "cargo" })).toBe("Cargo claim");
    expect(claimWords({ ...base, kind: "cost", supplier: "Rail Cargo", invoiceNumber: "F-77" })).toBe("Claim on costs (Rail Cargo, F-77)");
    expect(claimWords({ ...base, kind: "cost" })).toBe("Claim on costs");
  });

  it("is summed up with its amount, status and note", () => {
    expect(claimSummary({ ...base, kind: "cargo", cargoState: "Lost", claimAmount: "1200.00", claimCurrency: "EUR", note: "Pallet missing" })).toBe("Cargo claim (Lost) · 1200.00 EUR · Open · Pallet missing");
    expect(claimSummary({ ...base, kind: "cost", supplier: "X", amount: "50 EUR", reason: "Double", status: "withdrawn" })).toBe("Claim on costs (X) · 50 EUR · Withdrawn · Double");
    expect(claimSummary({ ...base, kind: "cargo", note: "a".repeat(250) })).toBe(`Cargo claim · Open · ${"a".repeat(200)}…`);
  });
});
