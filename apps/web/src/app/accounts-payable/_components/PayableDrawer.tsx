"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Drawer, Spin, Tooltip } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/date";
import { chargeLabel } from "@/lib/chargeCodes";
import { formatAmount } from "@/lib/money";
import { useFilePreview } from "@/hooks/useFilePreview";
import { useSupplierInvoice, useSupplierInvoiceSeen } from "@/hooks/useSupplierInvoices";
import { EMPTY, HINT, LABEL_TEXT, LINK, MODAL_TITLE, REF, TD, TH } from "@/styles/ui";
import { MarkPills } from "./MarkPills";
import { PayableActions } from "./PayableActions";
import { PayableLines } from "./PayableLines";
import { RaiseClaim } from "./RaiseClaim";
import { amountsText, EVENT_LABELS, SOURCE_LABELS, statusChip, type PayableInvoice } from "../_lib/payables";

// One supplier invoice on a row click (or ?invoice=<id> from Costs Breakdown and the bell): its facts, lines,
// document, claims and history, and what a manager may do to it. Amounts are not edited here (D1). A claim on
// it can be raised here (build step 5, D15).

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={LABEL_TEXT}>{label}</div>
      <div className="mt-0.5 text-[13px] text-slate-700">{children}</div>
    </div>
  );
}

function Section({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-bold uppercase tracking-wider text-slate-900">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

const none = <span className={EMPTY}>—</span>;
const dayOrNone = (v: string | null) => (v ? <span className="tabular-nums">{formatDate(v)}</span> : none);

/** The read document's file as the invoice's detail carries it (the server asks the shipment that keeps it). */
interface DocumentFileState {
  file: interfaces.PayableDocumentFile | null;
  gone: boolean;
  /** A fresh link, for a preview whose link has expired (links last an hour); null when the file is gone. */
  freshUrl: () => Promise<string | null>;
}

/** The read document, kept as an attachment of a shipment (D18), opened in the app's preview. */
function DocumentLink({ document, state }: { document: NonNullable<PayableInvoice["document"]>; state: DocumentFileState }) {
  const preview = useFilePreview();
  const { file } = state;
  if (state.gone) return <span className={HINT}>{document.name || "The document"} is no longer among the shipment&apos;s documents.</span>;
  if (!file) return <span className={HINT}>{document.name || "The document"} could not be looked up just now: open the invoice again in a moment.</span>;
  const source = { fileName: file.fileName || document.name, contentUrl: file.contentUrl, fileType: file.fileType, refreshUrl: state.freshUrl };
  return (
    <>
      {/* The app's preview, its link renewed when it has expired. */}
      <a href={file.contentUrl} onClick={preview.previewOnClick(source)} className={`inline-flex items-center gap-1.5 font-medium ${LINK}`}>
        <FileTextOutlined />
        {file.fileName || document.name}
      </a>
      {preview.modal}
    </>
  );
}

function Facts({ invoice, documentFile }: { invoice: PayableInvoice; documentFile: DocumentFileState }) {
  const linkedId = invoice.supplierCustomerId ?? invoice.haulierId;
  const read = invoice.totalNet !== null || invoice.vatAmount !== null || invoice.totalGross !== null;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      <Fact label="Supplier">
        {linkedId ? (
          <Link href={`/customers/${encodeURIComponent(linkedId)}`} className={`font-medium ${LINK}`}>
            {invoice.supplier}
          </Link>
        ) : (
          <span className="font-medium text-slate-900">{invoice.supplier || "—"}</span>
        )}
        {invoice.vendor && invoice.vendor !== invoice.supplier && <div className={HINT}>Written on the lines: {invoice.vendor}</div>}
      </Fact>
      <Fact label="Invoice number">
        <span className={`${REF} font-semibold text-slate-900`}>{invoice.invoiceNumber || "—"}</span>
        {invoice.kind === "credit_note" && (
          <Pill tone="slate" className="ml-1.5">
            Credit note
          </Pill>
        )}
      </Fact>
      <Fact label="Issue date">{dayOrNone(invoice.issueDate)}</Fact>
      <Fact label="Due">
        {invoice.due ? (
          <>
            <span className="tabular-nums">{formatDate(invoice.due)}</span>
            <span className="text-slate-500"> · {invoice.dueSource === "invoice" ? "from the invoice" : "from the supplier's payment terms"}</span>
          </>
        ) : invoice.kind === "credit_note" ? (
          <span className="text-slate-500">A credit note is not due</span>
        ) : (
          none
        )}
      </Fact>
      <Fact label="Booked on">
        <span className="tabular-nums">{formatDate(invoice.bookedOn)}</span>
        {invoice.enteredBy && <span className="text-slate-500"> · by {invoice.enteredBy}</span>}
        <div className={HINT}>{SOURCE_LABELS[invoice.source] ?? invoice.source}</div>
      </Fact>
      <Fact label="Amount on the jobs">
        <span className="font-semibold text-slate-900 tabular-nums">{amountsText(invoice.amounts)}</span>
        <div className={HINT}>Without VAT, per currency</div>
      </Fact>
      <Fact label="As read from the document">
        {read ? (
          <span className="tabular-nums">
            {invoice.totalNet !== null ? `${formatAmount(Number(invoice.totalNet), invoice.currency)} without VAT` : "—"}
            {invoice.vatAmount !== null && ` · VAT ${formatAmount(Number(invoice.vatAmount), invoice.currency)}`}
            {invoice.totalGross !== null && ` · ${formatAmount(Number(invoice.totalGross), invoice.currency)} with VAT`}
          </span>
        ) : (
          <span className="text-slate-500">Not read</span>
        )}
      </Fact>
      <Fact label="Paid">
        {invoice.paidOn ? (
          <>
            <span className="tabular-nums">{formatDate(invoice.paidOn)}</span>
            {invoice.paidBy && <span className="text-slate-500"> · noted by {invoice.paidBy}</span>}
          </>
        ) : (
          none
        )}
      </Fact>
      {invoice.decidedAt && (
        <Fact label={invoice.status === "refused" ? "Refused" : "Approved"}>
          <span className="tabular-nums">{formatDateTime(invoice.decidedAt)}</span>
          {invoice.decidedBy && <span className="text-slate-500"> · {invoice.decidedBy}</span>}
          {invoice.selfDecision && <span className="text-slate-500"> · self-approval</span>}
          {invoice.decisionReason && <div className="whitespace-pre-wrap text-slate-700">“{invoice.decisionReason}”</div>}
        </Fact>
      )}
      {invoice.document && (
        <Fact label="Document">
          <DocumentLink document={invoice.document} state={documentFile} />
        </Fact>
      )}
    </div>
  );
}

const CLAIM_TONE: Record<string, "red" | "green" | "slate"> = { open: "red", accepted: "green", rejected: "slate", withdrawn: "slate" };

function Claims({ claims }: { claims: interfaces.PayableClaimItem[] }) {
  if (!claims.length) return <div className={HINT}>No cost claim on this invoice.</div>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {claims.map((c) => (
        <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={CLAIM_TONE[c.status] ?? "slate"}>{c.status ? c.status[0]!.toUpperCase() + c.status.slice(1) : "—"}</Pill>
            <span className="font-semibold tabular-nums text-slate-900">
              {c.claimAmount !== null ? formatAmount(Number(c.claimAmount), c.claimCurrency) : c.amountText || "No amount"}
            </span>
            {!c.linked && (
              <Tooltip title="Typed on the job before claims were tied to an invoice: matched by the job and the invoice number">
                <span className="text-[12px] text-slate-500">matched by number</span>
              </Tooltip>
            )}
            <Link href={`/shipments/${encodeURIComponent(c.shipmentId)}?tab=claim`} className={`ml-auto text-[12px] ${LINK}`}>
              Open the claim
            </Link>
          </div>
          {c.reason && <div className="mt-1 whitespace-pre-wrap text-slate-700">{c.reason}</div>}
        </li>
      ))}
    </ul>
  );
}

const DETAIL_LABELS: Record<string, string> = {
  issueDate: "issue date",
  dueDate: "due date",
  totalNet: "total without VAT",
  vatAmount: "VAT",
  totalGross: "total with VAT",
  currency: "currency",
  kind: "kind",
  supplierCustomerId: "supplier",
};

/** What a "details changed" or "paid" event changed, in a few words. */
function eventDetail(e: interfaces.PayableEventItem): string {
  const p = e.payload ?? {};
  if (e.action === "paid" && typeof p.paidOn === "string") return `paid on ${formatDate(p.paidOn)}`;
  if (e.action === "payment_taken_back" && typeof p.paidOn === "string") return `was paid on ${formatDate(p.paidOn)}`;
  if (e.action === "details_changed") {
    if ("supplierCustomerId" in p) return "supplier linked to the Customer Database";
    const keys = Object.keys(p).map((k) => DETAIL_LABELS[k] ?? k);
    return keys.length ? keys.join(", ") : "";
  }
  if (e.action === "line_changed" && Array.isArray(p.changed)) return (p.changed as unknown[]).map(String).join(", ");
  if (e.action === "approved" && p.selfDecision) return "self-approval";
  return "";
}

function History({ events }: { events: interfaces.PayableEventItem[] }) {
  if (!events.length) return <div className={HINT}>Nothing recorded yet.</div>;
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-2 border-l-2 border-slate-200 pl-3">
      {events.map((e) => {
        const detail = eventDetail(e);
        return (
          <li key={e.id} className="text-[13px]">
            <span className="font-semibold text-slate-900">{EVENT_LABELS[e.action] ?? e.action}</span>
            {detail && <span className="text-slate-700"> · {detail}</span>}
            <div className="text-[12px] text-slate-500 tabular-nums">
              {formatDateTime(e.at)}
              {e.by ? ` · ${e.by}` : ""}
            </div>
            {e.reason && <div className="whitespace-pre-wrap text-slate-700">“{e.reason}”</div>}
          </li>
        );
      })}
    </ol>
  );
}

function RefusedLines({ lines }: { lines: interfaces.PayableDetailResponse["refusedLines"] }) {
  if (!lines.length) return null;
  return (
    <Section title="Lines when refused">
      <div className={HINT}>Taken off the jobs on refusal and kept here for the record (D12).</div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={TH}>Charge</th>
            <th className={TH}>Description</th>
            <th className={`${TH} !text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, at) => (
            <tr key={`${l.ownerId}:${at}`}>
              <td className={TD}>{l.category ? chargeLabel(l.category) : "—"}</td>
              <td className={TD}>{l.description || "—"}</td>
              <td className={`${TD} !text-right tabular-nums whitespace-nowrap`}>{formatAmount(l.amount, l.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function PayableDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useSupplierInvoice(id);
  const seen = useSupplierInvoiceSeen();
  const detail = query.data;
  const invoice = detail?.invoice;

  // Opened once is seen: the bell stops telling of it (D10). Once per invoice, not on every refetch.
  const told = useRef<string | null>(null);
  const { mutate: markSeen } = seen;
  useEffect(() => {
    if (!id || !invoice || told.current === id) return;
    told.current = id;
    markSeen([id]);
  }, [id, invoice, markSeen]);

  const chip = invoice ? statusChip(invoice) : null;
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width={760}
      destroyOnHidden
      title={
        invoice ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={MODAL_TITLE}>
              {invoice.supplier || "Supplier invoice"} · <span className={REF}>{invoice.invoiceNumber}</span>
            </span>
            {chip && (
              <Tooltip title={chip.tip}>
                <Pill tone={chip.tone}>{chip.label}</Pill>
              </Tooltip>
            )}
          </div>
        ) : (
          "Supplier invoice"
        )
      }
    >
      {query.isLoading && (
        <div className="py-10 flex justify-center">
          <Spin />
        </div>
      )}
      {query.isError && !detail && (
        <Alert type="error" showIcon message={isNotFound(query.error) ? "This supplier invoice is not there." : `Could not load the invoice: ${apiErrorMessage(query.error)}`} />
      )}
      {detail && invoice && (
        <div className="flex flex-col gap-6">
          <MarkPills invoice={invoice} empty={false} />
          <Facts
            invoice={invoice}
            documentFile={{
              file: detail.documentFile,
              gone: detail.documentGone,
              freshUrl: async () => (await query.refetch()).data?.documentFile?.contentUrl ?? null,
            }}
          />
          <Section title="Actions">
            <PayableActions key={invoice.id} invoice={invoice} canDecide={detail.canDecide} />
          </Section>
          <Section title={`Lines (${invoice.lines.length})`}>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <PayableLines lines={invoice.lines} />
            </div>
          </Section>
          <RefusedLines lines={detail.refusedLines} />
          {/* Anyone may raise one, as on the job's Claims tab (D15); never on a refused invoice. */}
          <Section title="Claims" extra={<RaiseClaim invoice={invoice} />}>
            <Claims claims={invoice.claims} />
          </Section>
          <Section title="History">
            <History events={detail.events} />
          </Section>
        </div>
      )}
    </Drawer>
  );
}
