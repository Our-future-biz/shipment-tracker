"use client";

import Link from "next/link";
import { Button, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { businessDateTime } from "@/lib/date";
import { fetchTariffTemplate, fetchTariffVersionSource, type TariffVersionSummary } from "@/hooks/useTrucking";
import { validityLabel, versionLabel } from "../../_lib/tariffs";
import { TariffVersionStatusChip } from "../../_components/TariffVersionStatusChip";
import { TariffDownloadButton } from "./TariffDownloadButton";

export const versionHref = (tariffId: string, versionId: string) => `/trucking/tariffs/${tariffId}/versions/${versionId}`;

interface TariffVersionsTableProps {
  tariffId: string;
  versions: TariffVersionSummary[];
  /** A matrix tariff's versions can be downloaded as the template (a discount tariff has no file). */
  hasFile: boolean;
  /** A manager may activate and discard drafts. */
  canManage: boolean;
  /** Service level code → its label from the settings. */
  levelLabel: (code: string) => string;
  onActivate: (v: TariffVersionSummary) => void;
  onDiscard: (v: TariffVersionSummary) => void;
}

// The versions of a tariff, newest first: their files to download, and what a manager can do with a draft.
export const TariffVersionsTable = ({ tariffId, versions, hasFile, canManage, levelLabel, onActivate, onDiscard }: TariffVersionsTableProps) => {
  const columns: ColumnsType<TariffVersionSummary> = [
    {
      key: "version",
      title: "Version",
      render: (_, v) => (
        <Link href={versionHref(tariffId, v.id)} className="font-semibold text-indigo-600 hover:underline">
          {versionLabel(v)}
        </Link>
      ),
    },
    { key: "status", title: "Status", render: (_, v) => <TariffVersionStatusChip status={v.status} /> },
    { key: "validity", title: "Valid", render: (_, v) => <span className="whitespace-nowrap">{validityLabel(v.validFrom, v.validTo)}</span> },
    { key: "levels", title: "Service levels", render: (_, v) => v.serviceLevels.map(levelLabel).join(", ") || <span className="text-slate-400">—</span> },
    { key: "zones", title: "Zones", align: "right", render: (_, v) => <span className="tabular-nums">{v.zoneCount}</span> },
    {
      key: "errors",
      title: "Errors",
      align: "right",
      render: (_, v) => (v.errorCount ? <span className="tabular-nums font-semibold text-red-700">{v.errorCount}</span> : <span className="text-slate-400">0</span>),
    },
    {
      key: "warnings",
      title: "Warnings",
      align: "right",
      render: (_, v) => (v.warningCount ? <span className="tabular-nums text-amber-700">{v.warningCount}</span> : <span className="text-slate-400">0</span>),
    },
    {
      key: "created",
      title: "Created",
      render: (_, v) => (
        <span className="text-[12px] text-slate-600 whitespace-nowrap">
          {businessDateTime(v.createdAt)}
          {v.createdBy ? ` · ${v.createdBy}` : ""}
        </span>
      ),
    },
    {
      key: "activated",
      title: "Activated",
      render: (_, v) =>
        v.activatedAt ? (
          <span className="text-[12px] text-slate-600 whitespace-nowrap">
            {businessDateTime(v.activatedAt)}
            {v.activatedBy ? ` · ${v.activatedBy}` : ""}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: "files",
      title: "Files",
      render: (_, v) =>
        hasFile ? (
          <span className="flex flex-wrap gap-2">
            {v.sourceFileName && (
              <Tooltip title={`The uploaded file: ${v.sourceFileName}`}>
                <span>
                  <TariffDownloadButton size="small" load={() => fetchTariffVersionSource(v.id)} ariaLabel={`Download ${v.sourceFileName}`}>
                    Download file
                  </TariffDownloadButton>
                </span>
              </Tooltip>
            )}
            <TariffDownloadButton size="small" load={() => fetchTariffTemplate(tariffId, v.id)} ariaLabel={`Download ${versionLabel(v)} as template`}>
              Download as template
            </TariffDownloadButton>
          </span>
        ) : null,
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (_, v) =>
        canManage && v.status === "DRAFT" ? (
          <span className="flex justify-end gap-2">
            <Button size="small" type="primary" onClick={() => onActivate(v)}>
              Activate…
            </Button>
            <Tooltip title="Removes the draft; it was never used for pricing">
              <Button size="small" danger onClick={() => onDiscard(v)}>
                Discard draft
              </Button>
            </Tooltip>
          </span>
        ) : null,
    },
  ];

  return (
    <Table<TariffVersionSummary>
      size="small"
      rowKey="id"
      columns={columns}
      dataSource={versions}
      pagination={false}
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "No versions yet." }}
    />
  );
};
