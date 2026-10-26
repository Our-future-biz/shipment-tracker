import { describe, expect, it } from "vitest";
import type { SalesQuoteRecord } from "../../schemas/quote.schema";
import { toItem } from "../../utils/salesQuoteItem.utils";

// 10 October 2026, noon in Prague.
const NOW = new Date("2026-10-10T10:00:00.000Z");
const SENT = new Date("2026-10-01T08:00:00.000Z");

const row = (over: Partial<SalesQuoteRecord> = {}): SalesQuoteRecord => ({
  id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
  companyId: "86f202b1-7449-441b-9c5b-5bf4d89f8d88",
  quoteNumber: "QCZ20261010001",
  data: { reference: "QCZ20261010001", quoteStatus: "draft", origin: "Praha" },
  terms: "Net 30",
  createdAt: new Date("2026-09-15T08:00:00.123Z"),
  updatedAt: new Date("2026-10-02T09:30:00.456Z"),
  deletedAt: null,
  status: "draft",
  substatus: null,
  lostReason: null,
  lostComment: null,
  sentAt: null,
  firstSentAt: null,
  decidedAt: null,
  validUntil: null,
  lastContactAt: null,
  ownerUserId: null,
  ownerLabel: "",
  ownerMatchCheckedAt: null,
  shipmentId: null,
  shipmentJobNumber: null,
  deletedBy: null,
  dataVersion: 1,
  customerId: null,
  ...over,
});

// The users' e-mails by id: a person is shown by e-mail.
const emails = new Map([
  ["user-1", "martin@forwarder.cz"],
  ["user-2", "jana@forwarder.cz"],
]);
const manager = { userID: "user-9", role: "manager" };
const martin = { userID: "user-1", role: "user" };

describe("toItem", () => {
  it("hands out the document, the row's own facts and the version of the document", () => {
    const item = toItem(row({ dataVersion: 7, customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30" }), emails, manager, NOW);
    expect(item).toMatchObject({
      id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
      quoteNumber: "QCZ20261010001",
      data: { reference: "QCZ20261010001", quoteStatus: "draft", origin: "Praha" },
      terms: "Net 30",
      createdAt: "2026-09-15T08:00:00.123Z",
      updatedAt: "2026-10-02T09:30:00.456Z",
      dataVersion: 7,
      customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30",
    });
  });

  it("carries the whole item of a new Draft", () => {
    expect(toItem(row({ ownerUserId: "user-1", ownerLabel: "martin@forwarder.cz" }), emails, martin, NOW)).toEqual({
      id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
      quoteNumber: "QCZ20261010001",
      data: { reference: "QCZ20261010001", quoteStatus: "draft", origin: "Praha" },
      terms: "Net 30",
      createdAt: "2026-09-15T08:00:00.123Z",
      updatedAt: "2026-10-02T09:30:00.456Z",
      dataVersion: 1,
      status: "draft",
      effectiveStatus: "draft",
      allowedTransitions: ["ready_to_send", "quoted", "lost"],
      substatus: null,
      lostReason: null,
      lostComment: null,
      customerId: null,
      sentAt: null,
      firstSentAt: null,
      decidedAt: null,
      validUntil: null,
      lastContactAt: null,
      followUpDue: false,
      ownerUserId: "user-1",
      ownerName: "martin@forwarder.cz",
      ownerLabel: "martin@forwarder.cz",
      shipmentId: null,
      shipmentJobNumber: null,
      roadMargin: null,
      permissions: { canChangeOwner: "own", canDelete: true, canApproveMargin: false },
    });
  });

  it("gives times as ISO strings and the validity as a day", () => {
    const item = toItem(
      row({ status: "lost", sentAt: SENT, firstSentAt: SENT, decidedAt: new Date("2026-10-05T08:00:00.000Z"), validUntil: "2026-10-16", lostReason: "Pricing: Price too high", lostComment: "too late" }),
      emails,
      manager,
      NOW,
    );
    expect(item).toMatchObject({
      status: "lost",
      effectiveStatus: "lost",
      allowedTransitions: ["draft"],
      sentAt: "2026-10-01T08:00:00.000Z",
      firstSentAt: "2026-10-01T08:00:00.000Z",
      decidedAt: "2026-10-05T08:00:00.000Z",
      validUntil: "2026-10-16",
      lostReason: "Pricing: Price too high",
      lostComment: "too late",
    });
  });

  describe("a Quoted quote whose validity has passed", () => {
    const expired = row({ status: "quoted", sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT, validUntil: "2026-10-09" });

    it("shows as Expired, keeps its stored status and offers only the ways out", () => {
      expect(toItem(expired, emails, manager, NOW)).toMatchObject({
        status: "quoted",
        effectiveStatus: "expired",
        allowedTransitions: ["draft", "revised"],
        followUpDue: false,
      });
    });

    it("is still Quoted through its last day - which ends at midnight in Prague, not in UTC", () => {
      const lastDay = row({ status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: "2026-10-10" });
      expect(toItem(lastDay, emails, manager, new Date("2026-10-10T21:59:00.000Z")).effectiveStatus).toBe("quoted");
      expect(toItem(lastDay, emails, manager, new Date("2026-10-10T22:00:00.000Z")).effectiveStatus).toBe("expired");
    });
  });

  describe("the follow-up", () => {
    it("is due once the last contact is three days old, and says when that contact was", () => {
      const waiting = row({ status: "quoted", sentAt: SENT, firstSentAt: SENT, lastContactAt: new Date("2026-10-07T10:00:00.000Z") });
      expect(toItem(waiting, emails, manager, NOW)).toMatchObject({ followUpDue: true, lastContactAt: "2026-10-07T10:00:00.000Z" });
      const fresh = row({ status: "quoted", sentAt: SENT, firstSentAt: SENT, lastContactAt: new Date("2026-10-07T10:00:00.001Z") });
      expect(toItem(fresh, emails, manager, NOW).followUpDue).toBe(false);
    });

    it("counts from the sending when no contact was recorded", () => {
      expect(toItem(row({ status: "feedback", sentAt: SENT }), emails, manager, NOW)).toMatchObject({
        followUpDue: true,
        lastContactAt: "2026-10-01T08:00:00.000Z",
      });
    });
  });

  it("offers Won on an open quote that has a shipment", () => {
    const linked = toItem(row({ shipmentId: "5f0c1c5e-3a0d-4d0e-9a39-7c2a4b1d9e10", shipmentJobNumber: "CZ2610001" }), emails, manager, NOW);
    expect(linked.allowedTransitions).toEqual(["ready_to_send", "quoted", "lost", "won"]);
    expect(linked).toMatchObject({ shipmentId: "5f0c1c5e-3a0d-4d0e-9a39-7c2a4b1d9e10", shipmentJobNumber: "CZ2610001" });
  });

  describe("the owner", () => {
    it("shows under the user's current e-mail, next to the label as stored", () => {
      expect(toItem(row({ ownerUserId: "user-1", ownerLabel: "Martin" }), emails, manager, NOW)).toMatchObject({
        ownerUserId: "user-1",
        ownerName: "martin@forwarder.cz",
        ownerLabel: "Martin",
      });
    });

    it("shows as the stored label when it is not linked to a user", () => {
      expect(toItem(row({ ownerLabel: "Petr" }), emails, manager, NOW)).toMatchObject({ ownerUserId: null, ownerName: "Petr", ownerLabel: "Petr" });
    });

    it("falls back to the label when the user's e-mail cannot be resolved", () => {
      expect(toItem(row({ ownerUserId: "user-gone", ownerLabel: "Karel" }), emails, manager, NOW).ownerName).toBe("Karel");
      expect(toItem(row({ ownerUserId: "user-1", ownerLabel: "Martin" }), new Map(), manager, NOW).ownerName).toBe("Martin");
    });

    it("is nobody on a quote without one", () => {
      expect(toItem(row(), emails, manager, NOW)).toMatchObject({ ownerUserId: null, ownerName: "", ownerLabel: "" });
    });
  });

  describe("permissions", () => {
    const MANAGERS_ONLY = "only a manager can delete this quote";
    const SHIPMENT = { shipmentId: "5f0c1c5e-3a0d-4d0e-9a39-7c2a4b1d9e10", shipmentJobNumber: "CZ2610001" };
    const BLOCKED_BY_SHIPMENT = "shipment CZ2610001 was created from this quote - remove the Sales Reference from the shipment first";
    const permissions = (over: Partial<SalesQuoteRecord>, actor: { userID: string; role: string }) => toItem(row(over), emails, actor, NOW).permissions;

    it("lets a manager reassign and delete any quote", () => {
      for (const role of ["superadmin", "admin", "manager"]) {
        expect(permissions({ ownerUserId: "user-2", status: "quoted", sentAt: SENT, firstSentAt: SENT }, { userID: "user-9", role })).toEqual({
          canChangeOwner: "any",
          canDelete: true,
          canApproveMargin: true,
        });
      }
    });

    it("tells a plain user what they may do with the owner: hand over their own, take an unowned one, nothing else", () => {
      expect(permissions({ ownerUserId: "user-1" }, martin).canChangeOwner).toBe("own");
      expect(permissions({ ownerLabel: "Petr" }, martin).canChangeOwner).toBe("claim");
      expect(permissions({ ownerUserId: "user-2" }, martin).canChangeOwner).toBe("none");
    });

    it("lets a plain user delete their own Draft that was never sent - and says why not for anything else", () => {
      expect(permissions({ ownerUserId: "user-1" }, martin)).toEqual({ canChangeOwner: "own", canDelete: true, canApproveMargin: false });
      // A colleague's Draft, and one that belongs to no user until it is taken.
      expect(permissions({ ownerUserId: "user-2" }, martin)).toEqual({ canChangeOwner: "none", canDelete: false, deleteBlockedReason: MANAGERS_ONLY, canApproveMargin: false });
      expect(permissions({ ownerLabel: "Petr" }, martin)).toEqual({ canChangeOwner: "claim", canDelete: false, deleteBlockedReason: MANAGERS_ONLY, canApproveMargin: false });
      // Their own quote that is with the customer, and one that was and is a Draft again.
      expect(permissions({ ownerUserId: "user-1", status: "quoted", sentAt: SENT, firstSentAt: SENT }, martin)).toMatchObject({
        canDelete: false,
        deleteBlockedReason: MANAGERS_ONLY,
      });
      expect(permissions({ ownerUserId: "user-1", status: "draft", sentAt: SENT, firstSentAt: SENT }, martin)).toMatchObject({
        canDelete: false,
        deleteBlockedReason: MANAGERS_ONLY,
      });
    });

    it("reads from the history whether a Draft ever went out: one that left Quoted without a sent date is a manager's delete", () => {
      const history = (...timeline: Record<string, unknown>[]) => ({
        ownerUserId: "user-1",
        data: { reference: "QCZ20261010001", quoteStatus: "draft", timeline },
      });
      const at = SENT.toISOString();
      // Set to Quoted in bulk before sendings were dated, then Lost, then a Draft again.
      const reopened = history({ kind: "status", status: "lost", from: "quoted", at }, { kind: "status", status: "draft", at });
      expect(permissions(reopened, martin)).toEqual({ canChangeOwner: "own", canDelete: false, deleteBlockedReason: MANAGERS_ONLY, canApproveMargin: false });
      expect(permissions(reopened, manager).canDelete).toBe(true);
      // A Draft whose history shows no sending - also one a shipment had made Won for a while.
      const neverSent = history(
        { kind: "status", status: "draft", at },
        { kind: "status", status: "won", from: "draft", shipmentId: SHIPMENT.shipmentId, jobNumber: "CZ2610001", at },
        { kind: "status", status: "draft", shipmentId: SHIPMENT.shipmentId, jobNumber: "CZ2610001", at },
      );
      expect(permissions(neverSent, martin)).toEqual({ canChangeOwner: "own", canDelete: true, canApproveMargin: false });
      // A document that is no object has no history to read.
      expect(permissions({ ownerUserId: "user-1", data: [] }, martin).canDelete).toBe(true);
    });

    it("lets nobody delete a quote a shipment is linked to, and names the shipment", () => {
      expect(permissions({ ownerUserId: "user-1", ...SHIPMENT }, martin)).toMatchObject({ canDelete: false, deleteBlockedReason: BLOCKED_BY_SHIPMENT });
      expect(permissions({ ownerUserId: "user-1", ...SHIPMENT }, manager)).toEqual({
        canChangeOwner: "any",
        canDelete: false,
        deleteBlockedReason: BLOCKED_BY_SHIPMENT,
        canApproveMargin: true,
      });
    });

    it("judges the delete on the stored status: an expired quote is still the Quoted quote it is stored as", () => {
      const expired = { ownerUserId: "user-1", status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: "2026-10-09" };
      expect(permissions(expired, martin).canDelete).toBe(false);
      expect(permissions(expired, manager).canDelete).toBe(true);
    });

    it("carries no reason when the quote may be deleted", () => {
      expect(permissions({ ownerUserId: "user-1" }, martin)).not.toHaveProperty("deleteBlockedReason");
    });
  });
});
