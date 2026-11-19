"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Alert, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { UploadOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { DataTable } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { useBankStatements, useImportBankStatement, type BankStatementSummary } from "@/hooks/useReceivableTools";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime } from "@/lib/date";
import { fileToBase64 } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { replaceSearchParams } from "@/lib/urlParams";
import { BTN_PRIMARY, CARD, EMPTY, HINT, PAGE_TITLE, REF } from "@/styles/ui";
import { isForbidden } from "../../_lib/receivables";
import { countsText, fileProblem, MANAGERS_ONLY_TEXT, periodText } from "../_lib/bank";
import { StatementView } from "./StatementView";

// Finance → Accounts Receivable → Bank statements (step 7; the bank gives CAMT.053 XML). A manager reads a statement
// file; each incoming entry is matched to the invoices it may pay and waits for a manager to confirm it as payments or
// set it aside. Nothing is noted as paid without that click (D11). Managers only, reading too (mock test council X6: a
// statement shows every payment in and out of the account). The open statement is kept in the
// URL (?statement=…).

const none = <span className={EMPTY}>—</span>;

const columns: ColumnsType<BankStatementSummary> = [
  {
    title: "File",
    key: "file",
    render: (_, s) => (
      <div className="max-w-[320px]">
        <div className="font-medium text-slate-900 truncate" title={s.fileName}>
          {s.fileName}
        </div>
        <div className="text-[11px] text-slate-500 truncate" title={s.statementRef}>
          {s.format}
          {s.statementRef ? ` · ${s.statementRef}` : ""}
        </div>
      </div>
    ),
  },
  {
    title: "Account",
    key: "account",
    render: (_, s) => (
      <span className="whitespace-nowrap">
        <span className={REF}>{s.accountIban || "—"}</span>
        {s.currency && <span className="ml-1.5 text-slate-500">{s.currency}</span>}
      </span>
    ),
  },
  { title: "Period", key: "period", render: (_, s) => <span className="tabular-nums whitespace-nowrap">{periodText(s.fromDate, s.toDate)}</span> },
  { title: "Entries", key: "entries", align: "right", render: (_, s) => <span className="tabular-nums">{s.entries}</span> },
  {
    title: "State",
    key: "state",
    render: (_, s) => (
      <div className="flex flex-wrap items-center gap-1.5 max-w-[360px]">
        {s.counts.toDecide > 0 ? <Pill tone="amber">{s.counts.toDecide} to decide</Pill> : <Pill tone="green">All decided</Pill>}
        <span className={HINT}>{countsText({ ...s.counts, toDecide: 0 })}</span>
      </div>
    ),
  },
  {
    title: "Read by",
    key: "by",
    render: (_, s) => (
      <div className="whitespace-nowrap">
        {s.importedBy || none}
        <div className="text-[11px] text-slate-500 tabular-nums">{businessDateTime(s.importedAt)}</div>
      </div>
    ),
  },
];

export function BankStatementsView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = searchParams.get("statement");
  const setOpen = (id: string | null) => replaceSearchParams(pathname, { statement: id });

  const list = useBankStatements();
  const importFile = useImportBankStatement();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  // The server's refusal stays on the page until the next try (the same file twice, a file that is no statement…).
  const [refusal, setRefusal] = useState("");
  const canAct = !!list.data?.canAct;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setRefusal("");
    const problem = fileProblem(file);
    if (problem) {
      setRefusal(problem);
      return;
    }
    try {
      const contentBase64 = await fileToBase64(file);
      const data = await importFile.mutateAsync({ fileName: file.name, contentBase64 });
      const s = data.statement;
      toast.success(`Read ${file.name}: ${s.entries} ${s.entries === 1 ? "entry" : "entries"}, ${s.counts.toDecide} to decide`);
      setOpen(s.id);
    } catch (e) {
      setRefusal(`${file.name} was not read: ${apiErrorMessage(e)}`);
    }
  };

  if (openId) {
    return (
      <Frame>
        <StatementView id={openId} onBack={() => setOpen(null)} onOpen={setOpen} />
      </Frame>
    );
  }

  return (
    <Frame>
      <BackLink href="/accounts-receivable" className="-mb-3 self-start">
        Accounts Receivable
      </BackLink>
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${CARD} px-4 py-3`}>
        <h1 className={PAGE_TITLE}>Bank statements</h1>
        <div className="flex flex-wrap items-center justify-end gap-3 ml-auto">
          {canAct && (
            <>
              {/* The file is read in the browser and sent as base64; the server keeps only what it read from it. */}
              <input
                ref={input}
                type="file"
                accept=".xml,application/xml,text/xml"
                className="hidden"
                aria-label="Bank statement file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Cleared, so choosing the same file again (after a refusal) is a new choice.
                  e.target.value = "";
                  void onFile(file);
                }}
              />
              <Tooltip title="The bank's statement as CAMT.053 XML (ISO 20022), at most 10 MB">
                <button type="button" disabled={importFile.isPending} onClick={() => input.current?.click()} className={BTN_PRIMARY}>
                  <UploadOutlined />
                  {importFile.isPending ? "Reading…" : "Read a statement…"}
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <div className={HINT}>
        A manager reads the bank&apos;s statement (CAMT.053 XML). Each incoming payment is matched to the invoices it may pay, by the invoice number in its message, the
        variable symbol and the amount; nothing is noted as paid until a manager confirms it. The file itself is not kept: only what was read from it. The same file twice is
        refused; a payment that is in two files is kept once.
        {!canAct && list.data && " Only a manager reads a statement and confirms its payments."}
      </div>

      {refusal && <Alert type="error" showIcon closable onClose={() => setRefusal("")} message={refusal} />}
      {list.isError && !list.data && (isForbidden(list.error) ? <Alert type="info" showIcon message={MANAGERS_ONLY_TEXT} /> : <Alert type="error" showIcon message={`Could not load the bank statements: ${apiErrorMessage(list.error)}`} />)}

      <DataTable<BankStatementSummary>
        dataSource={list.data?.statements}
        columns={columns}
        rowKey="id"
        loading={list.isLoading}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: list.isLoading ? "Loading…" : list.isError ? "Could not load the bank statements" : "No bank statement read yet" }}
        onRow={(s) => ({ onClick: () => setOpen(s.id), className: "cursor-pointer" })}
      />
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">{children}</div>
    </div>
  );
}
