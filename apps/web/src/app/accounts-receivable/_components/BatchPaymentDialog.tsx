"use client";

import { useId, useRef, useState } from "react";
import dayjs from "dayjs";
import { Alert, DatePicker, Input, Modal } from "antd";
import { useReceivableBatchPayment } from "@/hooks/useReceivables";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { HINT, LABEL_TEXT, REF, TD, TEXTAREA, TH } from "@/styles/ui";
import { amountText, batchCheck, batchFailureText, batchIdempotencyKey, batchItems, frozenBatchRows, fullAmountText, type ReceivableRow } from "../_lib/receivables";
import { FieldProblem } from "./ReceivableActions";

// One bank payment over several invoices (step 7): a manager ticks the invoices in Unpaid or Overdue, then notes the
// payment once - its day, the bank's reference and a note on every line, and an amount per invoice that starts at what
// is left to pay on it. All in one currency; each amount at most what is left on its invoice; all or nothing, each
// invoice with the version shown here (a change meanwhile is refused, to be looked at again). The server checks it
// all again and says why when it refuses. The invoices are frozen when the dialog opens: the list read again
// meanwhile never changes what is sent, so a retry after a lost answer replays the same payment.

const HEAD = `${TH} first:pl-3 last:pr-3`;
const CELL = `${TD} first:pl-3 last:pr-3`;

export function BatchPaymentDialog({ rows: given, today, onClose, onDone }: {
  /** The ticked invoices as they were when the dialog opened (their versions and what is left to pay) */
  rows: ReceivableRow[];
  today: string;
  onClose: () => void;
  /** Noted: the ticks are cleared */
  onDone: () => void;
}) {
  const toast = useToast();
  const batch = useReceivableBatchPayment();
  // Frozen for this opening: a later copy of the rows (the list read again) is never taken up.
  const [rows] = useState(() => frozenBatchRows(given));
  const [day, setDay] = useState(today);
  const [bankRef, setBankRef] = useState("");
  const [note, setNote] = useState("");
  // Each invoice starts with all of what is left to pay on it, as the single payment form does.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, fullAmountText(r.leftToPay)])));
  // Why the last send failed: the server's refusal (nothing noted), or no answer (it may have been noted).
  const [error, setError] = useState<{ refused: boolean; text: string } | null>(null);
  // One key per day and set of amounts for this opening: a double click or a retry after a lost answer sends the
  // frozen invoices with the same key, so the payment is noted once; only another day or amount is another payment.
  const keys = useRef(new Map<string, string>());
  const ids = useId();
  const problemId = `${ids}-problem`;
  const lineProblemId = (id: string) => `${ids}-line-${id}`;

  const lines = rows.map((row) => ({ row, amountText: amounts[row.id] ?? "" }));
  const check = batchCheck({ day, today, lines });
  const saving = batch.isPending;
  const dayProblem = !!check.problem && (!day || check.problem.startsWith("The day"));

  const save = () => {
    if (check.problem || saving) return;
    const items = batchItems(rows, amounts);
    const idempotencyKey = batchIdempotencyKey(keys.current, day, items);
    setError(null);
    batch
      .mutateAsync({
        body: { paidOn: day, bankRef: bankRef.trim() || undefined, note: note.trim() || undefined, idempotencyKey, items },
        customerIds: rows.map((r) => r.customerId),
      })
      .then(() => {
        toast.success(`Payment of ${amountText(check.sum, check.currency)} noted on ${items.length} ${items.length === 1 ? "invoice" : "invoices"}`);
        onDone();
      })
      // The dialog stays with what was typed. A refusal noted nothing (all or nothing) and says why in the server's
      // words; no answer may have noted it, so the manager checks first - a retry with the same values replays it.
      .catch((e) => setError(batchFailureText(e)));
  };

  return (
    <Modal
      open
      title="Note one payment over several invoices"
      width={820}
      onCancel={() => !saving && onClose()}
      okText={check.problem ? "Note the payment" : `Note ${amountText(check.sum, check.currency)} paid on ${formatDate(day)}`}
      onOk={save}
      okButtonProps={{ disabled: !!check.problem, loading: saving, "aria-describedby": check.problem ? problemId : undefined }}
      cancelButtonProps={{ disabled: saving }}
      destroyOnHidden
    >
      <div className="flex flex-col gap-3">
        <div className={HINT}>
          One payment the bank shows, shared over these invoices: each gets a payment line with the same day, bank reference and note. A part payment leaves the rest unpaid.
          Nothing is noted unless every invoice takes its amount.
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col">
            <span className={`${LABEL_TEXT} mb-1`}>Paid on</span>
            <DatePicker
              allowClear={false}
              format="D.M.YYYY"
              value={day ? dayjs(day) : null}
              onChange={(d) => setDay(d ? d.format("YYYY-MM-DD") : "")}
              maxDate={dayjs(today)}
              className="w-[160px]"
              aria-label="Paid on"
              aria-invalid={dayProblem || undefined}
              aria-describedby={dayProblem ? problemId : undefined}
              status={dayProblem ? "warning" : undefined}
            />
          </label>
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className={`${LABEL_TEXT} mb-1`}>
              Bank reference <span className="font-normal normal-case text-slate-500">(optional)</span>
            </span>
            <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} maxLength={140} aria-label="Bank reference" placeholder="As on the bank statement" />
          </label>
        </div>
        <label className="block">
          <span className={`block ${LABEL_TEXT} mb-1`}>
            Note <span className="font-normal normal-case text-slate-500">(optional)</span>
          </span>
          <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" className={`${TEXTAREA} w-full resize-y`} />
        </label>

        <div className="rounded-lg border border-slate-200 overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={HEAD}>Invoice</th>
                <th className={HEAD}>Customer</th>
                <th className={HEAD}>Due</th>
                <th className={`${HEAD} !text-right`}>Left to pay</th>
                <th className={`${HEAD} !text-right`}>Amount paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const problem = check.lines[r.id];
                return (
                  <tr key={r.id}>
                    <td className={`${CELL} whitespace-nowrap`}>
                      <span className={`${REF} font-semibold text-slate-900`}>{r.number}</span>
                    </td>
                    <td className={`${CELL} max-w-[200px]`}>
                      <span className="block truncate" title={r.customer}>
                        {r.customer || "—"}
                      </span>
                    </td>
                    <td className={`${CELL} tabular-nums whitespace-nowrap`}>{formatDate(r.dueDate)}</td>
                    <td className={`${CELL} !text-right tabular-nums whitespace-nowrap`}>{amountText(r.leftToPay, r.currency)}</td>
                    <td className={`${CELL} !text-right`}>
                      <Input
                        value={amounts[r.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                        inputMode="decimal"
                        suffix={<span className="text-slate-400 text-[12px]">{r.currency}</span>}
                        className="!w-[150px] text-right tabular-nums"
                        aria-label={`Amount paid on ${r.number}`}
                        aria-invalid={!!problem || undefined}
                        aria-describedby={lineProblemId(r.id)}
                        status={problem ? "warning" : undefined}
                      />
                      <FieldProblem id={lineProblemId(r.id)} text={problem ?? ""} className="mt-0.5" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className={`${CELL} !text-right font-semibold text-slate-900`}>
                  {rows.length} {rows.length === 1 ? "invoice" : "invoices"} · the payment in all
                </td>
                <td className={`${CELL} !text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap`}>{check.currency ? amountText(check.sum, check.currency) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Why the payment can't be noted yet, as text beside the disabled button (and linked to it and the day). */}
        <FieldProblem id={problemId} text={check.problem} />
        <div aria-live="polite">{error && <Alert type={error.refused ? "error" : "warning"} showIcon message={error.text} />}</div>
      </div>
    </Modal>
  );
}
