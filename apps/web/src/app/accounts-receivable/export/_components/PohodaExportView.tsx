"use client";

import { useRef, useState } from "react";
import dayjs from "dayjs";
import { Alert, DatePicker, Switch, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined, ExportOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { DataTable } from "@/components/DataTable";
import { Section } from "@/components/finance/DrawerParts";
import { useAccountingExports, usePohodaExport, type AccountingExports, type PohodaExport } from "@/hooks/useReceivableTools";
import { apiErrorMessage, isAPIError } from "@/lib/api";
import { businessDateTime, businessToday, formatDate } from "@/lib/date";
import { saveBlob } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { BTN, BTN_PRIMARY, CARD, EMPTY, HINT, LABEL_TEXT, PAGE_TITLE, REF, TD, TH } from "@/styles/ui";
import { base64ToBytes, kindLabel, periodProblem, previousMonth, skippedOfDetails, type SkippedDocument } from "../_lib/export";

// Finance → Accounts Receivable → Export to Pohoda (step 7): the invoices and credit notes issued in a period, as a
// Pohoda XML import file. A manager exports; the server builds the file (Windows-1250) and records the export and its
// documents, so the next export leaves them out unless they are included again. The file is saved exactly as the
// server sent its bytes. One way only: payments never come back from Pohoda.

type ExportSummary = AccountingExports["exports"][number];

const historyColumns: ColumnsType<ExportSummary> = [
  { title: "Issued from", key: "period", render: (_, x) => <span className="tabular-nums whitespace-nowrap">{`${formatDate(x.from)} – ${formatDate(x.to)}`}</span> },
  { title: "Documents", key: "documents", align: "right", render: (_, x) => <span className="tabular-nums">{x.documents}</span> },
  { title: "File", key: "file", render: (_, x) => <span className="whitespace-nowrap">{x.fileName}</span> },
  {
    title: "Exported by",
    key: "by",
    render: (_, x) => (
      <div className="whitespace-nowrap">
        {x.createdBy || <span className={EMPTY}>—</span>}
        <div className="text-[11px] text-slate-500 tabular-nums">{businessDateTime(x.createdAt)}</div>
      </div>
    ),
  },
  {
    title: "SHA-256",
    key: "sha",
    render: (_, x) => (
      <Tooltip title={`The file's fingerprint as recorded: ${x.fileSha256}`}>
        <span className={`${REF} text-slate-500`}>{x.fileSha256.slice(0, 12)}…</span>
      </Tooltip>
    ),
  },
];

function SkippedTable({ list }: { list: readonly SkippedDocument[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Number</th>
            <th className={TH}>Kind</th>
            <th className={TH}>Issued</th>
            <th className={TH}>Why not in the file</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={`${s.kind}:${s.number}`}>
              <td className={`${TD} ${REF} whitespace-nowrap`}>{s.number}</td>
              <td className={TD}>{kindLabel(s.kind)}</td>
              <td className={`${TD} tabular-nums whitespace-nowrap`}>{formatDate(s.issueDate)}</td>
              <td className={TD}>{s.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Hands the file to the browser: the server's bytes as they are (Windows-1250), never turned into text. */
function saveExportFile(result: PohodaExport): void {
  const bytes = base64ToBytes(result.contentBase64);
  saveBlob(new Blob([bytes], { type: result.contentType || "application/xml; charset=windows-1250" }), result.fileName);
}

export function PohodaExportView() {
  const today = businessToday();
  const [period, setPeriod] = useState(() => previousMonth(today));
  const [includeExported, setIncludeExported] = useState(false);
  const [result, setResult] = useState<PohodaExport | null>(null);
  const [failure, setFailure] = useState<{ message: string; skipped: SkippedDocument[] } | null>(null);
  const [saveFailed, setSaveFailed] = useState("");
  const history = useAccountingExports();
  const exportFile = usePohodaExport();
  const toast = useToast();
  const canExport = !!history.data?.canExport;
  const problem = periodProblem(period.from, period.to, today);

  const save = (r: PohodaExport) => {
    try {
      saveExportFile(r);
      setSaveFailed("");
      return true;
    } catch (e) {
      setSaveFailed(e instanceof Error ? e.message : "The file could not be saved");
      return false;
    }
  };

  // One key per export started: trying the same export again after a lost answer gets the same export back, never a
  // second one (the server records an export as it builds the file). A finished export, or other choices, start anew.
  const attempt = useRef<{ choices: string; key: string } | null>(null);
  const keyFor = (choices: string): string => {
    if (attempt.current?.choices !== choices) attempt.current = { choices, key: `pohoda:${crypto.randomUUID()}` };
    return attempt.current.key;
  };

  const run = () => {
    if (problem || exportFile.isPending) return;
    setFailure(null);
    setSaveFailed("");
    const choices = JSON.stringify([period.from, period.to, includeExported]);
    exportFile
      .mutateAsync({ from: period.from, to: period.to, includeExported, idempotencyKey: keyFor(choices) })
      .then((r) => {
        attempt.current = null;
        setResult(r);
        if (save(r)) toast.success(`Exported ${r.documents} ${r.documents === 1 ? "document" : "documents"} to ${r.fileName}`);
      })
      .catch((e) => {
        setResult(null);
        setFailure({ message: apiErrorMessage(e), skipped: isAPIError(e) ? skippedOfDetails(e.details) : [] });
      });
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <BackLink href="/accounts-receivable" className="-mb-3 self-start">
          Accounts Receivable
        </BackLink>
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${CARD} px-4 py-3`}>
          <h1 className={PAGE_TITLE}>Export to Pohoda</h1>
          <div className="flex flex-wrap items-center justify-end gap-3 ml-auto">
            <label className="flex items-center gap-2">
              <span className={LABEL_TEXT}>Issued from</span>
              <DatePicker
                allowClear={false}
                format="D.M.YYYY"
                value={dayjs(period.from)}
                disabledDate={(d) => d.format("YYYY-MM-DD") > today}
                onChange={(d) => d && setPeriod((p) => ({ ...p, from: d.format("YYYY-MM-DD") }))}
                aria-label="Issued from"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className={LABEL_TEXT}>to</span>
              <DatePicker
                allowClear={false}
                format="D.M.YYYY"
                value={dayjs(period.to)}
                onChange={(d) => d && setPeriod((p) => ({ ...p, to: d.format("YYYY-MM-DD") }))}
                aria-label="Issued to"
              />
            </label>
            <Tooltip title="Documents exported before are left out, so Pohoda never gets one twice. Include them only when they were removed in Pohoda, or the import failed there.">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch size="small" checked={includeExported} onChange={setIncludeExported} aria-label="Include documents exported before" />
                <span className="text-[13px] text-slate-700">Include documents exported before</span>
              </label>
            </Tooltip>
            {canExport && (
              <Tooltip title={problem || undefined}>
                <button type="button" disabled={!!problem || exportFile.isPending} onClick={run} className={BTN_PRIMARY}>
                  <ExportOutlined />
                  {exportFile.isPending ? "Exporting…" : "Export"}
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        <div className={HINT}>
          The invoices and credit notes issued in the period, by their issue day, as a Pohoda XML file (Windows-1250). Cancelled invoices never go: they were withdrawn on
          their issue day and issued again under a new number. Each export is recorded with its documents. Payments are not exported and never come back from Pohoda: they are
          noted here, from the bank statement.
          {history.data && !canExport && " Only a manager exports."}
        </div>
        <Alert type="info" showIcon message="Import the file in Pohoda: Soubor → Datová komunikace → XML import. Check the first import with your accountant." />
        {problem && <div className="text-[13px] text-amber-700">{problem}</div>}
        {includeExported && (
          <Alert type="warning" showIcon message="Documents exported before go into the file again. Pohoda refuses a number it already has: remove them there first, or leave this off." />
        )}

        {failure && (
          <div className={`${CARD} px-4 py-3 flex flex-col gap-3`}>
            <Alert type="error" showIcon message={`Not exported: ${failure.message}`} />
            {failure.skipped.length > 0 && <SkippedTable list={failure.skipped} />}
          </div>
        )}

        {result && (
          <div className={`${CARD} px-4 py-3 flex flex-col gap-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[14px] font-semibold text-slate-900">
                {result.fileName}: {result.documents} {result.documents === 1 ? "document" : "documents"} ({result.invoices} {result.invoices === 1 ? "invoice" : "invoices"},{" "}
                {result.creditNotes} {result.creditNotes === 1 ? "credit note" : "credit notes"}) issued {formatDate(result.from)} – {formatDate(result.to)}
              </div>
              <button type="button" onClick={() => save(result) && toast.success(`Saved ${result.fileName} again`)} className={`${BTN} ml-auto`}>
                <DownloadOutlined />
                Save the file again
              </button>
            </div>
            <div className={HINT}>
              Recorded as exported, with the file&apos;s fingerprint (SHA-256 <span className={REF}>{result.fileSha256}</span>). Encoding {result.encoding}. Saving the file
              again does not export again.
            </div>
            {saveFailed && <Alert type="error" showIcon message={`The export was recorded, but the file could not be saved: ${saveFailed}. Try “Save the file again”.`} />}
            {result.warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message="Look at these before the import"
                description={
                  <ul className="m-0 pl-4">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}
            {result.notes.length > 0 && (
              <Section title={`To check in Pohoda after the import (${result.notes.length})`}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={TH}>Number</th>
                      <th className={TH}>What to check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.notes.map((n, i) => (
                      <tr key={`${n.number}:${i}`}>
                        <td className={`${TD} ${REF} whitespace-nowrap`}>{n.number}</td>
                        <td className={TD}>{n.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}
            {result.skipped.length > 0 && (
              <Section title={`Not in the file (${result.skipped.length})`}>
                <SkippedTable list={result.skipped} />
              </Section>
            )}
            <Section title={`In the file (${result.numbers.length})`}>
              <div className={`text-[12px] text-slate-600 ${REF} break-words`}>{result.numbers.join(", ")}</div>
            </Section>
          </div>
        )}

        <Section title="Exports made">
          {history.isError && !history.data && <Alert type="error" showIcon message={`Could not load the exports: ${apiErrorMessage(history.error)}`} />}
          <DataTable<ExportSummary>
            dataSource={history.data?.exports}
            columns={historyColumns}
            rowKey="id"
            loading={history.isLoading}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: history.isLoading ? "Loading…" : history.isError ? "Could not load the exports" : "Nothing exported yet" }}
          />
          {history.data && history.data.exports.length >= 200 && <div className={HINT}>The newest 200 exports are listed.</div>}
        </Section>
      </div>
    </div>
  );
}
