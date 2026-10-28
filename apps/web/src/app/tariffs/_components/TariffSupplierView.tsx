"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Spin, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, UploadOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { BackLink } from "@/components/BackLink";
import { LINK_CLASS } from "@/components/linkClass";
import { SectionCard } from "@/components/SectionCard";
import { CUSTOMER_ROLE_LABELS } from "@/app/customers/_lib/constants";
import type { SupplierTariffVersion } from "@/hooks/useSupplierTariffs";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { businessToday, formatDate, formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { STATUS_CHIP, pricesOn, validityText, versionLabel } from "../_lib/railTariffs";
import { muted } from "./TariffText";

/** A tariff of a supplier, with its versions newest first. */
interface SupplierTariff {
  id: string;
  name: string;
  versions: SupplierTariffVersion[];
}

interface Supplier {
  companyName: string;
  ico: string;
  city: string;
  country: string;
}

function versionColumns(customerId: string, today: string, versionHref: (customerId: string, versionId: string) => string, rowsTitle: string): ColumnsType<SupplierTariffVersion> {
  return [
    {
      key: "version",
      title: "Version",
      render: (_, v) => (
        <Link href={versionHref(customerId, v.id)} onClick={(e) => e.stopPropagation()} className={`font-semibold ${LINK_CLASS}`}>
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
    { key: "rows", title: rowsTitle, align: "right", render: (_, v) => v.rowCount.toLocaleString("cs-CZ") },
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

/** How a supplier's page edits what a tariff is for, besides its name (`F`: ports, directions, freight). */
interface TariffEdit<T extends SupplierTariff, F extends object> {
  /** The button's tooltip: "Edit the tariff's name, ports and direction" */
  tooltip: string;
  fieldsOf: (tariff: T) => F;
  /** What keeps the fields from being saved, in words; null when they can be */
  problem: (fields: F) => string | null;
  renderFields: (fields: F, onChange: (fields: F) => void, disabled: boolean) => ReactNode;
  save: (tariff: { id: string; name: string } & F) => Promise<unknown>;
  isSaving: boolean;
  /** Under the fields: "The tariff's versions and prices stay as they are." */
  footnote: string;
}

/** What the upload dialog of a supplier's page is given; `onUploaded` opens the draft read from the file. */
export interface TariffUploadSlot {
  open: boolean;
  onClose: () => void;
  onUploaded: (versionId: string) => void;
}

interface Editing<F> {
  id: string;
  name: string;
  fields: F;
}

interface TariffSupplierViewProps<T extends SupplierTariff, F extends object> {
  customerId: string;
  /** The Tariffs section the supplier is listed in: the way back */
  section: { label: string; path: string };
  /** The Customer Database role that makes the company a supplier of the section */
  role: interfaces.CustomerRole;
  /** The supplier in words, in "Could not load the rail operator" */
  noun: string;
  supplier: Supplier | null;
  tariffs: T[];
  isLoading: boolean;
  error: unknown;
  versionHref: (customerId: string, versionId: string) => string;
  /** The title of the versions' row count: "Places", "Rates" */
  rowsTitle: string;
  /** What an empty page tells a manager to upload */
  uploadHint: string;
  /** What a tariff is for, above its versions */
  renderFor: (tariff: T) => ReactNode;
  edit: TariffEdit<T, F>;
  renderUpload: (slot: TariffUploadSlot) => ReactNode;
}

// One supplier of a Tariffs section: its tariffs, each with what it is for and its versions (newest
// first). A manager uploads a file here - as a new version of a tariff or as a new tariff - and
// edits a tariff's name and what it is for.
export function TariffSupplierView<T extends SupplierTariff, F extends object>({
  customerId,
  section,
  role,
  noun,
  supplier,
  tariffs,
  isLoading,
  error,
  versionHref,
  rowsTitle,
  uploadHint,
  renderFor,
  edit,
  renderUpload,
}: TariffSupplierViewProps<T, F>) {
  const router = useRouter();
  const toast = useToast();
  const canManage = useCanManageTariffs();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Editing<F> | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!supplier) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error)
          ? `This company is not a ${noun}. Give it the ${CUSTOMER_ROLE_LABELS[role]} role in its Customer Database page first.`
          : `Could not load the ${noun}: ${apiErrorMessage(error)}.`}{" "}
        <Link href={section.path} className={LINK_CLASS}>
          Back to {section.label}
        </Link>
      </div>
    );
  }

  const columns = versionColumns(customerId, businessToday(), versionHref, rowsTitle);
  const editProblem = editing && (!editing.name.trim() ? "Give the tariff a name" : edit.problem(editing.fields));

  const handleSave = async () => {
    if (!editing || editProblem) return;
    try {
      await edit.save({ id: editing.id, name: editing.name.trim(), ...editing.fields });
      setEditing(null);
      toast.success("Tariff saved");
    } catch (e) {
      toast.error(`Could not save the tariff: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <BackLink href={section.path}>{section.label}</BackLink>
        <div className="flex flex-wrap items-start gap-2 mt-1">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">{supplier.companyName}</h1>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-1">
              <span>{CUSTOMER_ROLE_LABELS[role]}</span>
              {supplier.ico && <span>· IČO {supplier.ico}</span>}
              {(supplier.city || supplier.country) && <span>· {[supplier.city, supplier.country].filter(Boolean).join(", ")}</span>}
              <span>·</span>
              <Link href={`/customers/${customerId}`} className={LINK_CLASS}>
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
            No tariffs yet. {canManage ? uploadHint : "A manager uploads them."}
          </div>
        )}
        {tariffs.map((tariff) => (
          <SectionCard
            key={tariff.id}
            title={tariff.name}
            extra={
              canManage && (
                <Tooltip title={edit.tooltip}>
                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`Edit ${tariff.name}`}
                    onClick={() => setEditing({ id: tariff.id, name: tariff.name, fields: edit.fieldsOf(tariff) })}
                  />
                </Tooltip>
              )
            }
            bodyClassName="p-0"
          >
            <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-1.5">{renderFor(tariff)}</div>
            <Table<SupplierTariffVersion>
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={tariff.versions}
              pagination={false}
              onRow={(v) => ({ onClick: () => router.push(versionHref(customerId, v.id)), className: "cursor-pointer" })}
              locale={{ emptyText: "No versions" }}
            />
          </SectionCard>
        ))}
      </div>

      {canManage && (
        // A new key per opening: the dialog starts with the first tariff chosen and no file.
        <Fragment key={uploadOpen ? "open" : "closed"}>
          {renderUpload({
            open: uploadOpen,
            onClose: () => setUploadOpen(false),
            onUploaded: (versionId) => {
              setUploadOpen(false);
              router.push(versionHref(customerId, versionId));
            },
          })}
        </Fragment>
      )}
      <AppModal
        open={editing !== null}
        onClose={() => !edit.isSaving && setEditing(null)}
        title="Edit tariff"
        subtitle={supplier.companyName}
        footer={
          <div className="flex items-center justify-end gap-2">
            {editProblem && <span className="mr-auto text-[12.5px] text-slate-500">{editProblem}</span>}
            <Button disabled={edit.isSaving} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="primary" loading={edit.isSaving} disabled={!!editProblem} onClick={handleSave}>
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600">
              Name
              <Input aria-label="Tariff name" value={editing.name} maxLength={200} disabled={edit.isSaving} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            {edit.renderFields(editing.fields, (fields) => setEditing({ ...editing, fields }), edit.isSaving)}
            <div className="text-[12px] text-slate-400">{edit.footnote}</div>
          </div>
        )}
      </AppModal>
    </div>
  );
}
