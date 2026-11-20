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
    const keys = [...table.slice(table.indexOf("const columns: ColumnsType<ReceivableRow>"), table.indexOf("/** The row opened")).matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);
    const model = source("../_lib/receivableColumns.ts");
    const list = model.slice(model.indexOf("export const RECEIVABLE_COLUMNS"), model.indexOf("/** The columns shown at first"));
    expect(keys).toEqual([...list.matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]));
    expect(source("AccountsReceivableView.tsx")).toMatch(/wrapLabel\s+label=\{a \? `To collect/);
  });
});
