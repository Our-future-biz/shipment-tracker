import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

describe("the invoice drawer's wiring", () => {
  it("takes a payment back through the drawer's one set of writes, so every other form waits while it is on its way", () => {
    const actions = source("ReceivableActions.tsx");
    const takeBack = actions.slice(actions.indexOf("export function TakeBackPayment("), actions.indexOf("export function ConfirmLine("));
    expect(takeBack).toMatch(/actions\.takeBackPayment\s*\.mutateAsync\(/);
    // No write of its own: one the drawer's busy state (actions.pending) would not count.
    expect(takeBack).not.toMatch(/useMutation\(/);
    expect(takeBack).toMatch(/const busy = actions\.pending;/);
  });
});

describe("the reminder settings", () => {
  it("say when the automatic reminders go as the run does (09:00 UTC): 10:00 in Prague in winter, 11:00 in summer", () => {
    const view = source("../settings/_components/ReminderSettingsView.tsx");
    expect(view).toContain("Each working day at 10:00 in winter, 11:00 in summer (Prague time) the app e-mails");
    expect(view).not.toContain("around 10:00");
  });
});

describe("the reminder contact's words (A7)", () => {
  it("say the rule in the drawer and the reminder form, and the drawer warns with the list's switch-on day", () => {
    const drawer = source("ReceivableDrawer.tsx");
    const actions = source("ReceivableActions.tsx");
    for (const file of [drawer, actions]) {
      expect(file).not.toContain("No contact with an e-mail");
      expect(file).not.toContain("No contact of the customer has an e-mail");
      expect(file).toContain("{NO_REMINDER_CONTACT}");
    }
    expect(drawer).toMatch(/remindersBlocked\(detail\.row, f\.reminderTo, autoRemindersSince\)/);
    expect(source("AccountsReceivableView.tsx")).toMatch(/<ReceivableDrawer id=\{openId\} .* autoRemindersSince=\{autoRemindersSince\} \/>/);
  });
});

describe("the list at 1440 px (A5)", () => {
  it("draws its columns in the order the Columns model keeps, and lets the To collect label wrap", () => {
    const table = source("ReceivablesTable.tsx");
    const keys = [...table.slice(table.indexOf("const listColumns = "), table.indexOf("/** The row opened")).matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);
    const model = source("../_lib/receivableColumns.ts");
    const list = model.slice(model.indexOf("export const RECEIVABLE_COLUMNS"), model.indexOf("/** The columns shown at first"));
    expect(keys).toEqual([...list.matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]));
    expect(source("AccountsReceivableView.tsx")).toMatch(/wrapLabel\s+label=\{a \? `To collect/);
  });

  it("gives each of the ten first columns its LIST_WIDTHS width, and the tick box and expand arrow theirs (mock test S21-079)", () => {
    const table = source("ReceivablesTable.tsx");
    for (const key of ["number", "status", "customer", "job", "due", "gross", "left", "currency", "paid", "issued"]) {
      expect(table).toMatch(new RegExp(`key: "${key}",\\s*width: LIST_WIDTHS\\.${key},`));
    }
    expect(table).toContain("columnWidth: LIST_TICK_WIDTH");
    expect(table).toContain("columnWidth: LIST_EXPAND_WIDTH");
    expect(table).toContain("className={LIST_CELL_CLASS}");
    // What could make a column wider than its width is held to it: the number, the status marks, the customer, the job.
    expect(table).toContain("style={inner(LIST_WIDTHS.number)}");
    expect(table).toContain("style={inner(LIST_WIDTHS.status)}");
    expect(table).toContain("style={inner(LIST_WIDTHS.customer)}");
    expect(table).toContain("style={inner(LIST_WIDTHS.job)}");
    expect(table).toContain("style={inner(LIST_WIDTHS.due)}");
    expect(table).toContain('className="!whitespace-normal"');
    expect(table).toContain("shortJobNumber(r.jobNumber)");
    expect(table).not.toContain("max-w-[170px]");
  });

  it("leaves the currency out of the amounts while the Currency column shows it, and draws the table anew when the tick boxes come (mock test S21-079)", () => {
    const table = source("ReceivablesTable.tsx");
    expect(table).toContain('const currencyShown = visible.includes("currency");');
    expect(table).toContain("figure(r.gross, r.currency, currencyShown)");
    expect(table).toContain("figure(r.leftToPay, r.currency, currencyShown, r.leftToPay > 0)");
    expect(table).toContain("figure(r.paid, r.currency, currencyShown)");
    expect(table).toContain('key={selection ? "with-ticks" : "without-ticks"}');
  });
});

describe("people by name (mock test run)", () => {
  it("shows Person in Charge, Holiday Cover and Issued by by name in the list and the drawer, and filters by it", () => {
    const table = source("ReceivablesTable.tsx");
    expect(table).toContain("person(r.personInCharge)");
    expect(table).toContain('Holiday Cover: <PersonName email={r.holidayCover} />');
    expect(table).toContain("person(r.issuedBy)");
    expect(table).not.toMatch(/Holiday Cover: \{r\.holidayCover\}|\$\{r\.holidayCover\}|text\(r\.(personInCharge|issuedBy)\)/);
    // And sorts them by it (review of system-22), with the names the cells read.
    expect(table).toContain("sorter: byPerson((r) => r.personInCharge, nameOf)");
    expect(table).toContain("sorter: byPerson((r) => r.issuedBy, nameOf)");
    expect(table).not.toMatch(/a\.(personInCharge|issuedBy)\.localeCompare/);
    expect(table).toMatch(/listColumns\(currencyShown, \(email\) => userByEmail\(email, users\)\?\.displayName\.trim\(\) \?\? ""\)/);
    const drawer = source("ReceivableDrawer.tsx");
    expect(drawer).toContain("issued by <PersonName email={r.issuedBy} />");
    expect(drawer).toContain('<PersonName email={r.personInCharge} />');
    expect(drawer).not.toMatch(/\$\{r\.issuedBy\}|\{r\.personInCharge \|\| "—"\}|Holiday Cover: \{r\.holidayCover\}/);
    expect(source("AccountsReceivableView.tsx")).toMatch(/receivableTable\(today, autoRemindersSince, \(email\) => userByEmail\(email, users\)/);
  });
});
