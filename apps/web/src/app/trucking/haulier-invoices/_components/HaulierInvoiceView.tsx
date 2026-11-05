"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, DatePicker, Modal, Spin, Tooltip } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { ArrowLeftOutlined, DownloadOutlined } from "@ant-design/icons";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate, businessDateTime, businessToday } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useHaulier } from "@/hooks/useTrucking";
import { fetchHaulierInvoiceFile, useHaulierInvoice, type HaulierInvoiceLine } from "@/hooks/useTruckingMoney";
import { btnDefault, btnPrimary } from "@/components/buttons";
import { SectionCard } from "@/components/SectionCard";
import { CARD, EMPTY, HINT, LINK, PAGE_SUBTITLE, PAGE_TITLE, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { downloadDataUrl } from "@/lib/files";
import { LINK_ICON_BTN_GHOST } from "../../_lib/linkButtons";
import { formatBankAccount } from "../../_lib/bankAccounts";
import { tripHref } from "../../_lib/consignments";
import { TERMS } from "../../_lib/glossary";
import { INVOICE_STATUS_CHIP, TARGET_KIND_LABELS, differenceText, haulierVatCardHref, invoiceDecisionState, paymentState, vatBlockers } from "../../_lib/haulierInvoices";
import { isTruckingManager } from "../../_lib/roles";
import { formatMoney } from "../../_lib/tariffs";
import { fileDataUrl } from "../../_lib/tariffUpload";
import { TruckingStatusChip } from "../../_components/TruckingStatusChip";
import { TruckingTextModal } from "../../_components/TruckingTextModal";

const LIST_HREF = "/trucking?tab=haulierInvoices";
const Line = ({ k, v, tone = "" }: { k: string; v: ReactNode; tone?: string }) => (
  <div className="flex items-baseline gap-2 text-xs">
    <span className="shrink-0 text-slate-500">{k}</span>
    <span className={`ml-auto text-right font-semibold break-words ${v ? tone || "text-slate-900" : EMPTY}`}>{v || "—"}</span>
  </div>
);

// A button that, when it cannot be used now, says why on hover.
const GuardedButton = ({ reason, label, primary, onClick }: { reason: string | null; label: string; primary?: boolean; onClick: () => void }) => (
  <Tooltip title={reason ?? undefined}>
    <span className="inline-flex">
      <button type="button" className={primary ? btnPrimary : btnDefault} disabled={!!reason} onClick={onClick}>
        {label}
      </button>
    </span>
  </Tooltip>
);

interface HaulierInvoiceViewProps {
  invoiceId: string;
}

// One haulier invoice: its lines against what each trip or partner delivery should cost, the
// VAT-register check and — for a manager — Approve or Reject with a reason. A blocked invoice says
// why and how to fix it on the haulier page; nobody can approve it until then.
export const HaulierInvoiceView = ({ invoiceId }: HaulierInvoiceViewProps) => {
  const toast = useToast();
  const { user } = useAuth();
  const { invoice: inv, isLoading, error, approve, reject, markPaid, markUnpaid } = useHaulierInvoice(invoiceId);
  // Read for a blocked invoice (what to fix) and for an approved one (whether the haulier is now an unreliable VAT payer, K16).
  const { haulier } = useHaulier(inv?.haulierCustomerId ?? "", { enabled: inv?.status === "BLOCKED" || inv?.status === "APPROVED" });
  const [paying, setPaying] = useState(false);
  const [dialog, setDialog] = useState<"approve" | "reject" | "pay" | "unpay" | null>(null);
  const [paidOn, setPaidOn] = useState<Dayjs | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!inv) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error) ? "Invoice not found." : `Could not load the invoice: ${apiErrorMessage(error)}.`}{" "}
        <Link href={LIST_HREF} className={LINK}>
          Back to Haulier invoices
        </Link>
      </div>
    );
  }

  const decision = invoiceDecisionState(inv, isTruckingManager(user));
  const payment = paymentState(inv, isTruckingManager(user));
  const fixes = haulier && inv.status === "BLOCKED" ? vatBlockers(haulier.profile, inv.bankAccount) : [];
  const check = inv.bankAccountCheck;
  const report = (what: string) => (e: unknown) => {
    toast.error(`${what}: ${apiErrorMessage(e)}`);
  };
  // TruckingTextModal stays open on a rejection, so its submits pass the error on after the toast.
  const fail = (what: string) => (e: unknown) => {
    report(what)(e);
    throw e;
  };
  const handleDownload = async () => {
    try {
      const file = await fetchHaulierInvoiceFile(inv.id);
      downloadDataUrl(fileDataUrl({ ...file, contentType: file.contentType || "application/pdf" }), file.fileName || inv.fileName || `${inv.invoiceNumber}.pdf`);
    } catch (e) {
      toast.error(`Could not download the file: ${apiErrorMessage(e)}`);
    }
  };
  const lines = inv.lines;
  const sum = (pick: (l: HaulierInvoiceLine) => number) => lines.reduce((acc, l) => acc + pick(l), 0);

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[240px] flex-1 items-start gap-2">
            <Link href={LIST_HREF} aria-label="Back to Haulier invoices" className={LINK_ICON_BTN_GHOST}>
              <ArrowLeftOutlined />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={`${PAGE_TITLE} ${REF}`}>{inv.invoiceNumber}</h1>
                <TruckingStatusChip chip={INVOICE_STATUS_CHIP[inv.status]} />
              </div>
              <div className={`mt-0.5 ${PAGE_SUBTITLE}`}>
                {TERMS.haulierInvoice} from{" "}
                <Link href={`/trucking/hauliers/${inv.haulierCustomerId}`} className={`${LINK} font-semibold`}>
                  {inv.haulierName}
                </Link>{" "}
                · entered {businessDateTime(inv.createdAt)}
                {inv.createdBy ? ` by ${inv.createdBy}` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {inv.fileName && (
              <button type="button" className={btnDefault} onClick={handleDownload}>
                <DownloadOutlined /> {inv.fileName}
              </button>
            )}
            <GuardedButton reason={decision.reject} label="Reject…" onClick={() => setDialog("reject")} />
            <GuardedButton reason={decision.approve} label="Approve…" primary onClick={() => setDialog("approve")} />
            {inv.status === "APPROVED" &&
              (inv.payment ? (
                <GuardedButton reason={payment.unpay} label="Take back payment…" onClick={() => setDialog("unpay")} />
              ) : (
                <GuardedButton
                  reason={payment.pay}
                  label="Mark paid…"
                  primary
                  onClick={() => {
                    setPaidOn(dayjs(businessToday()));
                    setDialog("pay");
                  }}
                />
              ))}
          </div>
        </div>

        {inv.status === "BLOCKED" && (
          <Alert
            className="mt-3"
            type="error"
            showIcon
            message="Blocked — nobody can approve this invoice until it is fixed (joint VAT liability)"
            description={
              <div className="flex flex-col gap-1.5">
                <ul className="m-0 pl-5">
                  {inv.blockReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                {fixes.length > 0 && (
                  <div>
                    <b>How to fix:</b>
                    <ul className="m-0 pl-5">
                      {fixes.map((f) => (
                        <li key={f.problem}>{f.fix}.</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link href={haulierVatCardHref(inv.haulierCustomerId)} className={`${LINK} font-semibold`}>
                  Open {inv.haulierName}&apos;s VAT register card
                </Link>
              </div>
            }
          />
        )}
        {inv.status === "NEEDS_APPROVAL" && (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            message={
              inv.difference === 0 && inv.holdReasons.length
                ? "An exact match, held for a manager — approve it with a reason, or reject it."
                : `Not an exact match: ${differenceText(inv.difference, inv.currency)} — a manager approves it with a reason, or rejects it.`
            }
            description={
              inv.holdReasons.length ? (
                <ul className="m-0 pl-5">
                  {inv.holdReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : undefined
            }
          />
        )}
        {inv.approval && (
          <Alert
            className="mt-3"
            type={inv.status === "REJECTED" ? "error" : "success"}
            showIcon
            message={`${inv.status === "REJECTED" ? "Rejected" : "Approved"} by ${inv.approval.byName} on ${businessDateTime(inv.approval.at)}${inv.approval.reason ? `: “${inv.approval.reason}”` : ""}`}
          />
        )}
        {inv.payment && (
          <Alert
            className="mt-3"
            type="success"
            showIcon
            message={`Paid on ${formatDate(inv.payment.paidOn)}${inv.payment.byName ? `, noted by ${inv.payment.byName}` : ""}${inv.payment.at ? ` on ${businessDateTime(inv.payment.at)}` : ""}`}
          />
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <SectionCard title="Dates" dense bodyClassName="px-4 py-3 flex flex-col gap-0.5">
            <Line k="Issued" v={formatDate(inv.issueDate)} />
            <Line k="Due" v={formatDate(inv.dueDate)} />
            <Line k="DUZP" v={formatDate(inv.duzp)} />
          </SectionCard>
          <SectionCard title={`Totals · ${inv.currency}`} dense bodyClassName="px-4 py-3 flex flex-col gap-0.5">
            <Line k="Net" v={formatMoney(inv.totalNet, inv.currency)} />
            <Line k="VAT" v={formatMoney(inv.vatAmount, inv.currency)} />
            <Line k="Gross" v={formatMoney(inv.totalGross, inv.currency)} />
            <Line k="Difference" v={differenceText(inv.difference, inv.currency)} tone={inv.difference ? "text-amber-700" : "text-emerald-700"} />
          </SectionCard>
          <SectionCard title={TERMS.vatBankAccountCheck} dense bodyClassName="px-4 py-3 flex flex-col gap-0.5">
            <Line k="Account" v={<span className={REF}>{formatBankAccount(inv.bankAccount)}</span>} />
            <Line
              k="Published"
              v={check.published == null ? "Not checked" : check.published ? "Yes" : "No"}
              tone={check.published === false ? "text-red-600" : check.published ? "text-emerald-700" : "text-amber-700"}
            />
            <Line k="Checked" v={formatDate(check.checkedAt)} />
            {check.note && <Line k="Note" v={check.note} />}
          </SectionCard>
        </div>
      </div>

      <div className="p-6">
        <section className={`${CARD} overflow-x-auto`}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Kind</th>
                <th className={TH}>Trip / leg</th>
                <th className={`${TH} !text-right`}>Expected</th>
                <th className={`${TH} !text-right`}>Our claims</th>
                <th className={`${TH} !text-right`}>Invoiced</th>
                <th className={`${TH} !text-right`}>Difference</th>
                <th className={TH}>Note</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className={`${TD} !align-top`}>{TARGET_KIND_LABELS[l.target.kind]}</td>
                  <td className={`${TD} !align-top ${REF} font-semibold`}>
                    {l.target.kind === "TRIP" ? (
                      <Link href={tripHref(l.target.id)} className={LINK}>
                        {l.target.ref}
                      </Link>
                    ) : (
                      l.target.ref
                    )}
                  </td>
                  <td className={`${TD} !align-top text-right tabular-nums`}>{formatMoney(l.expected, l.currency)}</td>
                  <td className={`${TD} !align-top text-right tabular-nums !text-amber-700`}>{l.claimed ? formatMoney(l.claimed, l.currency) : ""}</td>
                  <td className={`${TD} !align-top text-right tabular-nums`}>{formatMoney(l.invoiced, l.currency)}</td>
                  <td className={`${TD} !align-top text-right tabular-nums ${l.difference ? "font-semibold !text-amber-700" : "!text-emerald-700"}`}>{differenceText(l.difference, l.currency)}</td>
                  <td className={`${TD} !align-top`}>{l.note}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={TD_TOTAL} colSpan={2}>
                  Total
                </td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{formatMoney(sum((l) => l.expected), inv.currency)}</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{formatMoney(sum((l) => l.claimed), inv.currency)}</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{formatMoney(sum((l) => l.invoiced), inv.currency)}</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{differenceText(sum((l) => l.difference), inv.currency)}</td>
                <td className={TD_TOTAL} />
              </tr>
            </tfoot>
          </table>
        </section>
        <p className={`mt-2 mb-0 ${HINT}`}>
          Expected = the trip&apos;s or partner delivery&apos;s buy price minus our claims against the haulier. Only an {TERMS.exactMatch.toLowerCase()} of every line and the net
          total is approved by itself; on approval the real cost goes to the jobs.
        </p>
      </div>

      {dialog === "approve" && (
        <TruckingTextModal
          title={`Approve ${inv.invoiceNumber}`}
          hint={`The invoice differs from the expected cost by ${differenceText(inv.difference, inv.currency)}. Approving puts the invoiced amounts on the jobs as their real cost; your name, the time and the reason are kept.`}
          placeholder="Reason (required)"
          okText="Approve invoice"
          onClose={() => setDialog(null)}
          onSubmit={(reason) =>
            approve(reason)
              .then(() => toast.success(`${inv.invoiceNumber} approved`))
              .catch(fail("Could not approve the invoice"))
          }
        />
      )}
      {dialog === "pay" && (
        <Modal
          open
          title={`Mark ${inv.invoiceNumber} paid`}
          okText="Mark paid"
          onCancel={() => setDialog(null)}
          okButtonProps={{ disabled: !paidOn }}
          // Sent once: a second click while it saves does nothing (m11).
          confirmLoading={paying}
          onOk={() => {
            if (paying) return;
            setPaying(true);
            markPaid(paidOn!.format("YYYY-MM-DD"))
              .then(() => {
                setDialog(null);
                toast.success(`${inv.invoiceNumber} noted as paid`);
              })
              // The dialog stays open by itself: only the toast, nothing thrown into an unhandled rejection.
              .catch(report("Could not note the payment"))
              .finally(() => setPaying(false));
          }}
        >
          {haulier?.profile.vatUnreliable && (
            // The payment is made outside this system, so it is not refused; paying an unreliable VAT payer
            // can make us liable for its VAT (ručení za DPH, K16).
            <Alert
              type="error"
              showIcon
              className="mb-3"
              message={`${inv.haulierName} is now an unreliable VAT payer`}
              description="Paying it can make us liable for its VAT. Check the VAT register again before you note this payment."
            />
          )}
          <p className="mt-0 text-[13px] text-slate-600">
            {formatMoney(inv.totalGross, inv.currency)} to {inv.haulierName}. The day the payment went; your name and the time are kept.
          </p>
          <DatePicker
            aria-label="Paid on"
            format="DD.MM.YYYY"
            value={paidOn}
            onChange={setPaidOn}
            disabledDate={(d) => d.isAfter(dayjs(businessToday()), "day")}
            allowClear={false}
          />
        </Modal>
      )}
      {dialog === "unpay" && (
        <TruckingTextModal
          title={`Take back the payment of ${inv.invoiceNumber}`}
          hint="For a payment noted by mistake. The invoice stays approved; the reason is kept."
          placeholder="Reason (required)"
          okText="Take it back"
          danger
          onClose={() => setDialog(null)}
          onSubmit={(reason) =>
            markUnpaid(reason)
              .then(() => toast.success(`${inv.invoiceNumber}: payment taken back`))
              .catch(fail("Could not take the payment back"))
          }
        />
      )}
      {dialog === "reject" && (
        <TruckingTextModal
          title={`Reject ${inv.invoiceNumber}`}
          hint="The invoice is rejected and its trips and partner deliveries can go on a corrected invoice. Tell the haulier yourself; the reason is kept."
          placeholder="Reason (required)"
          okText="Reject invoice"
          danger
          onClose={() => setDialog(null)}
          onSubmit={(reason) =>
            reject(reason)
              .then(() => toast.success(`${inv.invoiceNumber} rejected`))
              .catch(fail("Could not reject the invoice"))
          }
        />
      )}
    </div>
  );
};
