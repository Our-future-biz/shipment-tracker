import { beforeEach, describe, expect, it, vi } from "vitest";

// Who wrote a chat message, uploaded a document or reviewed it for customs is shown by name, the e-mail
// for a user with none (user council x4, mock test of 21 Nov) - and so is everybody the bell and the job's
// other tabs name beside them (review of system-22). The services run for real against stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn(), userLookup: vi.fn() }, invoicing: {} }));
vi.mock("../repositories/shipmentAttachment.repository", () => ({
  shipmentAttachmentRepository: { listByShipmentId: vi.fn(), listChatFilesByShipmentId: vi.fn(async () => []), customsVerdictsFor: vi.fn() },
}));
vi.mock("../repositories/shipmentComment.repository", () => ({
  shipmentCommentRepository: { listByShipmentId: vi.fn(), lastReadByOthers: vi.fn(async () => null) },
}));
vi.mock("../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: {} }));
vi.mock("../repositories/shipmentAlertRead.repository", () => ({ shipmentAlertReadRepository: {} }));
vi.mock("../repositories/coverBell.repository", () => ({ coverBellRepository: { assignments: vi.fn(), openNotes: vi.fn() } }));
vi.mock("../repositories/masterJobDocument.repository", () => ({ masterJobDocumentRepository: { listByMasterJobId: vi.fn() } }));
vi.mock("../repositories/masterJob.repository", () => ({ masterJobRepository: { getByIdForCompany: vi.fn() } }));
vi.mock("../repositories/shipment.repository", () => ({ shipmentRepository: { getByIdForCompany: vi.fn() } }));
vi.mock("../repositories/shipmentCustomerLink.repository", () => ({ shipmentCustomerLinkRepository: { liveOf: vi.fn() } }));
vi.mock("../repositories/container.repository", () => ({ containerRepository: {} }));
vi.mock("../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: {} }));
vi.mock("../storage/attachmentBucket", () => ({ attachmentBucket: {} }));
vi.mock("../storage/masterJobDocumentBucket", () => ({ masterJobDocumentBucket: {} }));
vi.mock("../lib/contentToken", () => ({
  attachmentContentUrl: vi.fn(() => "url"),
  companyOfContentToken: vi.fn(),
  masterJobDocumentContentUrl: vi.fn(() => "url"),
  companyOfMasterJobDocumentToken: vi.fn(),
}));
vi.mock("../../../lib/outbox/serviceIdentity", () => ({ serviceActor: vi.fn() }));
vi.mock("../services/tracking.service", () => ({ TRACKING_EVENTS_LIMIT: 500 }));
vi.mock("../services/shipment.service", () => ({ shipmentService: { requireLive: vi.fn() } }));

import { auth } from "~encore/clients";
import { coverBellRepository } from "../repositories/coverBell.repository";
import { masterJobDocumentRepository } from "../repositories/masterJobDocument.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { shipmentCustomerLinkRepository } from "../repositories/shipmentCustomerLink.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { alertService } from "../services/alert.service";
import { attachmentService } from "../services/attachment.service";
import { commentService } from "../services/comment.service";
import { coverBellService } from "../services/coverBell.service";
import { customerLinkService } from "../services/customerLink.service";
import { masterJobDocumentService } from "../services/masterJobDocument.service";
import { userNames } from "../../../lib/userNames";

const JAN = { id: "u-jan", email: "Jan@Firma.cz", displayName: "Jan Novák" };
const EVA = { id: "u-eva", email: "eva@firma.cz", displayName: "Eva Malá" };
const AT = new Date("2026-10-26T08:00:00Z");
const MJ = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.usersList).mockResolvedValue({ users: [JAN, EVA] } as never);
  // The signed-in user: their e-mail finds the shipments the bell is about.
  vi.mocked(auth.userLookup).mockResolvedValue({ users: [{ id: "u-jan", name: "Jan Novák", email: "jan@firma.cz", role: "user" }] } as never);
});

describe("userNames", () => {
  it("maps each user of the company to their name, the e-mail for one with none", async () => {
    vi.mocked(auth.usersList).mockResolvedValue({ users: [JAN, { ...EVA, displayName: "" }] } as never);
    await expect(userNames()).resolves.toEqual(new Map([["u-jan", "Jan Novák"], ["u-eva", "eva@firma.cz"]]));
  });

  it("gives an empty map when the users can't be read, so the list still loads", async () => {
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    await expect(userNames()).resolves.toEqual(new Map());
  });
});

describe("documents", () => {
  it("name the uploader and the customs reviewer by name", async () => {
    const row = { id: "a1", shipmentId: "s1", companyId: "c1", fileName: "inv.pdf", fileSize: 1, fileType: "application/pdf", createdAt: AT, documentType: "", customsStatus: "approved", customsNote: "", customsReviewedAt: AT };
    vi.mocked(shipmentAttachmentRepository.listByShipmentId).mockResolvedValue([
      { ...row, uploadedById: "u-jan", customsReviewedById: "u-eva" },
      { ...row, id: "a2", uploadedById: "u-gone", customsReviewedById: null },
    ] as never);
    const items = await attachmentService.list("s1", "c1");
    expect(items.map((i) => [i.uploadedByName, i.customsReviewedByName])).toEqual([
      ["Jan Novák", "Eva Malá"],
      ["Unknown", ""],
    ]);
  });

  // Mock test S19-175: the page told the user's own upload by comparing this name with their e-mail, so
  // it never matched once the name was a name. The uploader's id comes along for that.
  it("carry the uploader's id beside the name, null when nobody is recorded", async () => {
    const row = { id: "a1", shipmentId: "s1", companyId: "c1", fileName: "inv.pdf", fileSize: 1, fileType: "application/pdf", createdAt: AT, documentType: "", customsStatus: "", customsNote: "", customsReviewedAt: null, customsReviewedById: null };
    vi.mocked(shipmentAttachmentRepository.listByShipmentId).mockResolvedValue([
      { ...row, uploadedById: "u-jan" },
      { ...row, id: "a2", uploadedById: null },
    ] as never);
    const items = await attachmentService.list("s1", "c1");
    expect(items.map((i) => [i.uploadedById, i.uploadedByName])).toEqual([
      ["u-jan", "Jan Novák"],
      [null, "Unknown"],
    ]);
  });
});

describe("chat messages", () => {
  it("name their author by name", async () => {
    vi.mocked(shipmentCommentRepository.listByShipmentId).mockResolvedValue([
      { id: "m1", shipmentId: "s1", companyId: "c1", authorId: "u-jan", message: "hi", createdAt: AT },
      { id: "m2", shipmentId: "s1", companyId: "c1", authorId: "u-gone", message: "hello", createdAt: AT },
    ] as never);
    const items = await commentService.list("s1", "c1", "u-eva");
    expect(items.map((i) => i.authorName)).toEqual(["Jan Novák", ""]);
  });

  it("name an author with no name of their own by e-mail", async () => {
    vi.mocked(auth.usersList).mockResolvedValue({ users: [{ ...JAN, displayName: "" }] } as never);
    vi.mocked(shipmentCommentRepository.listByShipmentId).mockResolvedValue([
      { id: "m1", shipmentId: "s1", companyId: "c1", authorId: "u-jan", message: "hi", createdAt: AT },
    ] as never);
    const items = await commentService.list("s1", "c1", "u-eva");
    expect(items.map((i) => i.authorName)).toEqual(["Jan@Firma.cz"]);
  });
});

// Review of system-22: the tabs above said "Eva Malá" while the bell and the job's other tabs still said
// "eva@firma.cz" for the same person.
describe("the bell", () => {
  it("names who gave customs' verdict by name, as the Customs tab does; nobody known is \"\"", async () => {
    const verdict = { shipmentId: "s1", jobNumber: "CZ1", fileName: "inv.pdf", documentType: "Commercial Invoice", status: "approved", note: "", reviewedAt: AT, readAt: null };
    vi.mocked(shipmentAttachmentRepository.customsVerdictsFor).mockResolvedValue([
      { ...verdict, id: "a1", reviewedById: "u-eva" },
      { ...verdict, id: "a2", reviewedById: "u-gone" },
      { ...verdict, id: "a3", reviewedById: null },
    ] as never);
    const notices = await alertService.customsVerdicts("c1", "u-jan", AT.getTime());
    expect(notices.map((n) => n.reviewedByName)).toEqual(["Eva Malá", "", ""]);
  });

  it("names who made the user cover a shipment by name; nobody known is \"\"", async () => {
    const change = { jobNumber: "CZ1", field: "personInCharge", oldValue: "", newValue: "jan@firma.cz", personInCharge: "jan@firma.cz", holidayCover: "", readAt: null };
    vi.mocked(coverBellRepository.assignments).mockResolvedValue([
      { ...change, shipmentId: "s1", userId: "u-eva", changedAt: new Date(AT.getTime() + 1000) },
      { ...change, shipmentId: "s2", userId: "u-gone", changedAt: AT },
    ]);
    vi.mocked(coverBellRepository.openNotes).mockResolvedValue([
      { shipmentId: "s1", text: "Call the carrier" },
      { shipmentId: "s2", text: "Send the invoice" },
    ]);
    const notices = await coverBellService.forMe("c1", "u-jan", AT.getTime());
    expect(notices.map((n) => [n.shipmentId, n.by])).toEqual([
      ["s1", "Eva Malá"],
      ["s2", ""],
    ]);
  });
});

describe("a master job's documents", () => {
  it("name the uploader by name, as a shipment's Documents tab does; \"Unknown\" when nobody can be told", async () => {
    vi.mocked(masterJobRepository.getByIdForCompany).mockResolvedValue({ id: MJ } as never);
    const row = { masterJobId: MJ, companyId: "c1", fileName: "MBL.pdf", fileSize: 1, fileType: "application/pdf", storageKey: "k", createdAt: AT, documentType: "Bill of Lading" };
    vi.mocked(masterJobDocumentRepository.listByMasterJobId).mockResolvedValue([
      { ...row, id: "d1", uploadedById: "u-eva" },
      { ...row, id: "d2", uploadedById: "u-gone" },
      { ...row, id: "d3", uploadedById: null },
    ] as never);
    const items = await masterJobDocumentService.list(MJ, "c1");
    expect(items.map((i) => i.uploadedByName)).toEqual(["Eva Malá", "Unknown", "Unknown"]);
  });
});

describe("the customer link", () => {
  const link = { id: "l1", createdAt: AT, lastOpenedAt: null };
  beforeEach(() => {
    vi.mocked(shipmentRepository.getByIdForCompany).mockResolvedValue({ id: "s1", status: "Booked", actualDeliveryDate: null } as never);
  });

  it("names who made it by name, as the Tracking tab's timeline beside it does; nobody known is \"\"", async () => {
    vi.mocked(shipmentCustomerLinkRepository.liveOf).mockResolvedValue({ ...link, createdById: "u-eva" } as never);
    await expect(customerLinkService.get("s1", "c1", AT)).resolves.toMatchObject({ createdBy: "Eva Malá" });
    vi.mocked(shipmentCustomerLinkRepository.liveOf).mockResolvedValue({ ...link, createdById: "u-gone" } as never);
    await expect(customerLinkService.get("s1", "c1", AT)).resolves.toMatchObject({ createdBy: "" });
  });

  it("names a maker with no name of their own by e-mail", async () => {
    vi.mocked(auth.usersList).mockResolvedValue({ users: [{ ...EVA, displayName: "" }] } as never);
    vi.mocked(shipmentCustomerLinkRepository.liveOf).mockResolvedValue({ ...link, createdById: "u-eva" } as never);
    await expect(customerLinkService.get("s1", "c1", AT)).resolves.toMatchObject({ createdBy: "eva@firma.cz" });
  });
});
