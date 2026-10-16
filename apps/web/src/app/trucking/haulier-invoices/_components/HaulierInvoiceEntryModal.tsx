"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, DatePicker, Input, InputNumber, Modal, Select, Table } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { formatFileSize } from "@/lib/files";
import { useHaulier, useHauliers } from "@/hooks/useTrucking";
import { useInvoiceCandidates, type HaulierInvoiceCreate, type InvoiceCandidate } from "@/hooks/useTruckingMoney";
import { normaliseBankAccount } from "../../_lib/bankAccounts";
import { CURRENCIES } from "../../_lib/hauliers";
import { TARGET_KIND_LABELS, differenceText, entryProblems, entrySummary, lineDifference, linesTotal, vatBlockers, type EntryHeader, type EntryLine } from "../../_lib/haulierInvoices";
import { formatMoney } from "../../_lib/tariffs";
import { readUpload, uploadProblem } from "../../_lib/uploads";
import { TruckingField } from "../../_components/TruckingField";
import { round2 } from "@/lib/money";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));
const EMPTY_HEADER: EntryHeader = { invoiceNumber: "", issueDate: null, currency: "CZK", totalNet: null, vatAmount: null, totalGross: null, bankAccount: "" };

const diffClass = (d: number) => (d === 0 ? "text-emerald-700" : "font-semibold text-amber-700");

interface DateInputProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

const DateInput = ({ label, value, onChange }: DateInputProps) => (
  <DatePicker aria-label={label} format="DD.MM.YYYY" value={value ? dayjs(value) : null} onChange={(d) => onChange(d ? d.format("YYYY-MM-DD") : null)} className="w-full" />
);

interface HaulierInvoiceEntryModalProps {
  onClose: () => void;
  /** Saves the invoice; rejects to keep the dialog open (the caller reports the error). */
  onCreate: (req: HaulierInvoiceCreate) => Promise<unknown>;
}

// Enter a haulier's invoice: the haulier, the trips and partner deliveries it bills (ticked from
// what is not yet on an approved invoice), the amount of each with its difference shown live,
// the header (number, dates, totals, bank account) and optionally its PDF.
export const HaulierInvoiceEntryModal = ({ onClose, onCreate }: HaulierInvoiceEntryModalProps) => {
  const { hauliers } = useHauliers();
  const [haulierId, setHaulierId] = useState<string | null>(null);
  const { targets, isLoading: candidatesLoading, isError: candidatesError } = useInvoiceCandidates(haulierId);
  const { haulier } = useHaulier(haulierId ?? "", { enabled: !!haulierId });
  const [header, setHeader] = useState<EntryHeader>(EMPTY_HEADER);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [duzp, setDuzp] = useState<string | null>(null);
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setH = <K extends keyof EntryHeader>(key: K, value: EntryHeader[K]) => setHeader((h) => ({ ...h, [key]: value }));
  const lineOf = (id: string) => lines.find((l) => l.target.id === id);
  const setLine = (id: string, patch: Partial<EntryLine>) => setLines((ls) => ls.map((l) => (l.target.id === id ? { ...l, ...patch } : l)));

  const handleHaulier = (id: string) => {
    setHaulierId(id);
    setLines([]);
  };
  const handleSelect = (keys: React.Key[]) => {
    const chosen = new Set(keys.map(String));
    setLines((ls) => [
      ...ls.filter((l) => chosen.has(l.target.id)),
      // A newly ticked line starts at its expected amount: the usual case is an exact match.
      ...targets.filter((t) => chosen.has(t.id) && !ls.some((l) => l.target.id === t.id)).map((t) => ({ target: t, invoiced: t.expected, note: "" })),
    ]);
  };

  // Net defaults to the sum of the lines and gross to net + VAT until typed.
  const effectiveHeader: EntryHeader = {
    ...header,
    totalNet: header.totalNet ?? (lines.length ? linesTotal(lines) : null),
    totalGross: header.totalGross ?? (header.vatAmount != null && lines.length ? round2((header.totalNet ?? linesTotal(lines)) + header.vatAmount) : null),
  };
  const summary = entrySummary(lines, effectiveHeader);
  const fileProblem = file ? uploadProblem(file, { imagesAndPdfOnly: true }) : null;
  const problems = [...entryProblems(haulierId, effectiveHeader, lines), ...(fileProblem ? [fileProblem] : [])];
  const blockers = haulier ? vatBlockers(haulier.profile, header.bankAccount) : [];

  const handleOk = async () => {
    if (!haulierId || !effectiveHeader.issueDate) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        haulierCustomerId: haulierId,
        invoiceNumber: effectiveHeader.invoiceNumber.trim(),
        issueDate: effectiveHeader.issueDate,
        dueDate,
        duzp,
        currency: effectiveHeader.currency,
        totalNet: effectiveHeader.totalNet ?? 0,
        vatAmount: effectiveHeader.vatAmount ?? 0,
        totalGross: effectiveHeader.totalGross ?? 0,
        bankAccount: normaliseBankAccount(effectiveHeader.bankAccount),
        ...(file ? await readUpload(file) : {}),
        lines: lines.map((l) => ({ targetKind: l.target.kind, targetId: l.target.id, invoiced: l.invoiced ?? 0, note: l.note.trim() })),
      });
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: "kind", title: "Kind", render: (_: unknown, t: InvoiceCandidate) => TARGET_KIND_LABELS[t.kind] },
    { key: "ref", title: "Trip / leg", render: (_: unknown, t: InvoiceCandidate) => <span className="font-mono font-semibold">{t.ref}</span> },
    { key: "date", title: "Date", render: (_: unknown, t: InvoiceCandidate) => formatDate(t.date) },
    { key: "expected", title: "Expected", align: "right" as const, render: (_: unknown, t: InvoiceCandidate) => formatMoney(t.expected, t.currency) },
    {
      key: "claimed",
      title: "Our claims",
      align: "right" as const,
      render: (_: unknown, t: InvoiceCandidate) => (t.claimed ? <span className="text-amber-700">{formatMoney(t.claimed, t.currency)}</span> : <span className="text-slate-400">—</span>),
    },
    {
      key: "invoiced",
      title: "Invoiced",
      width: 150,
      render: (_: unknown, t: InvoiceCandidate) => {
        const line = lineOf(t.id);
        return line ? (
          <InputNumber aria-label={`Invoiced for ${t.ref}`} min={0} value={line.invoiced} onChange={(v) => setLine(t.id, { invoiced: v ?? null })} className="w-full" />
        ) : null;
      },
    },
    {
      key: "difference",
      title: "Difference",
      align: "right" as const,
      render: (_: unknown, t: InvoiceCandidate) => {
        const line = lineOf(t.id);
        if (!line) return null;
        const d = lineDifference(line.invoiced, t.expected);
        return <span className={diffClass(d)}>{differenceText(d, t.currency)}</span>;
      },
    },
    {
      key: "note",
      title: "Note",
      render: (_: unknown, t: InvoiceCandidate) => {
        const line = lineOf(t.id);
        return line ? <Input aria-label={`Note for ${t.ref}`} size="small" value={line.note} onChange={(e) => setLine(t.id, { note: e.target.value })} /> : null;
      },
    },
  ];

  return (
    <Modal open title="Enter haulier invoice" okText="Save invoice" okButtonProps={{ disabled: problems.length > 0 }} confirmLoading={busy} onOk={handleOk} onCancel={onClose} destroyOnHidden width={1080}>
      <div className="flex flex-col gap-4">
        <TruckingField label="Haulier">
          <Select
            aria-label="Haulier"
            showSearch
            optionFilterProp="label"
            placeholder="Choose the haulier who sent the invoice"
            value={haulierId}
            options={hauliers.map((h) => ({ value: h.customerId, label: h.ico ? `${h.companyName} · IČO ${h.ico}` : h.companyName }))}
            onChange={handleHaulier}
          />
        </TruckingField>

        {haulierId && (
          <Table<InvoiceCandidate>
            size="small"
            rowKey="id"
            loading={candidatesLoading}
            pagination={false}
            scroll={{ y: 320 }}
            dataSource={targets}
            columns={columns}
            locale={{ emptyText: candidatesError ? "The trips could not be loaded." : "No delivered trips or partner deliveries of this haulier wait for an invoice." }}
            rowSelection={{
              selectedRowKeys: lines.map((l) => l.target.id),
              onChange: handleSelect,
              getCheckboxProps: (t) => ({ disabled: t.alreadyInvoiced, "aria-label": `Bill ${t.ref}` }),
            }}
          />
        )}

        {lines.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
            <span>
              Expected <b>{formatMoney(summary.expected, header.currency)}</b>
            </span>
            <span>
              Invoiced <b>{formatMoney(summary.invoiced, header.currency)}</b>
            </span>
            <span className={diffClass(summary.difference)}>Difference {differenceText(summary.difference, header.currency)}</span>
            <span className="ml-auto text-xs text-slate-500">
              {summary.exact ? "Exact match — approved by itself once saved (unless blocked)" : "Not an exact match — it will wait for a manager's approval with a reason"}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <TruckingField label="Invoice number">
            <Input aria-label="Invoice number" value={header.invoiceNumber} onChange={(e) => setH("invoiceNumber", e.target.value)} />
          </TruckingField>
          <TruckingField label="Issue date">
            <DateInput label="Issue date" value={header.issueDate} onChange={(v) => setH("issueDate", v)} />
          </TruckingField>
          <TruckingField label="Due date">
            <DateInput label="Due date" value={dueDate} onChange={setDueDate} />
          </TruckingField>
          <TruckingField label="DUZP" hint="Date of the taxable supply">
            <DateInput label="DUZP" value={duzp} onChange={setDuzp} />
          </TruckingField>
          <TruckingField label="Currency">
            <Select aria-label="Invoice currency" value={header.currency} options={CURRENCY_OPTIONS} onChange={(v) => setH("currency", v)} />
          </TruckingField>
          <TruckingField label="Net total" hint={summary.netDiffers ? "Differs from the sum of the lines" : undefined}>
            <InputNumber aria-label="Net total" min={0} value={effectiveHeader.totalNet} onChange={(v) => setH("totalNet", v ?? null)} className="w-full" />
          </TruckingField>
          <TruckingField label="VAT">
            <InputNumber aria-label="VAT amount" min={0} value={header.vatAmount} onChange={(v) => setH("vatAmount", v ?? null)} className="w-full" />
          </TruckingField>
          <TruckingField label="Gross total">
            <InputNumber aria-label="Gross total" min={0} value={effectiveHeader.totalGross} onChange={(v) => setH("totalGross", v ?? null)} className="w-full" />
          </TruckingField>
          <div className="col-span-2">
            <TruckingField label="Bank account on the invoice">
              <Input aria-label="Bank account" placeholder="19-2000145399/0800 or IBAN" value={header.bankAccount} onChange={(e) => setH("bankAccount", e.target.value)} />
            </TruckingField>
          </div>
          <div className="col-span-2">
            <TruckingField label="Invoice PDF (optional)" hint={file ? `${file.name} · ${formatFileSize(file.size)}` : "A PDF or a photo, up to 10 MB"}>
              <input type="file" aria-label="Invoice PDF" accept=".pdf,application/pdf,image/*" className="text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </TruckingField>
          </div>
        </div>

        {blockers.length > 0 && (
          <Alert
            type="error"
            showIcon
            message="This invoice will be blocked — nobody can approve it until this is fixed"
            description={
              <ul className="m-0 pl-5">
                {blockers.map((b) => (
                  <li key={b.problem}>
                    <b>{b.problem}.</b> {b.fix}.
                  </li>
                ))}
              </ul>
            }
          />
        )}
        {error && <Alert type="error" showIcon message={`Could not save the invoice: ${error}`} />}
        {problems.length > 0 && (haulierId || header.invoiceNumber) && <div className="text-[12px] text-slate-500">To save: {problems.join(" · ")}</div>}
      </div>
    </Modal>
  );
};
