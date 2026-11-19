import { beforeEach, describe, expect, it, vi } from "vitest";

const history = vi.hoisted(() => ({ changesSince: vi.fn() }));
const overrides = vi.hoisted(() => ({ listSince: vi.fn() }));
const attachments = vi.hoisted(() => ({ ownApprovalsSince: vi.fn() }));
const documentRequests = vi.hoisted(() => ({ decidedSince: vi.fn() }));
const officeRequests = vi.hoisted(() => ({ decidedSince: vi.fn() }));
const releaseRequests = vi.hoisted(() => ({ decidedSince: vi.fn() }));
const shipments = vi.hoisted(() => ({ jobNumbersByIds: vi.fn() }));
const clients = vi.hoisted(() => ({ auth: { userLookup: vi.fn() } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => clients);
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: history }));
vi.mock("../../repositories/shipmentReleaseOverride.repository", () => ({ shipmentReleaseOverrideRepository: overrides }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: attachments }));
vi.mock("../../repositories/documentChangeRequest.repository", () => ({ documentChangeRequestRepository: documentRequests }));
vi.mock("../../repositories/customsOfficeRequest.repository", () => ({ customsOfficeRequestRepository: officeRequests }));
vi.mock("../../repositories/shipmentReleaseRequest.repository", () => ({ shipmentReleaseRequestRepository: releaseRequests }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));

import { AUDIT_READ_LIMIT } from "../../lib/cockpitThresholds";
import { AUDIT_KEYS, historyAsk } from "../../lib/managersCockpitAudit";
import { readLimiter } from "../../lib/readLimiter";
import { AUDIT_PARTS, forgetAuditLines, managersAuditLine, managersAuditRows } from "../../services/managersCockpitAudit.service";

// The reads of Shipments → Managers' audit line and of the rows behind its counts, against
// stand-ins for the repositories: what each is asked, what a part that fails takes with it, and
// that one figure's rows read only that figure's part. The wording is tests/managersCockpitAudit.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const SINCE = new Date("2026-11-11T10:00:00Z");
const USERS = new Map([
  ["u-jan", "jan@firma.cz"],
  ["u-boss", "boss@firma.cz"],
]);
const at = (day: string, time = "11:00") => new Date(`${day}T${time}:00+01:00`);

const change = (field: string, oldValue: string | null, newValue: string | null, over = {}) => ({
  shipmentId: "id-1",
  jobNumber: "CZ00000001",
  personInCharge: "jan@firma.cz",
  userId: "u-boss",
  field,
  oldValue,
  newValue,
  changedAt: at("2026-11-16"),
  ...over,
});
const decided = (status: string, over = {}) => ({ shipmentId: "id-1", jobNumber: "CZ00000001", status, decidedByName: "Boss", decidedAt: at("2026-11-16"), comment: "", ...over });
const documentRequest = (status: string, over = {}) => decided(status, { fileName: "invoice.pdf", documentType: "Invoice", ...over });
const officeRequest = (status: string, over = {}) => decided(status, { fromOffice: "CZ510201", toOffice: "CZ510202", ...over });
const countsOf = (audit: { items: { key: string; count: number }[] } | null) => Object.fromEntries((audit?.items ?? []).map((i) => [i.key, i.count]));

beforeEach(() => {
  vi.clearAllMocks();
  // Every test reads the line anew: what an earlier one read is not kept for it.
  forgetAuditLines();
  history.changesSince.mockResolvedValue([]);
  overrides.listSince.mockResolvedValue([]);
  attachments.ownApprovalsSince.mockResolvedValue([]);
  documentRequests.decidedSince.mockResolvedValue([]);
  officeRequests.decidedSince.mockResolvedValue([]);
  releaseRequests.decidedSince.mockResolvedValue([]);
  shipments.jobNumbersByIds.mockResolvedValue(new Map());
  clients.auth.userLookup.mockResolvedValue({ users: [] });
});

describe("the audit line", () => {
  it("reads the company's last seven days, each table once and with a limit, and counts every kind - 0 for none", async () => {
    history.changesSince.mockResolvedValue([
      change("deletedAt", null, "2026-11-16T10:00:00.000Z"),
      change("status", "Booked [EXP]", "Cancelled Shipment"),
      change("creditCheck", "Red", "Green", { userId: "u-jan" }),
      change("creditCheck", "Red", "Green", { shipmentId: "id-2" }),
      change("personInCharge", "jan@firma.cz", "eva@firma.cz", { shipmentId: "id-3" }),
      // A hand-over and the change it made: counted once, as the hand-over.
      change("personInCharge", "jan@firma.cz", "eva@firma.cz", { shipmentId: "id-4" }),
      change("handOver", null, "jan@firma.cz → eva@firma.cz: on holiday", { shipmentId: "id-4" }),
      change("estimatedArrival", "2026-11-10", "2026-11-12"),
    ]);
    overrides.listSince.mockResolvedValue([{ shipmentId: "id-1", jobNumber: "CZ00000001", kind: "house_bol", reason: "Pays on Friday", checked: true, by: "boss@firma.cz", createdAt: at("2026-11-16") }]);
    attachments.ownApprovalsSince.mockResolvedValue([{ shipmentId: "id-1", jobNumber: "CZ00000001", fileName: "invoice.pdf", documentType: "Invoice", reviewedById: "u-boss", reviewedAt: at("2026-11-16") }]);
    documentRequests.decidedSince.mockResolvedValue([documentRequest("approved"), documentRequest("rejected")]);
    officeRequests.decidedSince.mockResolvedValue([officeRequest("approved")]);
    releaseRequests.decidedSince.mockResolvedValue([{ id: "r-1", shipmentId: "id-1", status: "approved", decidedAt: at("2026-11-16"), decidedByName: "Boss", what: "house_bol", comment: "Pays on Friday" }]);

    const { audit, notKnown } = await managersAuditLine(COMPANY, NOW, USERS);

    expect(history.changesSince).toHaveBeenCalledTimes(1);
    expect(history.changesSince).toHaveBeenCalledWith(COMPANY, SINCE, historyAsk(), AUDIT_READ_LIMIT + 1);
    expect(overrides.listSince).toHaveBeenCalledWith(COMPANY, SINCE, AUDIT_READ_LIMIT + 1);
    expect(attachments.ownApprovalsSince).toHaveBeenCalledWith(COMPANY, SINCE, AUDIT_READ_LIMIT + 1);
    expect(documentRequests.decidedSince).toHaveBeenCalledWith(COMPANY, SINCE, AUDIT_READ_LIMIT + 1);
    expect(officeRequests.decidedSince).toHaveBeenCalledWith(COMPANY, SINCE, AUDIT_READ_LIMIT + 1);
    expect(releaseRequests.decidedSince).toHaveBeenCalledWith(COMPANY, SINCE, AUDIT_READ_LIMIT + 1);
    // The line only counts: nobody's job number is looked up for it.
    expect(shipments.jobNumbersByIds).not.toHaveBeenCalled();

    expect(audit!.days).toBe(7);
    expect(audit!.items.map((i) => i.key)).toEqual([...AUDIT_KEYS]);
    expect(countsOf(audit)).toEqual({
      prepayment_release: 1,
      own_credit_check: 1,
      own_document_approval: 1,
      deleted: 1,
      cancelled: 1,
      tick_taken_back: 0,
      ata_atd_changed: 0,
      warehouse_received_moved: 0,
      // The change on job 3; the one on job 4 is its hand-over's.
      handled_by_changed: 1,
      handed_over: 1,
      cutoff_dismissed: 0,
      requests_decided: 3,
      release_requests_decided: 1,
    });
    expect(notKnown).toEqual([]);
  });

  it("gives the approval rate of the two request tables together, from ten decisions on", async () => {
    documentRequests.decidedSince.mockResolvedValue(Array.from({ length: 6 }, () => documentRequest("approved")));
    officeRequests.decidedSince.mockResolvedValue([...Array.from({ length: 3 }, () => officeRequest("approved")), officeRequest("rejected", { comment: "No" })]);
    const { audit } = await managersAuditLine(COMPANY, NOW, USERS);
    expect(audit!.items.find((i) => i.key === "requests_decided")).toEqual({ key: "requests_decided", count: 10, approvalRate: 0.9 });
    expect(audit!.items.find((i) => i.key === "release_requests_decided")).toEqual({ key: "release_requests_decided", count: 0 });
  });

  it("counts the release requests a manager approved or rejected - a closed one was answered by nobody - and rates the approved among those", async () => {
    const answered = (status: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${status}-${i}`, shipmentId: "id-1", status, decidedAt: at("2026-11-16"), decidedByName: "Boss", what: "house_bol", comment: "" }));
    releaseRequests.decidedSince.mockResolvedValue([...answered("approved", 9), ...answered("rejected", 3), ...answered("closed", 5)]);
    const { audit } = await managersAuditLine(COMPANY, NOW, USERS);
    expect(audit!.items.find((i) => i.key === "release_requests_decided")).toEqual({ key: "release_requests_decided", count: 12, approvalRate: 0.75 });
    // No figure of the passes used: the line has no such kind.
    expect(audit!.items.map((i) => i.key)).not.toContain("release_passes_used");
  });

  it("leaves out the kinds of a part that could not be read and names the part: no figure is not a zero", async () => {
    history.changesSince.mockRejectedValue(new Error("the history could not be read"));
    officeRequests.decidedSince.mockRejectedValue(new Error("the requests could not be read"));
    overrides.listSince.mockResolvedValue([{ shipmentId: "id-1", jobNumber: "CZ00000001", kind: "house_bol", reason: "Pays on Friday", checked: true, by: "boss@firma.cz", createdAt: at("2026-11-16") }]);
    const { audit, notKnown } = await managersAuditLine(COMPANY, NOW, USERS);
    // Both request tables make the one figure: without either it is not known.
    expect(countsOf(audit)).toEqual({ prepayment_release: 1, own_document_approval: 0, release_requests_decided: 0 });
    expect(notKnown).toEqual([AUDIT_PARTS.history, AUDIT_PARTS.requests]);
  });

  it("cannot say a credit check was approved by the job's own Handled By without the users: that one kind is left out and named", async () => {
    history.changesSince.mockResolvedValue([change("creditCheck", "Red", "Green", { userId: "u-jan" }), change("deletedAt", null, "2026-11-16T10:00:00.000Z")]);
    const { audit, notKnown } = await managersAuditLine(COMPANY, NOW, null);
    expect(audit!.items.map((i) => i.key)).not.toContain("own_credit_check");
    expect(countsOf(audit)).toMatchObject({ deleted: 1, cancelled: 0 });
    expect(notKnown).toEqual([AUDIT_PARTS.ownCreditCheck]);
  });

  it("is null, and named once, when none of it could be read", async () => {
    for (const read of [history.changesSince, overrides.listSince, attachments.ownApprovalsSince, documentRequests.decidedSince, releaseRequests.decidedSince]) read.mockRejectedValue(new Error("the database is down"));
    expect(await managersAuditLine(COMPANY, NOW, USERS)).toEqual({ audit: null, notKnown: [AUDIT_PARTS.all] });
  });

  it("says so when a part had more rows than it takes at once: the newest are counted", async () => {
    history.changesSince.mockResolvedValue(Array.from({ length: AUDIT_READ_LIMIT + 1 }, (_, i) => change("deletedAt", null, "x", { shipmentId: `id-${i}` })));
    const { audit, notKnown } = await managersAuditLine(COMPANY, NOW, USERS);
    expect(countsOf(audit).deleted).toBe(AUDIT_READ_LIMIT);
    expect(notKnown).toEqual([AUDIT_PARTS.cut]);
    expect(AUDIT_PARTS.cut).toBe("audit: more than 5,000 rows in 7 days - the newest are counted");
  });
});

describe("the audit line, kept in memory", () => {
  const MINUTE = 60_000;
  const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);
  const reads = () => [history.changesSince, overrides.listSince, attachments.ownApprovalsSince, documentRequests.decidedSince, officeRequests.decidedSince, releaseRequests.decidedSince];
  const sent = () => reads().reduce((n, read) => n + read.mock.calls.length, 0);

  it("is read once per company and handed out for five minutes - six statements, then none - and read again after that", async () => {
    history.changesSince.mockResolvedValue([change("deletedAt", null, "2026-11-16T10:00:00.000Z")]);
    const first = await managersAuditLine(COMPANY, NOW, USERS);
    expect(sent()).toBe(6);
    // Meanwhile another job is deleted: the line kept does not know yet.
    history.changesSince.mockResolvedValue([change("deletedAt", null, "x"), change("deletedAt", null, "y", { shipmentId: "id-2" })]);
    expect(await managersAuditLine(COMPANY, later(1), USERS)).toEqual(first);
    expect(await managersAuditLine(COMPANY, later(4.99), USERS)).toEqual(first);
    expect(sent()).toBe(6);
    const fresh = await managersAuditLine(COMPANY, later(5), USERS);
    expect(sent()).toBe(12);
    expect(countsOf(fresh.audit).deleted).toBe(2);
    // The window of the new read ends at its own moment.
    expect(history.changesSince).toHaveBeenLastCalledWith(COMPANY, new Date(SINCE.getTime() + 5 * MINUTE), historyAsk(), AUDIT_READ_LIMIT + 1);
  });

  it("is each company's own", async () => {
    await managersAuditLine(COMPANY, NOW, USERS);
    await managersAuditLine("another-company", NOW, USERS);
    expect(sent()).toBe(12);
    expect(history.changesSince).toHaveBeenLastCalledWith("another-company", SINCE, historyAsk(), AUDIT_READ_LIMIT + 1);
  });

  it("answers two asks of the same moment from one read", async () => {
    const [a, b] = await Promise.all([managersAuditLine(COMPANY, NOW, USERS), managersAuditLine(COMPANY, NOW, USERS)]);
    expect(sent()).toBe(6);
    expect(a).toEqual(b);
  });

  it("does not keep a line that lacks a part: a failed read is tried again by the next ask", async () => {
    overrides.listSince.mockRejectedValueOnce(new Error("the releases could not be read"));
    expect((await managersAuditLine(COMPANY, NOW, USERS)).notKnown).toEqual([AUDIT_PARTS.overrides]);
    expect((await managersAuditLine(COMPANY, later(1), USERS)).notKnown).toEqual([]);
    expect(sent()).toBe(12);
    // That one was whole: it is kept.
    await managersAuditLine(COMPANY, later(2), USERS);
    expect(sent()).toBe(12);
  });

  it("does not keep a line read without the users, nor one that could not be read at all", async () => {
    expect((await managersAuditLine(COMPANY, NOW, null)).notKnown).toEqual([AUDIT_PARTS.ownCreditCheck]);
    for (const read of reads()) read.mockRejectedValueOnce(new Error("the database is down"));
    expect(await managersAuditLine(COMPANY, later(1), USERS)).toEqual({ audit: null, notKnown: [AUDIT_PARTS.all] });
    expect((await managersAuditLine(COMPANY, later(2), USERS)).notKnown).toEqual([]);
    expect(sent()).toBe(18);
  });

  it("keeps a line that was only cut: every part was read", async () => {
    history.changesSince.mockResolvedValue(Array.from({ length: AUDIT_READ_LIMIT + 1 }, (_, i) => change("deletedAt", null, "x", { shipmentId: `id-${i}` })));
    await managersAuditLine(COMPANY, NOW, USERS);
    expect((await managersAuditLine(COMPANY, later(1), USERS)).notKnown).toEqual([AUDIT_PARTS.cut]);
    expect(sent()).toBe(6);
  });

  it("sends its statements through the limiter of the answer it is read for", async () => {
    let running = 0;
    let peak = 0;
    const slow = async () => {
      peak = Math.max(peak, ++running);
      await new Promise((done) => setTimeout(done, 1));
      running -= 1;
      return [];
    };
    for (const read of reads()) read.mockImplementation(slow);
    await managersAuditLine(COMPANY, NOW, USERS, readLimiter(2));
    expect(sent()).toBe(6);
    expect(peak).toBe(2);
  });

  it("never answers the rows behind a count from memory", async () => {
    history.changesSince.mockResolvedValue([change("deletedAt", null, "2026-11-16T10:00:00.000Z")]);
    await managersAuditLine(COMPANY, NOW, USERS);
    await managersAuditRows(COMPANY, "deleted", NOW, USERS);
    await managersAuditRows(COMPANY, "deleted", NOW, USERS);
    expect(history.changesSince).toHaveBeenCalledTimes(3);
  });
});

describe("the rows behind a count", () => {
  it("reads only that figure's part - of the history only its fields - and lists its rows, the newest first", async () => {
    history.changesSince.mockResolvedValue([
      change("deletedAt", null, "2026-11-17T08:00:00.000Z", { shipmentId: "id-2", jobNumber: "CZ00000002", changedAt: at("2026-11-17", "09:00") }),
      change("deletedAt", null, "2026-11-16T10:00:00.000Z"),
    ]);
    const list = await managersAuditRows(COMPANY, "deleted", NOW, USERS);
    expect(history.changesSince).toHaveBeenCalledWith(COMPANY, SINCE, { fields: ["deletedAt"], fieldPrefixes: [], turnedInto: [] }, AUDIT_READ_LIMIT + 1);
    for (const read of [overrides.listSince, attachments.ownApprovalsSince, documentRequests.decidedSince, officeRequests.decidedSince, releaseRequests.decidedSince]) expect(read).not.toHaveBeenCalled();
    expect(list).toEqual({
      rows: [
        { shipmentId: "id-2", jobNumber: "CZ00000002", who: "boss@firma.cz", at: "2026-11-17T08:00:00.000Z", what: "Job deleted" },
        { shipmentId: "id-1", jobNumber: "CZ00000001", who: "boss@firma.cz", at: "2026-11-16T10:00:00.000Z", what: "Job deleted" },
      ],
      capped: false,
    });
  });

  it("lists the credit checks of the approver's own jobs only, from the credit changes read with the changes of Handled By", async () => {
    history.changesSince.mockResolvedValue([
      change("personInCharge", "jan@firma.cz", "eva@firma.cz", { changedAt: at("2026-11-17") }),
      change("creditCheck", "Red", "Green", { userId: "u-jan", personInCharge: "eva@firma.cz", changedAt: at("2026-11-16") }),
      change("creditCheck", "Red", "Green", { shipmentId: "id-2", jobNumber: "CZ00000002", userId: "u-boss" }),
    ]);
    const list = await managersAuditRows(COMPANY, "own_credit_check", NOW, USERS);
    expect(history.changesSince).toHaveBeenCalledWith(COMPANY, SINCE, { fields: ["creditCheck", "personInCharge"], fieldPrefixes: [], turnedInto: [] }, AUDIT_READ_LIMIT + 1);
    expect(list.rows).toEqual([{ shipmentId: "id-1", jobNumber: "CZ00000001", who: "jan@firma.cz", at: at("2026-11-16").toISOString(), what: "Credit Check Red → Green, by the job's own Handled By" }]);
  });

  it("reads each of the other figures from its own table", async () => {
    overrides.listSince.mockResolvedValue([{ shipmentId: "id-1", jobNumber: "CZ00000001", kind: "warehouse_released", reason: "Pays on Friday", checked: false, by: "boss@firma.cz", createdAt: at("2026-11-16") }]);
    expect((await managersAuditRows(COMPANY, "prepayment_release", NOW, USERS)).rows.map((r) => [r.who, r.what])).toEqual([["boss@firma.cz", "Warehouse Released set on prepayment, payment not checked · Pays on Friday"]]);
    expect(history.changesSince).not.toHaveBeenCalled();

    attachments.ownApprovalsSince.mockResolvedValue([{ shipmentId: "id-1", jobNumber: "CZ00000001", fileName: "invoice.pdf", documentType: "Invoice", reviewedById: "u-boss", reviewedAt: at("2026-11-16") }]);
    expect((await managersAuditRows(COMPANY, "own_document_approval", NOW, USERS)).rows.map((r) => [r.who, r.what])).toEqual([["boss@firma.cz", "Approved for customs their own upload · Invoice · invoice.pdf"]]);

    documentRequests.decidedSince.mockResolvedValue([documentRequest("rejected", { comment: "Keep the approved one", decidedAt: at("2026-11-17") })]);
    officeRequests.decidedSince.mockResolvedValue([officeRequest("approved")]);
    expect((await managersAuditRows(COMPANY, "requests_decided", NOW, USERS)).rows.map((r) => [r.who, r.what])).toEqual([
      ["Boss", "Change of an approved document (Invoice) · rejected: Keep the approved one"],
      ["Boss", "Customs Office CZ510201 → CZ510202 · approved"],
    ]);
    expect(releaseRequests.decidedSince).not.toHaveBeenCalled();
  });

  it("looks the job numbers of the release requests up - a deleted job's too - for they come without", async () => {
    releaseRequests.decidedSince.mockResolvedValue([
      { id: "r-1", shipmentId: "id-1", status: "approved", decidedAt: at("2026-11-17"), decidedByName: "Boss", what: "house_bol", comment: "The customer pays on Friday" },
      { id: "r-2", shipmentId: "id-1", status: "rejected", decidedAt: at("2026-11-16"), decidedByName: "Boss", what: "warehouse", comment: "Not before the payment" },
      // Decided is decided: a request with no time of its answer is none.
      { id: "r-3", shipmentId: "id-2", status: "approved", decidedAt: null, decidedByName: "", what: "house_bol", comment: "" },
      // Closed by a release made another way: nobody's answer.
      { id: "r-4", shipmentId: "id-3", status: "closed", decidedAt: at("2026-11-16"), decidedByName: "", what: "house_bol", comment: "" },
    ]);
    shipments.jobNumbersByIds.mockResolvedValue(new Map([["id-1", "CZ00000001"]]));
    const list = await managersAuditRows(COMPANY, "release_requests_decided", NOW, USERS);
    expect(releaseRequests.decidedSince).toHaveBeenCalledWith(COMPANY, SINCE, AUDIT_READ_LIMIT + 1);
    expect(shipments.jobNumbersByIds).toHaveBeenCalledWith(COMPANY, ["id-1", "id-2"]);
    // With the manager's own words.
    expect(list.rows.map((r) => [r.jobNumber, r.who, r.what])).toEqual([
      ["CZ00000001", "Boss", "Release of the House BoL on prepayment · approved: The customer pays on Friday"],
      ["CZ00000001", "Boss", "Warehouse Released on prepayment · rejected: Not before the payment"],
    ]);
  });

  it("still lists the rows without the users, their \"who\" empty - but not the credit checks, which hang on who is who", async () => {
    history.changesSince.mockResolvedValue([change("deletedAt", null, "2026-11-16T10:00:00.000Z")]);
    expect((await managersAuditRows(COMPANY, "deleted", NOW, null)).rows.map((r) => r.who)).toEqual([""]);
    await expect(managersAuditRows(COMPANY, "own_credit_check", NOW, null)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("names who is not among the company's users - a superadmin working as the company, the app's own identity - by looking them up (m18)", async () => {
    history.changesSince.mockResolvedValue([
      change("deletedAt", null, "x", { userId: "u-super" }),
      change("deletedAt", null, "x", { shipmentId: "id-2", userId: "u-system", changedAt: at("2026-11-15") }),
      change("deletedAt", null, "x", { shipmentId: "id-3", userId: "u-gone", changedAt: at("2026-11-14") }),
      change("deletedAt", null, "x", { shipmentId: "id-4", changedAt: at("2026-11-13") }),
    ]);
    clients.auth.userLookup.mockResolvedValue({
      users: [
        { id: "u-super", name: "Super Admin", email: "Super@Home.cz", role: "superadmin", homeCompanyId: "home" },
        { id: "u-system", name: "Trucking (system)", email: "trucking-system+c1@system.invalid", role: "user" },
      ],
    });
    const list = await managersAuditRows(COMPANY, "deleted", NOW, USERS);
    // Only the ids the company's users did not name are looked up - among the superadmins too, as the job's History tab does.
    expect(clients.auth.userLookup).toHaveBeenCalledExactlyOnceWith({ ids: ["u-super", "u-system", "u-gone"], orSuperadmin: true });
    expect(list.rows.map((r) => [r.shipmentId, r.who])).toEqual([
      ["id-1", "super@home.cz"],
      ["id-2", "Trucking (system)"],
      ["id-3", ""],
      ["id-4", "boss@firma.cz"],
    ]);
  });

  it("lists the rows all the same when that look-up fails, the others unnamed - and asks nothing when everybody is known", async () => {
    history.changesSince.mockResolvedValue([change("deletedAt", null, "x", { userId: "u-super" }), change("deletedAt", null, "x", { shipmentId: "id-2", changedAt: at("2026-11-15") })]);
    clients.auth.userLookup.mockRejectedValue(new Error("auth is down"));
    expect((await managersAuditRows(COMPANY, "deleted", NOW, USERS)).rows.map((r) => r.who)).toEqual(["", "boss@firma.cz"]);
    clients.auth.userLookup.mockClear();
    history.changesSince.mockResolvedValue([change("deletedAt", null, "x")]);
    await managersAuditRows(COMPANY, "deleted", NOW, USERS);
    expect(clients.auth.userLookup).not.toHaveBeenCalled();
    // Without the company's users nobody is looked up: nobody is named.
    await managersAuditRows(COMPANY, "deleted", NOW, null);
    expect(clients.auth.userLookup).not.toHaveBeenCalled();
  });

  it("says when there were more than it lists, and when its read was cut", async () => {
    history.changesSince.mockResolvedValue(Array.from({ length: 201 }, (_, i) => change("deletedAt", null, "x", { shipmentId: `id-${i}`, changedAt: new Date(NOW.getTime() - i * 60_000) })));
    const list = await managersAuditRows(COMPANY, "deleted", NOW, USERS);
    expect(list.rows).toHaveLength(200);
    expect(list.rows[0]!.shipmentId).toBe("id-0");
    expect(list.capped).toBe(true);
    // A read that hit its own limit: among the rows of this kind there may be more.
    history.changesSince.mockResolvedValue([...Array.from({ length: AUDIT_READ_LIMIT }, () => change("personInCharge", "a@firma.cz", "b@firma.cz")), change("creditCheck", "Red", "Green", { userId: "u-jan" })]);
    expect((await managersAuditRows(COMPANY, "own_credit_check", NOW, USERS)).capped).toBe(true);
  });

  it("answers \"try again\" when its read fails - never an empty list", async () => {
    history.changesSince.mockRejectedValue(new Error("the history could not be read"));
    await expect(managersAuditRows(COMPANY, "deleted", NOW, USERS)).rejects.toMatchObject({ code: "unavailable", message: "The audit rows could not be read just now: try again in a moment" });
  });
});
