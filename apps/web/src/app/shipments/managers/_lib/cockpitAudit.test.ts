import { describe, expect, it } from "vitest";
import { AUDIT_LABELS, RUBBER_STAMP_ABOVE, auditFigures, auditLabel, auditLineLabel, auditListNote, auditListRows, offersTakeBack, rubberStamp } from "./cockpitAudit";

// Every key the server counts (apps/api services/shipments/lib/managersCockpitAudit AUDIT_KEYS).
const SERVER_KEYS = [
  "prepayment_release",
  "own_credit_check",
  "own_document_approval",
  "deleted",
  "cancelled",
  "tick_taken_back",
  "ata_atd_changed",
  "warehouse_received_moved",
  "handled_by_changed",
  "handed_over",
  "cutoff_dismissed",
  "requests_decided",
  "release_requests_decided",
];

describe("Shipments → Managers: what the audit line calls its figures", () => {
  it("names every key the server counts, each its own way", () => {
    expect(Object.keys(AUDIT_LABELS).sort()).toEqual([...SERVER_KEYS].sort());
    const labels = SERVER_KEYS.map(auditLabel);
    expect(new Set(labels).size).toBe(labels.length);
    for (const key of SERVER_KEYS) expect(auditLabel(key), key).not.toBe(key);
  });

  it("uses the words agreed", () => {
    expect(auditLabel("prepayment_release")).toBe("Released without payment");
    expect(auditLabel("own_credit_check")).toBe("Credit Check approved by the job's own Handled By");
    expect(auditLabel("own_document_approval")).toBe("Document approved for customs by its uploader");
    expect(auditLabel("deleted")).toBe("Jobs deleted");
    expect(auditLabel("cancelled")).toBe("Jobs cancelled");
    expect(auditLabel("tick_taken_back")).toBe("Ticks taken back");
    expect(auditLabel("ata_atd_changed")).toBe("ATA / ATD corrected");
    expect(auditLabel("warehouse_received_moved")).toBe("Warehouse Received moved later or cleared");
    expect(auditLabel("handled_by_changed")).toBe("Handled By or Holiday Cover changed");
    expect(auditLabel("handed_over")).toBe("Jobs handed over by a manager");
    expect(auditLabel("cutoff_dismissed")).toBe("Missed cut-offs dismissed");
    expect(auditLabel("requests_decided")).toBe("Document and Customs Office requests decided");
    expect(auditLabel("release_requests_decided")).toBe("Release requests decided");
  });

  it("shows a key it does not know by the key, made readable", () => {
    expect(auditLabel("invoice_reopened")).toBe("Invoice reopened");
    expect(auditLabel("release_pass_used")).toBe("Release pass used");
    expect(auditLabel("reopened")).toBe("Reopened");
    // Only the first letter is raised: a key's own capitals stay.
    expect(auditLabel("ATA_changed")).toBe("ATA changed");
    expect(auditLabel("_odd__key_")).toBe("Odd key");
    expect(auditLabel("")).toBe("");
    expect(auditLabel("_")).toBe("_");
    // Not a name every object happens to have.
    expect(auditLabel("constructor")).toBe("Constructor");
    expect(auditLabel("toString")).toBe("ToString");
  });

  it("labels the line with the days the server counted", () => {
    expect(auditLineLabel({ days: 7 })).toBe("Audit · last 7 days");
  });
});

describe("Shipments → Managers: the rubber-stamp mark", () => {
  it("marks a share above 95 %", () => {
    expect(RUBBER_STAMP_ABOVE).toBe(0.95);
    expect(rubberStamp(0.97)).toBe("approved 97 %");
    expect(rubberStamp(0.96)).toBe("approved 96 %");
    expect(rubberStamp(1)).toBe("approved 100 %");
  });

  it("does not mark 95 % or less", () => {
    expect(rubberStamp(0.95)).toBeNull();
    expect(rubberStamp(0.9)).toBeNull();
    expect(rubberStamp(0)).toBeNull();
  });

  it("does not mark a figure with no share: too few decided, or not a count of decisions", () => {
    expect(rubberStamp(undefined)).toBeNull();
    expect(rubberStamp(null)).toBeNull();
    expect(rubberStamp(Number.NaN)).toBeNull();
  });

  it("says a share just above the line to one decimal: 95 % beside a rule of more than 95 % would read as a mistake", () => {
    expect(rubberStamp(0.951)).toBe("approved 95.1 %");
    // 20 of 21, 39 of 41.
    expect(rubberStamp(20 / 21)).toBe("approved 95.2 %");
    expect(rubberStamp(39 / 41)).toBe("approved 95.1 %");
    expect(rubberStamp(0.959)).toBe("approved 95.9 %");
    // From 96 on a whole number says it.
    expect(rubberStamp(0.96)).toBe("approved 96 %");
    expect(rubberStamp(0.9601)).toBe("approved 96 %");
  });

  it("says over 95 % where even one decimal would read 95.0", () => {
    // 1,901 of 2,000.
    expect(rubberStamp(0.9505)).toBe("approved over 95 %");
    expect(rubberStamp(0.95001)).toBe("approved over 95 %");
  });

  it("never reads 95 % or 95.0 % for a share that is marked", () => {
    for (let n = 9501; n <= 10000; n++) {
      const said = rubberStamp(n / 10000)!;
      expect(said, String(n)).not.toBe("approved 95 %");
      expect(said, String(n)).not.toBe("approved 95.0 %");
    }
  });

  it("says 100 % only when every single one was approved", () => {
    // 199 of 200.
    expect(rubberStamp(0.995)).toBe("approved 99 %");
    expect(rubberStamp(29 / 30)).toBe("approved 96 %");
  });
});

describe("Shipments → Managers: the figures the audit line shows", () => {
  it("shows what happened at least once, in the server's order, and hides the zeros", () => {
    const audit = {
      items: [
        { key: "prepayment_release", count: 2 },
        { key: "own_credit_check", count: 0 },
        { key: "deleted", count: 1 },
        { key: "cancelled", count: 0 },
        { key: "requests_decided", count: 31, approvalRate: 0.97 },
      ],
    };
    expect(auditFigures(audit)).toEqual([
      { key: "prepayment_release", label: "Released without payment", count: 2, rubberStamp: null },
      { key: "deleted", label: "Jobs deleted", count: 1, rubberStamp: null },
      { key: "requests_decided", label: "Document and Customs Office requests decided", count: 31, rubberStamp: "approved 97 %" },
    ]);
  });

  it("marks no rubber stamp on decisions that were not nearly all approved", () => {
    expect(auditFigures({ items: [{ key: "release_requests_decided", count: 12, approvalRate: 0.75 }] })[0]).toMatchObject({ label: "Release requests decided", count: 12, rubberStamp: null });
  });

  it("shows a key it does not know under the key made readable, and keeps the key for its rows", () => {
    expect(auditFigures({ items: [{ key: "invoice_reopened", count: 3 }] })).toEqual([{ key: "invoice_reopened", label: "Invoice reopened", count: 3, rubberStamp: null }]);
  });

  it("shows nothing when nothing happened, and nothing for a line that was not read", () => {
    expect(auditFigures({ items: [{ key: "deleted", count: 0 }] })).toEqual([]);
    expect(auditFigures({ items: [] })).toEqual([]);
    expect(auditFigures(null)).toEqual([]);
    expect(auditFigures(undefined)).toEqual([]);
  });
});

describe("Shipments → Managers: the audit rows' note", () => {
  const rows = (n: number) => Array.from({ length: n }, () => ({}));

  it("counts the rows", () => {
    expect(auditListNote({ rows: rows(1), capped: false })).toBe("1 row");
    expect(auditListNote({ rows: rows(14), capped: false })).toBe("14 rows");
    expect(auditListNote({ rows: [], capped: false })).toBe("0 rows");
  });

  it("says that only the newest are listed when there were more", () => {
    expect(auditListNote({ rows: rows(200), capped: true })).toBe("The newest 200 are listed: there were more");
  });
});

describe("Shipments → Managers: the audit rows' keys", () => {
  const row = (over: Partial<{ shipmentId: string; jobNumber: string; who: string; at: string; what: string }> = {}) => ({
    shipmentId: "s1",
    jobNumber: "CZ00000053",
    who: "jana@cto.cz",
    at: "2026-11-17T08:12:00.000Z",
    what: "Tick \"docs\" taken back",
    ...over,
  });

  it("keeps the rows as they are, in the server's order", () => {
    const rows = [row(), row({ shipmentId: "s2", jobNumber: "CZ00000054" })];
    expect(auditListRows(rows).map(({ key: _key, ...rest }) => rest)).toEqual(rows);
  });

  it("gives two rows that are the same in every field keys of their own", () => {
    const keys = auditListRows([row(), row(), row()]).map((r) => r.key);
    expect(new Set(keys).size).toBe(3);
  });

  it("has no rows for none", () => {
    expect(auditListRows([])).toEqual([]);
  });
});

describe("Shipments → Managers: what the audit rows offer", () => {
  it("is a take-back on the rows of missed cut-offs dismissed only (N3): the other figures are a record", () => {
    expect(offersTakeBack("cutoff_dismissed")).toBe(true);
    for (const key of Object.keys(AUDIT_LABELS).filter((k) => k !== "cutoff_dismissed")) expect(offersTakeBack(key)).toBe(false);
    expect(offersTakeBack(null)).toBe(false);
  });
});
