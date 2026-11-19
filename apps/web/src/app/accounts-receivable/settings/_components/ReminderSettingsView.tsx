"use client";

import { useState } from "react";
import { Alert, Input, Spin, Switch } from "antd";
import { BackLink } from "@/components/BackLink";
import { useReceivableSettings, useSaveReceivableSettings, type ReceivableSettings } from "@/hooks/useReceivableTools";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { BTN, BTN_PRIMARY, CARD, HINT, LABEL_TEXT, PAGE_TITLE } from "@/styles/ui";
import { EMAIL_OFF_NOTE, formOf, isChanged, settingsInput, settingsProblem, skippedText, switchOnText, type SettingsForm } from "../_lib/settings";

// Finance → Accounts Receivable → Reminder settings (step 7): whether the app sends reminders 1 and 2 by itself, how
// many days after the due day, and where a customer's answer goes. Managers change them; everyone reads them. The app
// sends nothing while e-mail from the app is switched off, and records nothing as sent; the final notice is always a
// manager's own act.

export function ReminderSettingsView() {
  const query = useReceivableSettings();
  const data = query.data;
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[900px] mx-auto flex flex-col gap-5">
        <BackLink href="/accounts-receivable" className="-mb-3 self-start">
          Accounts Receivable
        </BackLink>
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${CARD} px-4 py-3`}>
          <h1 className={PAGE_TITLE}>Reminder settings</h1>
        </div>
        {query.isLoading && <Spin />}
        {!data && query.isError && <Alert type="error" showIcon message={`Could not load the reminder settings: ${apiErrorMessage(query.error)}`} />}
        {/* Keyed by the saved version, so the form starts again from what is saved after each save or change elsewhere. */}
        {data && <SettingsCard key={`${data.updatedAt ?? ""}|${data.autoReminders}|${data.reminder1Days}|${data.reminder2Days}|${data.replyTo}`} saved={data} />}
      </div>
    </div>
  );
}

function SettingsCard({ saved }: { saved: ReceivableSettings }) {
  const savedForm = formOf(saved);
  const [form, setForm] = useState<SettingsForm>(savedForm);
  const save = useSaveReceivableSettings();
  const toast = useToast();
  const edit = saved.canEdit;
  const problem = settingsProblem(form);
  const changed = isChanged(form, savedForm);
  const set = (patch: Partial<SettingsForm>) => setForm((f) => ({ ...f, ...patch }));

  const onSave = () => {
    if (problem || !changed) return;
    save
      .mutateAsync(settingsInput(form))
      .then((now) =>
        toast.success(
          now.autoReminders && !now.emailOn ? "Saved: automatic reminders start on the first day e-mail from the app can send, with invoices due from then on" : "Reminder settings saved",
        ),
      )
      .catch((e) => toast.error(apiErrorMessage(e)));
  };

  return (
    <>
      {!saved.emailOn && <Alert type="warning" showIcon message={EMAIL_OFF_NOTE} />}
      <div className={`${CARD} px-4 py-4 flex flex-col gap-5`}>
        <label className="flex items-start gap-3">
          <Switch checked={form.autoReminders} disabled={!edit} onChange={(v) => set({ autoReminders: v })} aria-label="Automatic reminders" className="mt-0.5" />
          <span>
            <span className="block text-[14px] font-semibold text-slate-900">Automatic reminders</span>
            <span className={`block ${HINT}`}>
              Each working day at 10:00 in winter, 11:00 in summer (Prague time) the app e-mails reminder 1 and reminder 2 for overdue invoices, to the customer&apos;s
              accounts contact, in the customer&apos;s language - not for an invoice that is disputed, has a promise to pay still running, is to be refunded, has less than
              100 CZK / 5 EUR left to pay, or may be paid by a payment waiting on a bank statement. A due day on a weekend or a holiday counts as the next working day. Each
              reminder goes once per invoice. The final notice is never sent by itself: a manager sends it. A day with no bank statement read since the previous working day
              sends nothing.
              {!saved.emailOn && " It can be switched on now: it starts on the first day e-mail from the app can send, and reminds only invoices due from that day on."}
            </span>
            <span className={`block ${HINT} mt-1`}>{switchOnText(saved.autoReminders, saved.autoRemindersSince, saved.emailOn)}</span>
            {/* The run's last skip for want of a bank statement (m5): read one, and the next run reminds again. */}
            {skippedText(saved.remindersSkipped) && <span className="block text-[13px] text-amber-700 mt-1">{skippedText(saved.remindersSkipped)}</span>}
          </span>
        </label>

        <div className="flex flex-wrap gap-5">
          <label className="flex flex-col">
            <span className={`${LABEL_TEXT} mb-1`}>Reminder 1 · days after the due day</span>
            <Input value={form.reminder1Days} disabled={!edit} inputMode="numeric" onChange={(e) => set({ reminder1Days: e.target.value })} className="!w-32 tabular-nums" aria-label="Reminder 1 days" />
          </label>
          <label className="flex flex-col">
            <span className={`${LABEL_TEXT} mb-1`}>Reminder 2 · days after the due day</span>
            <Input value={form.reminder2Days} disabled={!edit} inputMode="numeric" onChange={(e) => set({ reminder2Days: e.target.value })} className="!w-32 tabular-nums" aria-label="Reminder 2 days" />
          </label>
          <label className="flex flex-col flex-1 min-w-[260px]">
            <span className={`${LABEL_TEXT} mb-1`}>
              Reply-to <span className="font-normal normal-case text-slate-500">(optional)</span>
            </span>
            <Input value={form.replyTo} disabled={!edit} type="email" placeholder="The sender's own address" onChange={(e) => set({ replyTo: e.target.value })} aria-label="Reply-to" />
            <span className={`${HINT} mt-1`}>Where a customer&apos;s answer goes. Left empty, it goes to the sender&apos;s own address.</span>
          </label>
        </div>

        {edit && problem && <div className="text-[13px] text-red-600">{problem}</div>}
        <div className="flex flex-wrap items-center gap-3">
          {edit ? (
            <>
              <button type="button" disabled={!changed || !!problem || save.isPending} onClick={onSave} className={BTN_PRIMARY}>
                {save.isPending ? "Saving…" : "Save"}
              </button>
              <button type="button" disabled={!changed || save.isPending} onClick={() => setForm(savedForm)} className={BTN}>
                Undo changes
              </button>
            </>
          ) : (
            <span className={HINT}>Only a manager changes the reminder settings.</span>
          )}
          <span className={`${HINT} ml-auto`}>{saved.updatedBy ? `Last changed by ${saved.updatedBy}${saved.updatedAt ? ` on ${businessDateTime(saved.updatedAt)}` : ""}` : "Never changed: the defaults apply"}</span>
        </div>
      </div>
    </>
  );
}
