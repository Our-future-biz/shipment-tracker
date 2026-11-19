"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "antd";
import { Table } from "@/components/Table";
import type { ColumnsType } from "antd/es/table";
import { CockpitLine } from "@/components/cockpit/CockpitLine";
import { Pill } from "@/components/Pill";
import type { OpsCockpitAudit } from "@/hooks/useShipmentsManagersCockpit";
import { useShipmentsManagersAudit } from "@/hooks/useShipmentsManagersAudit";
import { businessDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { EMPTY, HINT, LINK, MODAL_TITLE, REF } from "@/styles/ui";
import { cutoffsToast } from "../_lib/cockpitActions";
import { auditFigures, auditLabel, auditLineLabel, auditListNote, auditListRows, offersTakeBack, type AuditListRow } from "../_lib/cockpitAudit";
import { DismissCutoffDialog } from "./DismissCutoffDialog";

const dash = <span className={EMPTY}>—</span>;

// The job's number opens its shipment. A deleted job keeps its number here and is linked all the
// same: where the link ends is the shipment page's to say.
const COLUMNS: ColumnsType<AuditListRow> = [
  {
    title: "Internal Reference",
    key: "job",
    width: 170,
    render: (_: unknown, r) => (
      <Link href={`/shipments/${encodeURIComponent(r.shipmentId)}`} className={`${REF} font-semibold ${LINK}`}>
        {r.jobNumber || "No job number"}
      </Link>
    ),
  },
  { title: "Who", dataIndex: "who", width: 230, render: (v: string) => v || dash },
  // On the company's clock, wherever the manager sits.
  { title: "When (Prague time)", dataIndex: "at", width: 170, render: (v: string) => <span className="tabular-nums whitespace-nowrap">{businessDateTime(v) || dash}</span> },
  { title: "What", dataIndex: "what", render: (v: string) => <div className="w-[460px] max-w-full whitespace-normal break-words">{v || dash}</div> },
];

// The rows behind one figure of the line. Read when it opens; a read that failed says so - it is
// not "nothing happened". A row of "Missed cut-offs dismissed" also offers "Take back…" (N3): a
// cut-off dismissed when it was the job's only signal leaves the job off the cards, so no card row's
// "⋯" reaches it. It opens the job's dismissals as they stand now - the same list a card row's
// "Dismissed cut-offs…" opens, each taken back there - for this row may have been taken back already.
function AuditDialog({ auditKey, days, onClose }: { auditKey: string | null; days: number; onClose: () => void }) {
  const { list, isLoading, isError } = useShipmentsManagersAudit(auditKey);
  const toast = useToast();
  const rows = auditListRows(list?.rows ?? []);
  const [takingBack, setTakingBack] = useState<{ id: string; jobNumber: string } | null>(null);
  const columns: ColumnsType<AuditListRow> = offersTakeBack(auditKey)
    ? [
        ...COLUMNS,
        {
          title: <span className="sr-only">Actions</span>,
          key: "takeBack",
          width: 110,
          render: (_: unknown, r) => (
            <button
              type="button"
              onClick={() => setTakingBack({ id: r.shipmentId, jobNumber: r.jobNumber })}
              className={`${LINK} whitespace-nowrap text-[12px] font-medium cursor-pointer bg-transparent border-none p-0`}
              aria-label={`Take back a dismissed cut-off of ${r.jobNumber || "this job"}`}
            >
              Take back…
            </button>
          ),
        },
      ]
    : COLUMNS;
  return (
    <Modal
      open={auditKey !== null}
      onCancel={onClose}
      title={
        auditKey !== null && (
          <div>
            <div className={MODAL_TITLE}>
              {auditLabel(auditKey)} · last {days} days
            </div>
            <div className={`${HINT} font-normal mt-0.5`}>{list ? auditListNote(list) : isError ? "Could not be loaded" : "Loading…"}</div>
          </div>
        )
      }
      width="min(1100px, calc(100vw - 48px))"
      footer={null}
      destroyOnHidden
    >
      <Table<AuditListRow>
        size="small"
        rowKey="key"
        scroll={{ x: "max-content" }}
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small", showSizeChanger: false }}
        locale={{
          emptyText: isError ? (
            <span className="text-[13px] text-red-500">Could not load these rows. Close and open the list to try again.</span>
          ) : (
            <span className="text-[13px] text-slate-400">{isLoading ? "" : `Nothing in the last ${days} days.`}</span>
          ),
        }}
      />
      {/* The job's dismissals, each to be taken back - the dialog a card row's "Dismissed cut-offs…" opens. The
          audit row itself stays: it is the record that the cut-off was dismissed. */}
      <DismissCutoffDialog
        open={takingBack !== null}
        job={takingBack}
        cutoffs={[]}
        onClose={() => setTakingBack(null)}
        onDone={(what) => {
          const said = cutoffsToast(takingBack?.jobNumber ?? "", what);
          if (said.tone === "success") toast.success(said.text);
          else toast.info(said.text);
        }}
      />
    </Modal>
  );
}

// Under the Team line: what happened in the company's last seven days that a manager wants to
// know of, whatever mode, direction or person the page is narrowed to. Only what happened at
// least once is shown; a figure opens its rows. Deciding requests gets an amber mark when nearly
// all were approved - a share like that asks whether anybody looked.
export function AuditLine({ audit }: { audit: OpsCockpitAudit }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const figures = auditFigures(audit);
  return (
    <>
      <CockpitLine label={auditLineLabel(audit)}>
        {figures.length === 0 && <span className="text-slate-500">Nothing to report</span>}
        {figures.map((f) => (
          <span key={f.key} className="inline-flex flex-wrap items-baseline gap-x-1.5">
            <button
              type="button"
              onClick={() => setOpenKey(f.key)}
              title="Show the rows"
              aria-label={`${f.label}: ${f.count}. Show the rows`}
              className="p-0 border-none bg-transparent cursor-pointer text-left text-xs text-slate-700 hover:underline"
            >
              {f.label} <b className="tabular-nums text-slate-900">{f.count}</b>
            </button>
            {f.rubberStamp && (
              <Pill tone="amber" title="Nearly every request was approved: is each one looked at?">
                {f.rubberStamp}
              </Pill>
            )}
          </span>
        ))}
      </CockpitLine>
      <AuditDialog auditKey={openKey} days={audit.days} onClose={() => setOpenKey(null)} />
    </>
  );
}
