import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  raise: vi.fn(async (): Promise<{ id: string } | null> => ({ id: "alert-1" })),
  markEmailed: vi.fn(),
  adminContacts: vi.fn(),
  sendEmail: vi.fn(async (_msg: { to: string[] }) => ({ sent: false, error: "E-mail sending is disabled" })),
}));

vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { adminContacts: mocks.adminContacts } }));
vi.mock("../../../lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("../repositories/fxAlert.repository", () => ({ fxAlertRepository: { raise: mocks.raise, markEmailed: mocks.markEmailed } }));
vi.mock("../repositories/cnbRate.repository", () => ({ cnbRateRepository: { latestValidDate: vi.fn(async () => "2026-10-13") } }));

import { raiseMissingFixing, recipientGroups } from "../services/fxAlert.service";

const admins = [
  { email: "eva@alpha.cz", displayName: "Eva", companyId: "alpha", role: "admin" },
  { email: "jan@beta.cz", displayName: "Jan", companyId: "beta", role: "admin" },
  { email: "ida@alpha.cz", displayName: "Ida", companyId: "alpha", role: "admin" },
  { email: "root@platform.cz", displayName: "Root", companyId: "alpha", role: "superadmin" },
];

beforeEach(() => vi.clearAllMocks());

describe("the ČNB fixing-missing e-mail", () => {
  it("writes to each company's admins apart, and to the superadmins on their own", () => {
    expect(recipientGroups(admins)).toEqual([["eva@alpha.cz", "ida@alpha.cz"], ["jan@beta.cz"], ["root@platform.cz"]]);
  });

  it("sends one message per company, never one To list over every tenant", async () => {
    mocks.adminContacts.mockResolvedValueOnce({ admins });
    await raiseMissingFixing("2026-10-14", "ČNB had not published");
    const lists = mocks.sendEmail.mock.calls.map(([msg]) => msg.to);
    expect(lists).toEqual([["eva@alpha.cz", "ida@alpha.cz"], ["jan@beta.cz"], ["root@platform.cz"]]);
    // E-mail is off by default: the alert keeps why it was not sent, once.
    expect(mocks.markEmailed).toHaveBeenCalledWith("alert-1", false, "E-mail sending is disabled");
  });

  it("counts the alert e-mailed once any company was reached, keeping why the others were not", async () => {
    mocks.adminContacts.mockResolvedValueOnce({ admins });
    mocks.sendEmail
      .mockResolvedValueOnce({ sent: true, error: "" })
      .mockResolvedValueOnce({ sent: false, error: "The e-mail could not be sent" })
      .mockResolvedValueOnce({ sent: true, error: "" });
    await raiseMissingFixing("2026-10-14", "ČNB had not published");
    expect(mocks.markEmailed).toHaveBeenCalledWith("alert-1", true, "The e-mail could not be sent");
  });

  it("still records why nothing went out when the admins could not be read", async () => {
    mocks.adminContacts.mockRejectedValueOnce(new Error("auth is down"));
    mocks.sendEmail.mockResolvedValueOnce({ sent: false, error: "No recipients" });
    await raiseMissingFixing("2026-10-14", "ČNB had not published");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toEqual([]);
    expect(mocks.markEmailed).toHaveBeenCalledWith("alert-1", false, "No recipients");
  });

  it("does nothing for a day already reported", async () => {
    mocks.raise.mockResolvedValueOnce(null);
    await raiseMissingFixing("2026-10-14", "again");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
