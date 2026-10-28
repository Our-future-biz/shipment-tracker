"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Spin, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { SectionCard } from "@/components/SectionCard";
import { useRailOperator, useRailTariffActions, type RailTariffItem, type RailTariffVersion } from "@/hooks/useRailTariffs";
import { apiErrorMessage } from "@/lib/api";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { businessToday, formatDate, formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { DIRECTIONS, STATUS_CHIP, TARIFF_PORTS, portsAndDirectionsProblem, pricesOn, railVersionHref, validityText, versionLabel } from "../../_lib/railTariffs";
import { RailTariffPortsFields, type PortsAndDirections } from "./RailTariffPortsFields";
import { RailUploadModal } from "./RailUploadModal";

const muted = (text: string) => <span className="text-slate-400">{text}</span>;

const CHIP = "inline-block rounded-full border px-2 py-0.5 text-[11.5px] font-medium";

// What a tariff is for, above its versions: its ports, then import / export.
const TariffFor = ({ tariff }: { tariff: RailTariffItem }) => (
  <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
    {TARIFF_PORTS.filter((p) => tariff.ports.includes(p.code)).map((p) => (
      <span key={p.code} className={`${CHIP} bg-indigo-50 text-indigo-700 border-indigo-200`}>
        {p.name}
      </span>
    ))}
    <span aria-hidden className="mx-1 h-4 w-px bg-slate-200" />
    {DIRECTIONS.filter((d) => tariff.directions.includes(d.value)).map((d) => (
      <span key={d.value} className={`${CHIP} bg-slate-100 text-slate-600 border-slate-200`}>
        {d.label}
      </span>
    ))}
  </div>
);

interface TariffEdit extends PortsAndDirections {
  id: string;
  name: string;
}

function versionColumns(customerId: string, today: string): ColumnsType<RailTariffVersion> {
  return [
    {
      key: "version",
      title: "Version",
      render: (_, v) => (
        <Link href={railVersionHref(customerId, v.id)} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-600 hover:underline">
          {versionLabel(v)}
        </Link>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (_, v) => (
        <span className="inline-flex items-center gap-1.5">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${STATUS_CHIP[v.status].className}`}>{STATUS_CHIP[v.status].label}</span>
          {v.status === "active" && !pricesOn(v, today) && muted((v.validFrom ?? "") > today ? "starts later" : "ended")}
        </span>
      ),
    },
    { key: "validity", title: "Valid", render: (_, v) => validityText(v) },
    { key: "rows", title: "Places", align: "right", render: (_, v) => v.rowCount.toLocaleString("cs-CZ") },
    {
      key: "problems",
      title: "Problems",
      render: (_, v) =>
        v.errorCount || v.warningCount ? (
          <span className="flex gap-2 text-[12.5px]">
            {v.errorCount > 0 && <span className="font-semibold text-red-600">{v.errorCount} errors</span>}
            {v.warningCount > 0 && <span className="text-amber-600">{v.warningCount} warnings</span>}
          </span>
        ) : (
          muted("none")
        ),
    },
    { key: "file", title: "File", render: (_, v) => v.sourceFileName ?? muted("—") },
    { key: "uploaded", title: "Uploaded", render: (_, v) => `${formatDateTime(v.createdAt)}${v.createdBy ? ` · ${v.createdBy}` : ""}` },
    {
      key: "approved",
      title: "Approved",
      render: (_, v) => (v.activatedAt ? `${formatDate(v.activatedAt)}${v.activatedBy ? ` · ${v.activatedBy}` : ""}` : muted("—")),
    },
  ];
}

// One rail operator: its tariffs, each with the ports it is for, import / export and its versions
// (newest first). A manager uploads a file here - as a new version of a tariff or as a new tariff -
// and edits a tariff's name, ports and directions.
export function RailOperatorView({ customerId }: { customerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const canManage = useCanManageTariffs();
  const { detail, isLoading, error } = useRailOperator(customerId);
  const { update, isUpdating } = useRailTariffActions();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<TariffEdit | null>(null);
  const today = businessToday();

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="p-10 text-center text-slate-500">
        Could not load the rail operator: {apiErrorMessage(error)}.{" "}
        <Link href="/tariffs/rail-operators" className="text-indigo-500">
          Back to Rail Operators
        </Link>
      </div>
    );
  }

  const { operator, tariffs } = detail;
  const columns = versionColumns(customerId, today);

  const editProblem = editing && (!editing.name.trim() ? "Give the tariff a name" : portsAndDirectionsProblem(editing));

  const handleSave = async () => {
    if (!editing || editProblem) return;
    try {
      await update({ ...editing, name: editing.name.trim() });
      setEditing(null);
      toast.success("Tariff saved");
    } catch (e) {
      toast.error(`Could not save the tariff: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href="/tariffs/rail-operators" aria-label="Back to Rail Operators" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">{operator.companyName}</h1>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-1">
              <span>Rail operator</span>
              {operator.ico && <span>· IČO {operator.ico}</span>}
              {(operator.city || operator.country) && <span>· {[operator.city, operator.country].filter(Boolean).join(", ")}</span>}
              <span>·</span>
              <Link href={`/customers/${customerId}`} className="text-indigo-500 hover:underline">
                Open in Customer Database
              </Link>
            </div>
          </div>
          {canManage && (
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
              Upload tariff
            </Button>
          )}
        </div>
      </div>

      <div className="px-6 py-5 max-w-[1400px] mx-auto flex flex-col gap-5">
        {tariffs.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-14 text-center text-slate-500 text-sm">
            No tariffs yet.{" "}
            {canManage ? "Upload the operator's tariff file (Excel) as they sent it; the AI reads its layout and you check the result before it is used." : "A manager uploads them."}
          </div>
        )}
        {tariffs.map((tariff) => (
          <SectionCard
            key={tariff.id}
            title={tariff.name}
            extra={
              canManage && (
                <Tooltip title="Edit the tariff's name, ports and direction">
                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`Edit ${tariff.name}`}
                    onClick={() => setEditing({ id: tariff.id, name: tariff.name, ports: tariff.ports, directions: tariff.directions })}
                  />
                </Tooltip>
              )
            }
            bodyClassName="p-0"
          >
            <TariffFor tariff={tariff} />
            <Table<RailTariffVersion>
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={tariff.versions}
              pagination={false}
              onRow={(v) => ({ onClick: () => router.push(railVersionHref(customerId, v.id)), className: "cursor-pointer" })}
              locale={{ emptyText: "No versions" }}
            />
          </SectionCard>
        ))}
      </div>

      {canManage && (
        <RailUploadModal
          // A new key per opening: the dialog starts with the first tariff chosen and no file.
          key={uploadOpen ? "open" : "closed"}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          supplierCustomerId={customerId}
          supplierName={operator.companyName}
          tariffs={tariffs}
          onUploaded={(version) => {
            setUploadOpen(false);
            router.push(railVersionHref(customerId, version.id));
          }}
        />
      )}
      <AppModal
        open={editing !== null}
        onClose={() => !isUpdating && setEditing(null)}
        title="Edit tariff"
        subtitle={operator.companyName}
        footer={
          <div className="flex items-center justify-end gap-2">
            {editProblem && <span className="mr-auto text-[12.5px] text-slate-500">{editProblem}</span>}
            <Button disabled={isUpdating} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="primary" loading={isUpdating} disabled={!!editProblem} onClick={handleSave}>
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600">
              Name
              <Input aria-label="Tariff name" value={editing.name} maxLength={200} disabled={isUpdating} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <RailTariffPortsFields value={editing} onChange={(chosen) => setEditing({ ...editing, ...chosen })} disabled={isUpdating} />
            <div className="text-[12px] text-slate-400">The tariff&apos;s versions and prices stay as they are.</div>
          </div>
        )}
      </AppModal>
    </div>
  );
}
