import { describe, expect, it } from "vitest";
import { attentionSignal, cockpitCard, rankRow, urgentSignal, type CockpitTag, type RankedRow } from "../cockpit";

interface Row {
  ref: string;
  tags: CockpitTag[];
}
const ranked = (ref: string, ...signals: Parameters<typeof rankRow>[1]) => rankRow<Row>({ ref }, signals);
const byRef = (a: Row, b: Row) => a.ref.localeCompare(b.ref);

describe("a signal", () => {
  it("is urgent or attention, with its rank and text", () => {
    expect(urgentSignal(3, "Refused")).toEqual({ rank: 3, text: "Refused", urgent: true });
    expect(attentionSignal(20, "MRN missing")).toEqual({ rank: 20, text: "MRN missing", urgent: false });
  });
});

describe("a ranked row", () => {
  it("is none without a signal", () => {
    expect(ranked("A")).toBeNull();
  });

  it("carries every signal as a tag: urgent first, then by rank, and no rank in the tag", () => {
    const r = ranked("A", attentionSignal(1, "watch"), urgentSignal(9, "late"), attentionSignal(0, "soon"), urgentSignal(2, "now"))!;
    expect(r.row).toEqual({
      ref: "A",
      tags: [
        { text: "now", urgent: true },
        { text: "late", urgent: true },
        { text: "soon", urgent: false },
        { text: "watch", urgent: false },
      ],
    });
  });

  it("is urgent when any signal is, and ranks by its best urgent signal: an attention one never lifts it", () => {
    expect(ranked("A", attentionSignal(0, "soon"), urgentSignal(5, "late"), urgentSignal(7, "later"))).toMatchObject({ urgent: true, rank: 5 });
  });

  it("is attention when no signal is urgent, ranked by its best one", () => {
    expect(ranked("A", attentionSignal(30, "b"), attentionSignal(21, "a"))).toMatchObject({ urgent: false, rank: 21 });
  });

  it("keeps the order signals of one rank came in", () => {
    expect(ranked("A", urgentSignal(4, "first"), urgentSignal(4, "second"))!.row.tags.map((t) => t.text)).toEqual(["first", "second"]);
  });

  it("leaves the signals it was handed as they were", () => {
    const signals = [attentionSignal(2, "b"), urgentSignal(1, "a")];
    rankRow<Row>({ ref: "A" }, signals);
    expect(signals.map((s) => s.text)).toEqual(["b", "a"]);
  });
});

describe("a card", () => {
  const rows = [ranked("C", urgentSignal(2, "x")), ranked("A", urgentSignal(2, "x")), ranked("B", urgentSignal(1, "x"))].filter((r): r is RankedRow<Row> => r !== null);

  it("lists the lowest rank first, rows of one rank by the cockpit's own tie-break", () => {
    expect(cockpitCard(rows, 10, byRef).rows.map((r) => r.ref)).toEqual(["B", "A", "C"]);
    expect(cockpitCard(rows, 10, (a, b) => byRef(b, a)).rows.map((r) => r.ref)).toEqual(["B", "C", "A"]);
  });

  it("is cut at its limit and still counts every row", () => {
    expect(cockpitCard(rows, 2, byRef)).toEqual({ total: 3, rows: [rows[2]!.row, rows[1]!.row] });
  });

  it("is empty for no rows, and does not reorder what it was handed", () => {
    expect(cockpitCard([], 10, byRef)).toEqual({ total: 0, rows: [] });
    cockpitCard(rows, 10, byRef);
    expect(rows.map((r) => r.row.ref)).toEqual(["C", "A", "B"]);
  });
});
