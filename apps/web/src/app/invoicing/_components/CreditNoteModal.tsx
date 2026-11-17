"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Checkbox, Input, Modal, Segmented } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { TD, TH } from "@/styles/ui";
import { useCreditOptions, useCreditRequestMutations, type CreditableLine } from "@/hooks/useCreditOptions";
import type { InvoiceDoc } from "@/hooks/useInvoiceDocs";
import { partialCreditDraft, type CreditMode } from "../_lib/partialCreditDraft";

interface CreditNoteModalProps {
  /** The invoice to credit; null = closed */
  doc: InvoiceDoc | null;
  /** Issues the credit note of the whole invoice (or of what partial ones left of it), at once */
  onCreditWhole: (reason: string) => Promise<void>;
  isCrediting: boolean;
  onClose: () => void;
}

/**
 * A credit note for an invoice. The whole invoice (or what partial credit notes left of it) is
 * credited at once, as before. Part of it - chosen line by line, each by an amount in the line's own
 * currency - is asked of a manager, who approves it on Sales → Managers → Billing approvals; the
 * credit note is issued then (API services/creditNoteRequest).
 */
export function CreditNoteModal({ doc, onCreditWhole, isCrediting, onClose }: CreditNoteModalProps) {
  const toast = useToast();
  const { user } = useAuth();
  const { data: options, isLoading, error } = useCreditOptions(doc?.id ?? null);
  const { ask, isAsking, withdraw, isWithdrawing } = useCreditRequestMutations();
  const [mode, setMode] = useState<CreditMode>("whole");
  const [reason, setReason] = useState("");
  // The lines picked, with the amount typed for each (in the line's own currency).
  const [picked, setPicked] = useState<Record<string, string>>({});

  const close = () => {
    setMode("whole");
    setReason("");
    setPicked({});
    onClose();
  };

  const currency = options?.currency ?? doc?.currency ?? "";
  const gross = Number(options?.gross ?? doc?.gross ?? 0);
  const left = gross + Number(options?.creditedGross ?? 0);
  const pending = options?.pendingRequest ?? null;
  const draft = useMemo(() => partialCreditDraft(options?.lines ?? [], picked), [options?.lines, picked]);

  const toggle = (line: CreditableLine, on: boolean) =>
    setPicked((p) => {
      const next = { ...p };
      if (on) next[line.lineId] = line.remainingAmount.toFixed(2);
      else delete next[line.lineId];
      return next;
    });

  const submitWhole = async () => {
    if (!reason.trim()) return;
    try {
      await onCreditWhole(reason.trim());
      close();
    } catch {
      // Refused: the invoice panel has said why, and the dialog stays open to try again.
    }
  };

  const submitPart = async () => {
    if (!doc || !draft.ok || !reason.trim()) return;
    try {
      await ask({ invoiceId: doc.id, lines: draft.lines, reason: reason.trim() });
      toast.success(`Partial credit note of ${doc.number} sent to a manager for approval`);
      close();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const takeBack = async () => {
    if (!pending) return;
    try {
      await withdraw(pending.id);
      toast.success("The request was taken back");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const reasonField = (
    <Input.TextArea
      value={reason}
      onChange={(e) => setReason(e.target.value)}
      placeholder={mode === "whole" ? "Reason, e.g. wrong customer / wrong amount" : "Reason, e.g. agreed discount on THC"}
      maxLength={300}
      autoSize={{ minRows: 2 }}
      aria-label="Reason for the credit note"
    />
  );

  const footer =
    mode === "whole" ? (
      <>
        <Button onClick={close}>Cancel</Button>
        <Button danger type="primary" disabled={!reason.trim() || isLoading} loading={isCrediting} onClick={() => void submitWhole()}>
          Issue credit note
        </Button>
      </>
    ) : (
      <>
        <Button onClick={close}>Cancel</Button>
        <Button type="primary" disabled={!!pending || !draft.ok || !reason.trim()} loading={isAsking} onClick={() => void submitPart()}>
          Ask for approval
        </Button>
      </>
    );

  return (
    <Modal open={!!doc} title={`Credit note for ${doc?.number ?? ""}`} onCancel={close} footer={footer} width={mode === "part" ? 760 : 520} destroyOnHidden>
      <div className="text-[13px] text-slate-700 flex flex-col gap-3">
        <Segmented<CreditMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "whole", label: "Whole invoice" },
            { value: "part", label: "Part of it" },
          ]}
          aria-label="What to credit"
        />
        {error && <Alert type="error" showIcon message={apiErrorMessage(error)} />}

        {mode === "whole" ? (
          <>
            {options && Number(options.creditedGross) !== 0 ? (
              <p className="m-0">
                Reverses what is left of the invoice: <strong className="tabular-nums">{money(left)} {currency}</strong> of {money(gross)} {currency} (credited in part on{" "}
                {options.creditNoteNumbers.join(", ")}), with the same rates and VAT. The reason is printed on the credit note.
              </p>
            ) : (
              <p className="m-0">
                Reverses the whole invoice (<strong className="tabular-nums">{money(gross)} {currency}</strong>) with the same rates and VAT. The reason is printed on the credit note.
              </p>
            )}
            {pending && (
              <Alert type="warning" showIcon message="The partial credit note waiting for a manager is taken back: nothing is left to credit in part once the whole invoice is." />
            )}
            {reasonField}
          </>
        ) : pending ? (
          <Alert
            type="info"
            showIcon
            message={`A partial credit note waits for a manager since ${formatDate(pending.requestedAt) || "today"}`}
            description={
              <div className="flex flex-col gap-1">
                <span>
                  {pending.lines.map((l) => `${l.description}: ${money(Number(l.amount))} ${l.unitCurrency}`).join(" · ")} —{" "}
                  <strong className="tabular-nums">
                    {money(Number(pending.gross))} {pending.currency}
                  </strong>{" "}
                  off with VAT. Asked by {pending.requestedByName || "someone"}: “{pending.reason}”
                </span>
                {user?.id === pending.requestedById && (
                  <span>
                    <Button size="small" loading={isWithdrawing} onClick={() => void takeBack()}>
                      Take it back
                    </Button>
                  </span>
                )}
              </div>
            }
          />
        ) : (
          <>
            <p className="m-0">
              Pick the lines to credit and how much of each, in the line&apos;s own currency. A manager approves it on Sales → Managers → Billing approvals, and the credit
              note is issued then; the invoice stays open with the rest.
            </p>
            {isLoading ? (
              <p className="m-0 text-slate-500">Loading the invoice lines…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr>
                      <th className={TH} aria-label="Credit this line" />
                      <th className={TH}>Line</th>
                      <th className={`${TH} text-right`}>Left to credit</th>
                      <th className={`${TH} text-right`}>Credit</th>
                      <th className={`${TH} text-right`}>In {currency}, excl. VAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(options?.lines ?? []).map((l) => {
                      const on = l.lineId in picked;
                      const row = draft.rows[l.lineId];
                      const nothingLeft = l.remainingAmount <= 0;
                      return (
                        <tr key={l.lineId} className={nothingLeft ? "opacity-50" : undefined}>
                          <td className={TD}>
                            <Checkbox checked={on} disabled={nothingLeft} onChange={(e) => toggle(l, e.target.checked)} aria-label={`Credit ${l.description}`} />
                          </td>
                          <td className={TD}>
                            {l.description}
                            <span className="text-slate-400"> · {l.vatCode}</span>
                          </td>
                          <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                            {money(l.remainingAmount)} {l.unitCurrency}
                            {l.remainingAmount !== l.amount && <div className="text-[11px] text-slate-400">of {money(l.amount)}</div>}
                          </td>
                          <td className={`${TD} text-right`}>
                            <Input
                              size="small"
                              className="!w-[130px] text-right"
                              value={picked[l.lineId] ?? ""}
                              disabled={!on}
                              status={row?.problem ? "error" : undefined}
                              suffix={<span className="text-slate-400 text-[11px]">{l.unitCurrency}</span>}
                              onChange={(e) => setPicked((p) => ({ ...p, [l.lineId]: e.target.value }))}
                              aria-label={`Amount to credit of ${l.description}`}
                            />
                            {row?.problem && <div className="text-[11px] text-red-600 mt-0.5">{row.problem}</div>}
                          </td>
                          <td className={`${TD} text-right tabular-nums`}>{row && !row.problem ? money(row.net) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {draft.lines.length > 0 && (
              <div className="flex justify-end gap-4 tabular-nums">
                <span>
                  Net <strong>{money(draft.net)}</strong>
                </span>
                <span>
                  VAT <strong>{money(draft.vat)}</strong>
                </span>
                <span>
                  Comes off{" "}
                  <strong className="text-red-600">
                    {money(draft.gross)} {currency}
                  </strong>{" "}
                  <span className="text-slate-400">of {money(left)}</span>
                </span>
              </div>
            )}
            {draft.wholeInvoice && <Alert type="warning" showIcon message="That is the whole invoice: credit the Whole invoice instead — it needs no approval." />}
            {draft.overInvoice && (
              <Alert
                type="warning"
                showIcon
                message={`That is more than is left of the invoice (${money(draft.left)} ${currency} without VAT): credit less, or credit the Whole invoice instead.`}
              />
            )}
            {reasonField}
          </>
        )}
      </div>
    </Modal>
  );
}
