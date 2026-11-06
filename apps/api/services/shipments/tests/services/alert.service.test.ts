import { beforeEach, describe, expect, it, vi } from "vitest";

const attachments = vi.hoisted(() => ({ customsVerdictsFor: vi.fn() }));
const lookup = vi.hoisted(() => ({ userEmailOf: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../../../lib/companyUsers", () => lookup);
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map([["r1", "customs@firma.cz"]]) }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: attachments }));
vi.mock("../../repositories/shipmentAlertRead.repository", () => ({ shipmentAlertReadRepository: {} }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: {} }));

import { alertService } from "../../services/alert.service";

const row = (over = {}) => ({
  id: "d1",
  shipmentId: "s1",
  jobNumber: "CZ1",
  fileName: "invoice.pdf",
  documentType: "Commercial Invoice",
  status: "declined",
  note: "Wrong value",
  reviewedAt: new Date("2026-11-06T10:00:00Z"),
  reviewedById: "r1",
  readAt: null as Date | null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  lookup.userEmailOf.mockResolvedValue(" Eva@Firma.cz ");
  attachments.customsVerdictsFor.mockResolvedValue([row()]);
});

describe("customs' verdicts under the bell", () => {
  const NOW = Date.parse("2026-11-06T12:00:00Z");

  it("looks up this user's shipments by their e-mail, 30 days back and 7 for what they have read", async () => {
    await alertService.customsVerdicts("c1", "u1", NOW);
    expect(attachments.customsVerdictsFor).toHaveBeenCalledWith("c1", "u1", "eva@firma.cz", new Date("2026-10-07T12:00:00Z"), new Date("2026-10-30T12:00:00Z"), 100);
  });

  it("says who reviewed what, with the reason of a decline", async () => {
    expect(await alertService.customsVerdicts("c1", "u1", NOW)).toEqual([
      {
        id: "d1",
        shipmentId: "s1",
        jobNumber: "CZ1",
        fileName: "invoice.pdf",
        documentType: "Commercial Invoice",
        status: "declined",
        note: "Wrong value",
        reviewedAt: "2026-11-06T10:00:00.000Z",
        reviewedByName: "customs@firma.cz",
        unread: true,
      },
    ]);
  });

  it("is new until the shipment's Alerts were opened after it", async () => {
    const at = (readAt: string) => row({ readAt: new Date(readAt) });
    attachments.customsVerdictsFor.mockResolvedValue([at("2026-11-06T09:00:00Z"), at("2026-11-06T11:00:00Z")]);
    expect((await alertService.customsVerdicts("c1", "u1", NOW)).map((v) => v.unread)).toEqual([true, false]);
  });

  it("tells an approval too", async () => {
    attachments.customsVerdictsFor.mockResolvedValue([row({ status: "approved", note: "" })]);
    expect((await alertService.customsVerdicts("c1", "u1", NOW))[0]?.status).toBe("approved");
  });

  it("has nothing for a user whose e-mail can't be looked up", async () => {
    lookup.userEmailOf.mockResolvedValue("");
    expect(await alertService.customsVerdicts("c1", "u1", NOW)).toEqual([]);
    expect(attachments.customsVerdictsFor).not.toHaveBeenCalled();
  });
});
