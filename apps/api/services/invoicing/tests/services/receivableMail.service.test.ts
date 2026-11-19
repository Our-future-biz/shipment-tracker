import { beforeEach, describe, expect, it, vi } from "vitest";

// Accounts Receivable step 7 run for real - the automatic reminders, the statement's file and send, the mail log -
// against stand-ins for the repositories, the provider (lib/email: never called for real), the customers service
// and the users. E-mail from the app is switched off in the app itself; here the switch is turned per test.

const mail = vi.hoisted(() => ({
  configured: false,
  result: { sent: true, error: "", providerId: "em_1" } as { sent: boolean; error: string; providerId: string; timedOut?: boolean },
  calls: [] as { to: string[]; replyTo?: string; subject: string; text: string; attachments: { filename: string; content: string }[]; idempotencyKey: string }[],
}));
vi.mock("../../../../lib/email", () => ({
  EMAIL_DISABLED: "E-mail sending is disabled",
  emailConfigured: () => mail.configured,
  sendMail: vi.fn(async (m: (typeof mail.calls)[number]) => {
    mail.calls.push(m);
    return mail.result;
  }),
}));

// The mail rows, kept in memory with their unique idempotency key per company (as the database's index does).
const store = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], companies: [] as string[] }));
const mails = vi.hoisted(() => ({
  byKey: vi.fn(async (companyId: string, key: string) => store.rows.find((r) => r.companyId === companyId && r.idempotencyKey === key) ?? null),
  claim: vi.fn(async (values: Record<string, unknown>) => {
    if (values.idempotencyKey && store.rows.some((r) => r.companyId === values.companyId && r.idempotencyKey === values.idempotencyKey)) return null;
    const row = { id: `mail-${store.rows.length + 1}`, createdAt: new Date("2026-11-18T06:00:00Z"), providerId: "", ...values };
    store.rows.push(row);
    return row;
  }),
  markSent: vi.fn(async (companyId: string, id: string, providerId: string) => {
    const r = store.rows.find((x) => x.id === id && x.companyId === companyId)!;
    Object.assign(r, { status: "sent", providerId, error: "" });
  }),
  markFailed: vi.fn(async (companyId: string, id: string, error: string, key?: string) => {
    const r = store.rows.find((x) => x.id === id && x.companyId === companyId)!;
    Object.assign(r, { status: "failed", error, ...(key !== undefined ? { idempotencyKey: key } : {}) });
  }),
  list: vi.fn(async () => [...store.rows].reverse()),
  companiesWithAutoReminders: vi.fn(async () => store.companies),
}));
vi.mock("../../repositories/receivableMail.repository", () => ({ receivableMailRepository: mails }));

const TX = { tx: true };
const repo = vi.hoisted(() => ({
  figures: vi.fn(),
  figuresOne: vi.fn(),
  chase: vi.fn(),
  addNote: vi.fn(),
  settingsOf: vi.fn(),
  setAutoRemindersSinceIfMissing: vi.fn(async () => true),
  noteRemindersSkipped: vi.fn(async () => undefined),
  clearRemindersSkipped: vi.fn(async () => undefined),
}));
vi.mock("../../repositories/receivable.repository", () => ({ receivableRepository: repo }));
const profiles = vi.hoisted(() => ({ getByCompany: vi.fn() }));
vi.mock("../../repositories/invoiceProfile.repository", () => ({ invoiceProfileRepository: profiles }));
const invoices = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: invoices }));
const documents = vi.hoisted(() => ({ pdf: vi.fn() }));
vi.mock("../../services/invoiceDocument.service", () => ({ invoiceDocumentService: documents }));
const receivables = vi.hoisted(() => ({ rowsOfCustomer: vi.fn() }));
vi.mock("../../services/receivable.service", async () => {
  const { receivableStateOf } = await import("../../lib/receivables");
  return {
    receivableService: receivables,
    // The page's own rule (receivable.service receivableStateOfFigures), on the figures given.
    receivableStateOfFigures: (f: { invoice: { status: string; gross: string; dueDate: string; customer?: { paymentTerms?: string } }; credited: number; paid: number; receivable: { promisedOn: string | null; disputed: boolean; reminderLevel: number } | null }, today: string) =>
      receivableStateOf(
        {
          invoiceStatus: f.invoice.status,
          gross: Number(f.invoice.gross),
          credited: f.credited,
          paid: f.paid,
          dueDate: f.invoice.dueDate,
          paymentTerms: f.invoice.customer?.paymentTerms ?? "",
          promisedOn: f.receivable?.promisedOn ?? null,
          disputed: f.receivable?.disputed ?? false,
          reminderLevel: f.receivable?.reminderLevel ?? 0,
          customerListFailed: false,
        },
        today,
      ),
  };
});
const clients = vi.hoisted(() => ({ receivableFacts: vi.fn(), czHolidays: vi.fn() }));
vi.mock("~encore/clients", () => ({
  customers: { _internalCustomerReceivableFacts: clients.receivableFacts },
  holidays: { _internalHolidaysCzNational: clients.czHolidays },
}));
// The open bank entries: a payment that may be for an overdue invoice holds its reminder (X5).
const bank = vi.hoisted(() => ({
  openIncoming: vi.fn(),
  reopenedIncoming: vi.fn(async () => [] as unknown[]),
  takenBackKinds: vi.fn(async () => ({ takenBack: new Set<string>(), reversed: new Set<string>() })),
  lastImportAt: vi.fn(async () => null as Date | null),
}));
vi.mock("../../repositories/bankStatement.repository", () => ({ bankStatementRepository: bank }));
const users = vi.hoisted(() => ({ userEmailOf: vi.fn() }));
vi.mock("../../../../lib/companyUsers", () => users);
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import log from "encore.dev/log";
import { AUTOMATIC, EMAIL_OFF, NEVER_FINISHED, receivableMailService as service } from "../../services/receivableMail.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const CUSTOMER = "3f2b8c1a-0d4e-4c55-9a7b-1e2d3c4b5a69";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const NOW = new Date("2026-11-18T06:00:00Z");
const TODAY = "2026-11-18";

const manager = { userID: "u-boss", companyID: COMPANY, role: "manager" };
const clerk = { userID: "u-clerk", companyID: COMPANY, role: "user" };

const SETTINGS = { autoReminders: true, reminder1Days: 7, reminder2Days: 21, replyTo: "pohledavky@kun.cz", autoRemindersSince: "2026-01-01", updatedBy: "", updatedAt: null };

const supplier = {
  companyName: "Kůň s.r.o.",
  street: "Řeznická 12",
  city: "Praha 1",
  postalCode: "110 00",
  country: "CZ",
  ico: "27074358",
  dic: "CZ27074358",
  vatPayer: true,
  registerEntry: "",
  email: "ucetni@kun.cz",
  phone: "",
  web: "",
  logoData: "",
  footerNote: "",
  bankAccount: { currency: "EUR", bankName: "ČSOB", accountNumber: "", iban: "CZ6508000000192000145399", swift: "CEKOCZPP" },
};

const invoice = (over: Record<string, unknown> = {}) => ({
  id: INV,
  companyId: COMPANY,
  kind: "invoice",
  status: "issued",
  number: "INV2026CZ00000028-001",
  customerId: CUSTOMER,
  shipmentId: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01",
  issueDate: "2026-10-12",
  dueDate: "2026-11-11", // 7 days overdue today
  currency: "EUR",
  gross: "1210.00",
  customer: { customerId: CUSTOMER, companyName: "Gama s.r.o.", address: "Na Příkopě 1, Praha", city: "Praha", country: "CZ", ico: "12345678", dic: "", paymentTerms: "30 days" },
  shipment: { jobNumber: "CZ00000028", jobYear: 2026 },
  supplier,
  ...over,
});

const receivable = (over: Record<string, unknown> = {}) => ({
  id: "rec-1",
  invoiceId: INV,
  reminderLevel: 0,
  lastRemindedOn: null,
  disputed: false,
  promisedOn: null,
  carriedChecked: true,
  version: 1,
  ...over,
});

type Figures = ReturnType<typeof figures>;
const figures = (inv: Record<string, unknown> = {}, rec: Record<string, unknown> | null = {}, money: { credited?: number; paid?: number } = {}) => ({
  invoice: invoice(inv),
  credited: money.credited ?? 0,
  paid: money.paid ?? 0,
  writtenOff: 0,
  bankCharges: 0,
  waiting: 0,
  lastPaidOn: null,
  receivable: rec === null ? null : receivable(rec),
});

const contact = { name: "Eva Účetní", email: "ucetni@gama.cz", role: "Accounts payable" };
const facts = (over: Record<string, unknown> = {}) => ({
  customers: [{ id: CUSTOMER, companyName: "Gama s.r.o.", salesOwner: "", salesOwnerUserId: null, paymentTerms: "30 days", creditLimit: 0, currency: "EUR", reminderTo: contact, deleted: false, language: "en", ...over }],
});

/** The overdue invoices the run reads, and the same ones read again just before sending. */
function overdue(...list: Figures[]) {
  repo.figures.mockResolvedValue(list);
  repo.figuresOne.mockImplementation(async (_c: string, id: string) => list.find((f) => f.invoice.id === id) ?? null);
}

beforeEach(() => {
  vi.clearAllMocks();
  mail.configured = true;
  mail.result = { sent: true, error: "", providerId: "em_1" };
  mail.calls = [];
  store.rows = [];
  store.companies = [COMPANY];
  repo.settingsOf.mockResolvedValue(SETTINGS);
  repo.chase.mockImplementation(async (_c: string, _i: string, _values: unknown, _event: unknown, work?: (tx: unknown) => Promise<unknown>) => {
    if (work) await work(TX);
    return { id: "rec-1" };
  });
  repo.addNote.mockResolvedValue({ id: "note-1" });
  profiles.getByCompany.mockResolvedValue(null);
  documents.pdf.mockResolvedValue({ fileName: "INV2026CZ00000028-001.pdf", contentBase64: "JVBERi0=", sha256: "" });
  clients.receivableFacts.mockResolvedValue(facts());
  clients.czHolidays.mockResolvedValue({ dates: [] });
  bank.openIncoming.mockResolvedValue([]);
  users.userEmailOf.mockResolvedValue("boss@kun.cz");
});

describe("automatic reminders", () => {
  it("does nothing at all while e-mail from the app is switched off", async () => {
    mail.configured = false;
    overdue(figures());
    expect(await service.runReminders(NOW)).toEqual({ companies: 0, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    expect(mails.companiesWithAutoReminders).not.toHaveBeenCalled();
    expect(repo.figures).not.toHaveBeenCalled();
    expect(mail.calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
    expect(repo.chase).not.toHaveBeenCalled();
  });

  it("does nothing for a company whose settings say off", async () => {
    repo.settingsOf.mockResolvedValue({ ...SETTINGS, autoReminders: false });
    overdue(figures());
    expect(await service.runReminders(NOW)).toEqual({ companies: 0, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    expect(repo.figures).not.toHaveBeenCalled();
    expect(mail.calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it("sends reminder 1 at reminder1Days overdue and records it as a person's reminder, by the automatic run", async () => {
    overdue(figures());
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 1, failed: 0, skipped: 0, skippedCompanies: 0 });
    // Only what is due around or after the switch-on day (1 Jan) is read: 14 days earlier, for a due day moved past a weekend or holiday.
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { overdueOn: TODAY, dueFrom: "2025-12-18", remindable: true }, 2001);
    // The customers service is asked as the company (the run has no login).
    expect(clients.receivableFacts).toHaveBeenCalledWith({ ids: [CUSTOMER] }, { authData: expect.objectContaining({ companyID: COMPANY }) });
    expect(mail.calls).toHaveLength(1);
    const sent = mail.calls[0]!;
    expect(sent.to).toEqual(["ucetni@gama.cz"]);
    expect(sent.replyTo).toBe("pohledavky@kun.cz");
    expect(sent.idempotencyKey).toBe(`reminder:${INV}:1`);
    expect(sent.subject).toBe("Payment reminder: invoice INV2026CZ00000028-001 (job CZ00000028)");
    expect(sent.text).toContain("1 210.00 EUR");
    expect(sent.text).toContain("7 days overdue");
    expect(sent.text).toContain("CZ65 0800 0000 1920 0014 5399");
    expect(sent.text).toContain("The invoice is attached.");
    expect(sent.attachments).toEqual([{ filename: "INV2026CZ00000028-001.pdf", content: "JVBERi0=" }]);

    expect(store.rows).toEqual([
      expect.objectContaining({ kind: "reminder", invoiceId: INV, customerId: CUSTOMER, reminderLevel: 1, recipient: "ucetni@gama.cz", language: "en", status: "sent", providerId: "em_1", error: "", automatic: true, by: AUTOMATIC, idempotencyKey: `reminder:${INV}:1` }),
    ]);
    expect(repo.chase).toHaveBeenCalledWith(
      COMPANY,
      INV,
      { reminderLevel: 1, lastRemindedOn: TODAY },
      expect.objectContaining({ action: "reminded", by: AUTOMATIC, byUserId: null, payload: expect.objectContaining({ level: 1, recipient: "ucetni@gama.cz", automatic: true }) }),
      expect.any(Function),
    );
    expect(repo.addNote).toHaveBeenCalledWith(TX, expect.objectContaining({ companyId: COMPANY, invoiceId: INV, kind: "reminder", reminderLevel: 1, recipient: "ucetni@gama.cz", by: AUTOMATIC, byUserId: null }));
    // The mail row became sent in the note's own transaction.
    expect(mails.markSent).toHaveBeenCalledWith(COMPANY, "mail-1", "em_1", TX);
  });

  it("sends nothing before reminder1Days", async () => {
    overdue(figures({ dueDate: "2026-11-12" }));
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(0);
  });

  it("sends reminder 2 at reminder2Days, in the customer's language", async () => {
    clients.receivableFacts.mockResolvedValue(facts({ language: "cs" }));
    // Due 27 Oct (the 28th is a holiday: due on it, the reminders would count from the 29th).
    overdue(figures({ dueDate: "2026-10-27" }, { reminderLevel: 1, lastRemindedOn: "2026-11-04" }));
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
    expect(mail.calls[0]!.idempotencyKey).toBe(`reminder:${INV}:2`);
    expect(mail.calls[0]!.subject).toBe("Druhá upomínka: faktura INV2026CZ00000028-001 (zakázka CZ00000028)");
    expect(mail.calls[0]!.text).toContain("22 dní po splatnosti");
    expect(mail.calls[0]!.text).toContain("úrok z prodlení");
    expect(store.rows[0]).toMatchObject({ reminderLevel: 2, language: "cs", status: "sent" });
    expect(repo.chase).toHaveBeenCalledWith(COMPANY, INV, { reminderLevel: 2, lastRemindedOn: TODAY }, expect.anything(), expect.any(Function));
  });

  it("never sends the final notice", async () => {
    overdue(figures({ dueDate: "2026-08-01" }, { reminderLevel: 2, lastRemindedOn: "2026-09-01" }));
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 0 });
    expect(mail.calls).toHaveLength(0);
  });

  it("leaves out an invoice disputed, promised, to refund, or whose customer has no e-mail", async () => {
    const ids = ["5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b01", "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b02", "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b03"];
    overdue(
      figures({ id: ids[0] }, { disputed: true }),
      figures({ id: ids[1] }, { promisedOn: "2026-11-25" }),
      // Paid more than it was: to refund, not owed.
      figures({ id: ids[2] }, {}, { paid: 1300 }),
    );
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(0);

    clients.receivableFacts.mockResolvedValue(facts({ reminderTo: null }));
    overdue(figures());
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 1, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
    expect(repo.chase).not.toHaveBeenCalled();
  });

  it("sends none while a write-off waiting for a second manager covers what is left", async () => {
    overdue({ ...figures(), waiting: 1210 });
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(0);
    // One that covers only part of it: the reminder goes.
    overdue({ ...figures(), waiting: 200 });
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
  });

  it("waits with an invoice Accounts Receivable has not read yet (its old Paid not carried over)", async () => {
    overdue(figures({}, null), figures({ id: "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b09" }, { carriedChecked: false }));
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 2, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(0);
  });

  it("sends nothing again on a second run (one mail per invoice and level, ever)", async () => {
    overdue(figures());
    await service.runReminders(NOW);
    // The figures as read still say no reminder (as if its note was not seen): the key holds it.
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 1, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(1);
    expect(store.rows).toHaveLength(1);
    expect(repo.addNote).toHaveBeenCalledTimes(1);
  });

  it("checks the invoice again just before sending: a payment noted since stops it", async () => {
    repo.figures.mockResolvedValue([figures()]);
    repo.figuresOne.mockResolvedValue(figures({}, {}, { paid: 1210 }));
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 0, skipped: 1 });
    expect(mail.calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it("writes a failed row and no reminder note when the provider refuses it, and tries again on a later run", async () => {
    mail.result = { sent: false, error: "The e-mail provider refused the message (422)", providerId: "" };
    overdue(figures());
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 1, skipped: 0, skippedCompanies: 0 });
    expect(store.rows).toEqual([expect.objectContaining({ status: "failed", error: "The e-mail provider refused the message (422)", reminderLevel: 1, idempotencyKey: `reminder:${INV}:1:failed:mail-1` })]);
    expect(repo.chase).not.toHaveBeenCalled();
    expect(repo.addNote).not.toHaveBeenCalled();

    mail.result = { sent: true, error: "", providerId: "em_2" };
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
    expect(mail.calls).toHaveLength(2);
    expect(store.rows[1]).toMatchObject({ status: "sent", idempotencyKey: `reminder:${INV}:1` });
    expect(repo.addNote).toHaveBeenCalledTimes(1);
  });

  it("never sends again one that timed out (it may have gone out)", async () => {
    mail.result = { sent: false, error: "The e-mail provider did not answer in time — the e-mail may still have gone out", providerId: "", timedOut: true };
    overdue(figures());
    expect(await service.runReminders(NOW)).toMatchObject({ failed: 1 });
    expect(store.rows[0]).toMatchObject({ status: "failed", idempotencyKey: `reminder:${INV}:1` });
    mail.result = { sent: true, error: "", providerId: "em_2" };
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 0, skipped: 1 });
    expect(mail.calls).toHaveLength(1);
    expect(repo.addNote).not.toHaveBeenCalled();
  });

  it("sends without the invoice PDF when it can't be read, and says nothing of an attachment", async () => {
    documents.pdf.mockRejectedValue(new Error("bucket down"));
    overdue(figures());
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
    expect(mail.calls[0]!.attachments).toEqual([]);
    expect(mail.calls[0]!.text).not.toContain("attached");
  });

  it("keeps the mail row sent when its note can't be written (it went out: never sent twice)", async () => {
    repo.chase.mockRejectedValue(new Error("db blip"));
    overdue(figures());
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
    expect(store.rows[0]).toMatchObject({ status: "sent", providerId: "em_1" });
  });

  it("waits when the Customer Database can't be read", async () => {
    clients.receivableFacts.mockRejectedValue(new Error("down"));
    overdue(figures());
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 1, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(0);
  });

  it("sends nothing on a weekend, a Czech holiday or a holiday the company uploaded (K8)", async () => {
    overdue(figures({ dueDate: "2026-11-02" }));
    // Saturday 21 November, and the 17 November holiday.
    for (const day of ["2026-11-21T09:00:00Z", "2026-11-17T09:00:00Z"]) {
      expect(await service.runReminders(new Date(day))).toEqual({ companies: 0, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    }
    expect(mails.companiesWithAutoReminders).not.toHaveBeenCalled();
    clients.czHolidays.mockResolvedValue({ dates: [TODAY] });
    expect(await service.runReminders(NOW)).toEqual({ companies: 0, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    expect(clients.czHolidays).toHaveBeenCalledWith({ from: "2026-09-19", to: "2027-01-17" }, { authData: expect.objectContaining({ companyID: COMPANY }) });
    expect(mail.calls).toHaveLength(0);
    // The company's holidays can't be read: the statutory ones and weekends only, so it goes.
    clients.czHolidays.mockRejectedValue(new Error("down"));
    expect(await service.runReminders(NOW)).toMatchObject({ companies: 1, sent: 1 });
  });

  it("leaves alone an invoice a bank entry not confirmed yet may pay (X5); none at all when the statements can't be read", async () => {
    overdue(figures());
    bank.openIncoming.mockResolvedValue([
      { statementId: "st-1", fileName: "vypis.xml", bookingDate: "2026-11-17", credit: true, amount: "1210.00", currency: "EUR", variableSymbol: "00000028", endToEndId: "", message: "" },
    ]);
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 1, skippedCompanies: 0 });
    bank.openIncoming.mockRejectedValue(new Error("db down"));
    expect(await service.runReminders(NOW)).toEqual({ companies: 1, sent: 0, failed: 0, skipped: 1, skippedCompanies: 0 });
    expect(mail.calls).toHaveLength(0);
    // An entry for another job's symbol holds nothing.
    bank.openIncoming.mockResolvedValue([
      { statementId: "st-1", fileName: "vypis.xml", bookingDate: "2026-11-17", credit: true, amount: "1210.00", currency: "EUR", variableSymbol: "99", endToEndId: "", message: "" },
    ]);
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
  });

  it("reminds of no rest under 5 EUR, and no invoice due before the reminders were switched on (K13, L2)", async () => {
    overdue(figures({}, {}, { paid: 1206 }));
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 0 });
    repo.settingsOf.mockResolvedValue({ ...SETTINGS, autoRemindersSince: "2026-11-12" });
    overdue(figures());
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 0 });
    expect(mail.calls).toHaveLength(0);
    repo.settingsOf.mockResolvedValue({ ...SETTINGS, autoRemindersSince: "2026-11-11" });
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
  });

  it("reads only the invoices due around or after the switch-on day, so the old ones never fill the run's limit (L2) - and none with no day", async () => {
    repo.settingsOf.mockResolvedValue({ ...SETTINGS, autoRemindersSince: "2026-11-02" });
    overdue(figures());
    await service.runReminders(NOW);
    expect(repo.figures).toHaveBeenLastCalledWith(COMPANY, { overdueOn: TODAY, dueFrom: "2026-10-19", remindable: true }, 2001);
    repo.figures.mockClear();
    repo.settingsOf.mockResolvedValue({ ...SETTINGS, autoRemindersSince: null });
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 0 });
    expect(repo.figures).not.toHaveBeenCalled();
  });

  it("sets the switch-on day on the first run that can send, and sends nothing that day (P3)", async () => {
    repo.settingsOf.mockResolvedValue({ ...SETTINGS, autoRemindersSince: null });
    overdue(figures());
    expect(await service.runReminders(NOW)).toEqual({ companies: 0, sent: 0, failed: 0, skipped: 0, skippedCompanies: 0 });
    expect(repo.setAutoRemindersSinceIfMissing).toHaveBeenCalledWith(COMPANY, TODAY);
    expect(repo.figures).not.toHaveBeenCalled();
    expect(mail.calls).toHaveLength(0);
    // With a day stored, nothing is set again.
    repo.settingsOf.mockResolvedValue(SETTINGS);
    repo.setAutoRemindersSinceIfMissing.mockClear();
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
    expect(repo.setAutoRemindersSinceIfMissing).not.toHaveBeenCalled();
  });

  it("skips a company that read no bank statement since the previous working day; one that never read one reminds as before (P11)", async () => {
    overdue(figures());
    // 18 Nov 2026: the 17th is a Czech holiday, so the previous working day is Monday the 16th.
    bank.lastImportAt.mockResolvedValue(new Date("2026-11-13T10:00:00Z"));
    // Counted in the run's result, and kept for the settings page to say (m5).
    expect(await service.runReminders(NOW)).toEqual({ companies: 0, sent: 0, failed: 0, skipped: 0, skippedCompanies: 1 });
    expect(repo.noteRemindersSkipped).toHaveBeenCalledWith(COMPANY, TODAY, "2026-11-13");
    expect(repo.figures).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/^automatic reminders skipped today: no bank statement was read since the previous working day/), {
      companyId: COMPANY,
      lastImportDay: "2026-11-13",
    });
    bank.lastImportAt.mockResolvedValue(new Date("2026-11-16T10:00:00Z"));
    repo.noteRemindersSkipped.mockClear();
    expect(await service.runReminders(NOW)).toMatchObject({ companies: 1, sent: 1, skippedCompanies: 0 });
    expect(repo.noteRemindersSkipped).not.toHaveBeenCalled();
    // A run that goes ahead clears the earlier skip's note (round-4 review).
    expect(repo.clearRemindersSkipped).toHaveBeenCalledWith(COMPANY);
    store.rows = [];
    bank.lastImportAt.mockResolvedValue(null);
    expect(await service.runReminders(NOW)).toMatchObject({ companies: 1, sent: 1 });
  });

  it("says so in the log when more overdue invoices wait than one run reads (n3)", async () => {
    repo.figures.mockResolvedValue(Array.from({ length: 2001 }, () => figures({}, {}, { paid: 1210 })));
    await service.runReminders(NOW);
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/more overdue invoices than one run reads/), { companyId: COMPANY, limit: 2000 });
  });

  it("counts a due day on a weekend as due the next working day", async () => {
    // Due Saturday 7 Nov: 9 days overdue for the reminders on the 18th (from Monday the 9th), so reminder 1 goes; due
    // Saturday 14 Nov counts from Monday the 16th: 2 days, not yet.
    overdue(figures({ dueDate: "2026-11-14" }));
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 0 });
    overdue(figures({ dueDate: "2026-11-07" }));
    expect(await service.runReminders(NOW)).toMatchObject({ sent: 1 });
  });
});

// ── The statement ──

const row = (over: Record<string, unknown> = {}) => ({
  id: INV,
  number: "INV2026CZ00000028-001",
  customerId: CUSTOMER,
  customer: "Gama s.r.o.",
  jobNumber: "CZ00000028",
  issueDate: "2026-10-12",
  dueDate: "2026-11-11",
  currency: "EUR",
  gross: 1210,
  credited: 0,
  paid: 210,
  leftToPay: 1000,
  status: "part_paid",
  ...over,
});

const customerRows = (rows: Record<string, unknown>[], truncated = false) => receivables.rowsOfCustomer.mockResolvedValue({ rows, truncated, canAct: true, today: TODAY });

describe("statement send", () => {
  beforeEach(() => {
    customerRows([row()]);
    invoices.getByIdForCompany.mockResolvedValue(invoice());
  });

  it("answers off while e-mail from the app is switched off, and writes nothing", async () => {
    mail.configured = false;
    expect(await service.sendStatement(manager, CUSTOMER, { currency: "EUR" })).toEqual({ status: "off", message: EMAIL_OFF });
    expect(EMAIL_OFF).toMatch(/^E-mail from the app is switched off: /);
    expect(receivables.rowsOfCustomer).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(0);
    expect(mail.calls).toHaveLength(0);
  });

  it("is for managers", async () => {
    await expect(service.sendStatement(clerk, CUSTOMER, { currency: "EUR" })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("e-mails the statement PDF to the reminder contact once per idempotency key", async () => {
    const answer = await service.sendStatement(manager, CUSTOMER, { currency: "eur", idempotencyKey: "k1" });
    expect(answer).toEqual({ status: "sent", message: "The statement was e-mailed to ucetni@gama.cz" });
    expect(mail.calls).toHaveLength(1);
    expect(mail.calls[0]!.subject).toBe("Statement of open invoices (EUR) as at 18.11.2026");
    expect(mail.calls[0]!.attachments[0]!.filename).toBe("statement-Gama-s-r-o-EUR-2026-11-18.pdf");
    expect(Buffer.from(mail.calls[0]!.attachments[0]!.content, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    expect(store.rows[0]).toMatchObject({ kind: "statement", invoiceId: null, customerId: CUSTOMER, currency: "EUR", status: "sent", automatic: false, by: "boss@kun.cz", byUserId: "u-boss" });

    expect(await service.sendStatement(manager, CUSTOMER, { currency: "EUR", idempotencyKey: "k1" })).toEqual(answer);
    expect(mail.calls).toHaveLength(1);
  });

  it("says why it failed and keeps the row failed", async () => {
    mail.result = { sent: false, error: "The e-mail could not be sent", providerId: "" };
    expect(await service.sendStatement(manager, CUSTOMER, { currency: "EUR" })).toEqual({ status: "failed", message: "The e-mail could not be sent" });
    expect(store.rows[0]).toMatchObject({ status: "failed", error: "The e-mail could not be sent" });
  });

  it("refuses with nothing owed in the currency or no one to send it to", async () => {
    await expect(service.sendStatement(manager, CUSTOMER, { currency: "CZK" })).rejects.toMatchObject({ code: "failed_precondition" });
    clients.receivableFacts.mockResolvedValue(facts({ reminderTo: null }));
    await expect(service.sendStatement(manager, CUSTOMER, { currency: "EUR" })).rejects.toThrow(/no contact with an e-mail/);
    expect(mail.calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it("an attempt that never finished is not sent again with the same key", async () => {
    store.rows.push({ id: "mail-x", companyId: COMPANY, idempotencyKey: `statement:${CUSTOMER}:EUR:k2`, status: "failed", error: NEVER_FINISHED, recipient: "ucetni@gama.cz" });
    expect(await service.sendStatement(manager, CUSTOMER, { currency: "EUR", idempotencyKey: "k2" })).toEqual({ status: "failed", message: NEVER_FINISHED });
    expect(mail.calls).toHaveLength(0);
  });
});

describe("statement file", () => {
  beforeEach(() => invoices.getByIdForCompany.mockResolvedValue(invoice()));

  it("gives the CSV in the customer's language, for everyone", async () => {
    clients.receivableFacts.mockResolvedValue(facts({ language: "cs" }));
    customerRows([row(), row({ id: "x", currency: "CZK", leftToPay: 500, gross: 500, paid: 0, status: "unpaid" })]);
    const file = await service.statementFile(clerk, CUSTOMER, { currency: "EUR", format: "csv" });
    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(file.fileName).toBe("vypis-Gama-s-r-o-EUR-2026-11-18.csv");
    const text = Buffer.from(file.contentBase64, "base64").toString("utf8");
    expect(text).toContain('"Faktura"');
    expect(text).toContain('"INV2026CZ00000028-001","CZ00000028","00000028","2026-10-12","2026-11-11","7","EUR","1210.00","0.00","210.00","0.00","1000.00"');
    expect(text).not.toContain("CZK");
  });

  it("asks for the currency when the customer owes in several, and takes the one it owes in otherwise", async () => {
    customerRows([row(), row({ id: "x", currency: "CZK", leftToPay: 500, gross: 500, paid: 0, status: "unpaid" })]);
    await expect(service.statementFile(clerk, CUSTOMER, {})).rejects.toThrow(/Choose the currency: the customer owes in EUR, CZK|Choose the currency: the customer owes in CZK, EUR/);
    customerRows([row()]);
    const pdf = await service.statementFile(clerk, CUSTOMER, {});
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.fileName).toBe("statement-Gama-s-r-o-EUR-2026-11-18.pdf");
  });

  it("still gives the file in English when the Customer Database can't be read", async () => {
    clients.receivableFacts.mockRejectedValue(new Error("down"));
    customerRows([row()]);
    const file = await service.statementFile(clerk, CUSTOMER, { currency: "EUR", format: "csv" });
    expect(Buffer.from(file.contentBase64, "base64").toString("utf8")).toContain('"Invoice"');
  });

  it("refuses an unknown format or customer", async () => {
    await expect(service.statementFile(clerk, CUSTOMER, { format: "xls" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.statementFile(clerk, "nope", {})).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("mail log", () => {
  it("lists what the app e-mailed and whether e-mail is on", async () => {
    store.rows.push({ id: "m1", companyId: COMPANY, kind: "reminder", invoiceId: INV, customerId: CUSTOMER, currency: "EUR", reminderLevel: 1, recipient: "a@b.cz", language: "en", status: "sent", error: "", automatic: true, by: AUTOMATIC, createdAt: NOW, providerId: "em" });
    mail.configured = false;
    const res = await service.mailLog(clerk, { invoiceId: INV });
    expect(res.emailOn).toBe(false);
    expect(res.mails).toEqual([{ id: "m1", kind: "reminder", invoiceId: INV, customerId: CUSTOMER, currency: "EUR", reminderLevel: 1, recipient: "a@b.cz", language: "en", status: "sent", error: "", automatic: true, by: AUTOMATIC, at: NOW.toISOString() }]);
    expect(mails.list).toHaveBeenCalledWith(COMPANY, { customerId: undefined, invoiceId: INV }, 200);
    expect(await service.mailLog(clerk, { customerId: "not-an-id" })).toEqual({ mails: [], emailOn: false });
  });
});
