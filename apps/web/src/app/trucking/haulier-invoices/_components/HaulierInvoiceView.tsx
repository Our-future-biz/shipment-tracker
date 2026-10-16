"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Spin, Tooltip } from "antd";
import { ArrowLeftOutlined, DownloadOutlined } from "@ant-design/icons";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate, businessDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useHaulier } from "@/hooks/useTrucking";
import { fetchHaulierInvoiceFile, useHaulierInvoice, type HaulierInvoiceLine } from "@/hooks/useTruckingMoney";
import { btnDefault, btnPrimary } from "@/components/buttons";
import { downloadDataUrl } from "@/lib/files";
import { formatBankAccount } from "../../_lib/bankAccounts";
import { tripHref } from "../../_lib/consignments";
import { TERMS } from "../../_lib/glossary";
import { INVOICE_STATUS_CHIP, TARGET_KIND_LABELS, differenceText, haulierVatCardHref, invoiceDecisionState, vatBlockers } from "../../_lib/haulierInvoices";
import { isTruckingManager } from "../../_lib/roles";
import { formatMoney } from "../../_lib/tariffs";
import { fileDataUrl } from "../../_lib/tariffUpload";
import { TruckingStatusChip } from "../../_components/TruckingStatusChip";
import { TruckingTextModal } from "../../_components/TruckingTextModal";

const LIST_HREF = "/trucking?tab=haulierInvoices";
const card = "bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0";
const cardLabel = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

const Line = ({ k, v, tone = "" }: { k: string; v: ReactNode; tone?: string }) => (
  <div className="flex items-baseline gap-2 text-xs">
    <span className="shrink-0 text-slate-500">{k}</span>
    <span className={`ml-auto text-right font-semibold break-words ${tone || "text-slate-900"}`}>{v || "—"}</span>
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
  const { invoice: inv, isLoading, error, approve, reject } = useHaulierInvoice(invoiceId);
  const { haulier } = useHaulier(inv?.haulierCustomerId ?? "", { enabled: inv?.status === "BLOCKED" });
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);

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
        <Link href={LIST_HREF} className="text-indigo-500">
          Back to Haulier invoices
        </Link>
      </div>
    );
  }

  const decision = invoiceDecisionState(inv, isTruckingManager(user));
  const fixes = haulier ? vatBlockers(haulier.profile, inv.bankAccount) : [];
  const check = inv.bankAccountCheck;
  const fail = (what: string) => (e: unknown) => {
    toast.error(`${what}: ${apiErrorMessage(e)}`);
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
            <Link href={LIST_HREF} aria-label="Back to Haulier invoices" className="mt-1 p-1 text-slate-400 hover:text-indigo-500">
              <ArrowLeftOutlined />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 font-mono text-[22px] font-bold text-slate-800">{inv.invoiceNumber}</h1>
                <TruckingStatusChip chip={INVOICE_STATUS_CHIP[inv.status]} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {TERMS.haulierInvoice} from{" "}
                <Link href={`/trucking/hauliers/${inv.haulierCustomerId}`} className="font-semibold text-indigo-500 hover:underline">
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
                <Link href={haulierVatCardHref(inv.haulierCustomerId)} className="font-semibold text-indigo-600 hover:underline">
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
            message={`Not an exact match: ${differenceText(inv.difference, inv.currency)} — a manager approves it with a reason, or rejects it.`}
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

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className={card}>
            <div className={cardLabel}>Dates</div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              <Line k="Issued" v={formatDate(inv.issueDate)} />
              <Line k="Due" v={formatDate(inv.dueDate)} />
              <Line k="DUZP" v={formatDate(inv.duzp)} />
            </div>
          </div>
          <div className={card}>
            <div className={cardLabel}>Totals · {inv.currency}</div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              <Line k="Net" v={formatMoney(inv.totalNet, inv.currency)} />
              <Line k="VAT" v={formatMoney(inv.vatAmount, inv.currency)} />
              <Line k="Gross" v={formatMoney(inv.totalGross, inv.currency)} />
              <Line k="Difference" v={differenceText(inv.difference, inv.currency)} tone={inv.difference ? "text-amber-700" : "text-emerald-700"} />
            </div>
          </div>
          <div className={card}>
            <div className={cardLabel}>{TERMS.vatBankAccountCheck}</div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              <Line k="Account" v={<span className="font-mono">{formatBankAccount(inv.bankAccount)}</span>} />
              <Line
                k="Published"
                v={check.published == null ? "Not checked" : check.published ? "Yes" : "No"}
                tone={check.published === false ? "text-red-600" : check.published ? "text-emerald-700" : "text-amber-700"}
              />
              <Line k="Checked" v={formatDate(check.checkedAt)} />
              {check.note && <Line k="Note" v={check.note} />}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Trip / leg</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Our claims</th>
                <th className="px-3 py-2 text-right">Invoiced</th>
                <th className="px-3 py-2 text-right">Difference</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-1.5">{TARGET_KIND_LABELS[l.target.kind]}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold">
                    {l.target.kind === "TRIP" ? (
                      <Link href={tripHref(l.target.id)} className="text-indigo-600 hover:underline">
                        {l.target.ref}
                      </Link>
                    ) : (
                      l.target.ref
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(l.expected, l.currency)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">{l.claimed ? formatMoney(l.claimed, l.currency) : ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(l.invoiced, l.currency)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${l.difference ? "font-semibold text-amber-700" : "text-emerald-700"}`}>{differenceText(l.difference, l.currency)}</td>
                  <td className="px-3 py-1.5 text-slate-600">{l.note}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(sum((l) => l.expected), inv.currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(sum((l) => l.claimed), inv.currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(sum((l) => l.invoiced), inv.currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{differenceText(sum((l) => l.difference), inv.currency)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>
        <p className="mt-2 mb-0 text-[11.5px] text-slate-500">
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
