"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Spin, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { SectionCard } from "@/components/SectionCard";
import { useOceanTariffActions, useShippingLine, type OceanTariffItem } from "@/hooks/useOceanTariffs";
import type { RailTariffVersion } from "@/hooks/useRailTariffs";
import type { interfaces } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { businessToday, formatDate, formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { oceanVersionHref } from "../../_lib/oceanTariffs";
import { STATUS_CHIP, pricesOn, validityText, versionLabel } from "../../_lib/railTariffs";
import { DirectionChips, OceanDirectionFields } from "./OceanDirectionFields";
import { OceanUploadModal } from "./OceanUploadModal";

const muted = (text: string) => <span className="text-slate-400">{text}</span>;

// A tariff version as the line's page lists it; the summary is the same for every kind of tariff.
type TariffVersion = RailTariffVersion;

function versionColumns(customerId: string, today: string): ColumnsType<TariffVersion> {
  return [
    {
      key: "version",
      title: "Version",
      render: (_, v) => (
        <Link href={oceanVersionHref(customerId, v.id)} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-600 hover:underline">
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
    { key: "rows", title: "Rates", align: "right", render: (_, v) => v.rowCount.toLocaleString("cs-CZ") },
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

interface TariffEdit {
  id: string;
  name: string;
  directions: interfaces.RailDirection[];
}

// One shipping line: its tariffs, each with whether it is for import, export or both and its
// versions (newest first). A manager uploads a rate document here - as a new version of a tariff
// or as a new tariff - and edits a tariff's name and directions.
export function ShippingLineView({ customerId }: { customerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const canManage = useCanManageTariffs();
  const { detail, isLoading, error } = useShippingLine(customerId);
  const { update, isUpdating } = useOceanTariffActions();
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
        Could not load the shipping line: {apiErrorMessage(error)}.{" "}
        <Link href="/tariffs/shipping-lines" className="text-indigo-500">
          Back to Shipping Lines
        </Link>
      </div>
    );
  }

  const { line, tariffs } = detail;
  const columns = versionColumns(customerId, today);
  const editProblem = editing && (!editing.name.trim() ? "Give the tariff a name" : !editing.directions.length ? "Tick import, export or both" : null);

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
          <Link href="/tariffs/shipping-lines" aria-label="Back to Shipping Lines" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">{line.companyName}</h1>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-1">
              <span>Shipping line</span>
              {line.ico && <span>· IČO {line.ico}</span>}
              {(line.city || line.country) && <span>· {[line.city, line.country].filter(Boolean).join(", ")}</span>}
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
            {canManage
              ? "Upload the shipping line's rate document (Excel) as they sent it; the AI reads where its rate tables and surcharges are, the ports are matched to the UN/LOCODE list, and you check the result before it is used."
              : "A manager uploads them."}
          </div>
        )}
        {tariffs.map((tariff: OceanTariffItem) => (
          <SectionCard
            key={tariff.id}
            title={tariff.name}
            extra={
              canManage && (
                <Tooltip title="Edit the tariff's name and whether it is for import or export">
                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`Edit ${tariff.name}`}
                    onClick={() => setEditing({ id: tariff.id, name: tariff.name, directions: tariff.directions })}
                  />
                </Tooltip>
              )
            }
            bodyClassName="p-0"
          >
            <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-slate-500 mr-1">For</span>
              <DirectionChips directions={tariff.directions} />
            </div>
            <Table<TariffVersion>
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={tariff.versions}
              pagination={false}
              onRow={(v) => ({ onClick: () => router.push(oceanVersionHref(customerId, v.id)), className: "cursor-pointer" })}
              locale={{ emptyText: "No versions" }}
            />
          </SectionCard>
        ))}
      </div>

      {canManage && (
        <OceanUploadModal
          // A new key per opening: the dialog starts with the first tariff chosen and no file.
          key={uploadOpen ? "open" : "closed"}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          supplierCustomerId={customerId}
          supplierName={line.companyName}
          tariffs={tariffs}
          onUploaded={(version) => {
            setUploadOpen(false);
            router.push(oceanVersionHref(customerId, version.id));
          }}
        />
      )}
      <AppModal
        open={editing !== null}
        onClose={() => !isUpdating && setEditing(null)}
        title="Edit tariff"
        subtitle={line.companyName}
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
            <OceanDirectionFields value={editing.directions} onChange={(directions) => setEditing({ ...editing, directions })} disabled={isUpdating} />
            <div className="text-[12px] text-slate-400">The tariff&apos;s versions and rates stay as they are.</div>
          </div>
        )}
      </AppModal>
    </div>
  );
}
