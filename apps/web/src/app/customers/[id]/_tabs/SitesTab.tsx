"use client";

import { useMemo, useState } from "react";
import { Button, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, StarFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerSites } from "@/hooks/useCustomerSites";
import type { CustomerSiteItem } from "@/hooks/useCustomerSites";
import { ErrCode, isAPIError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { CUSTOMER_SITE_KIND_COLORS, CUSTOMER_SITE_KIND_LABELS } from "../../_lib/constants";
import { siteAddressLine } from "../../_lib/customerSites";
import { CustomerSiteDialog } from "../_components/CustomerSiteDialog";
import type { CustomerSiteFormValues } from "../_components/CustomerSiteDialog";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface SiteDialogState {
  // Counts the openings; used as the dialog's React key (see where the dialog is rendered).
  key: number;
  open: boolean;
  // The site being edited; null when a new one is added.
  site: CustomerSiteItem | null;
}

// The API says what is wrong with a postcode; anything else gets the fixed text.
const saveError = (err: unknown, fallback: string) =>
  isAPIError(err) && err.code === ErrCode.InvalidArgument && err.message ? err.message : fallback;

// The loading and delivery addresses of the customer, as trucking orders and zone pricing use them.
export function SitesTab({ customerId }: { customerId: string }) {
  const { sites, isLoading, createSite, updateSite, deleteSite } = useCustomerSites(customerId);
  const toast = useToast();
  const [dialog, setDialog] = useState<SiteDialogState>({ key: 0, open: false, site: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerSiteItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Default site first; the rest stay in the order they were added.
  const rows = useMemo(() => [...sites].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)), [sites]);

  const handleOpenDialog = (site: CustomerSiteItem | null) => setDialog((prev) => ({ key: prev.key + 1, open: true, site }));

  const handleCloseDialog = () => setDialog((prev) => ({ ...prev, open: false }));

  const handleSubmit = async (values: CustomerSiteFormValues) => {
    const { site } = dialog;
    setSaving(true);
    try {
      if (site) await updateSite({ id: site.id, params: values });
      else await createSite(values);
      toast.success(site ? "Site updated" : "Site added");
      handleCloseDialog();
    } catch (err) {
      toast.error(saveError(err, site ? "Failed to update site" : "Failed to add site"));
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDelete = () => setDeleteTarget(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSite(deleteTarget.id);
      toast.success("Site deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete site");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<CustomerSiteItem> = [
    {
      title: "Name",
      dataIndex: "label",
      render: (v: string, r) => (
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
          {v}
          {r.isDefault && (
            <span role="img" aria-label="Default site" title="Default site" className="text-xs text-amber-400">
              <StarFilled aria-hidden />
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Used for",
      dataIndex: "kind",
      width: 150,
      render: (v: CustomerSiteItem["kind"]) => (
        <Tag color={CUSTOMER_SITE_KIND_COLORS[v] ?? "default"} className="!m-0">
          {CUSTOMER_SITE_KIND_LABELS[v] ?? v}
        </Tag>
      ),
    },
    { title: "Address", key: "address", render: (_: unknown, r) => siteAddressLine(r) || EMPTY_CELL },
    { title: "Opening hours", dataIndex: "openingHours", render: (v: string) => v || EMPTY_CELL },
    {
      title: "Avizace",
      key: "avizace",
      render: (_: unknown, r) => {
        const parts = [r.avizaceName, r.avizacePhone].filter(Boolean);
        return parts.length ? parts.join(" · ") : EMPTY_CELL;
      },
    },
    {
      title: "Tail lift",
      dataIndex: "tailLiftNeeded",
      width: 90,
      render: (v: boolean) => (v ? "Needed" : EMPTY_CELL),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Edit ${r.label}`} onClick={() => handleOpenDialog(r)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${r.label}`} onClick={() => setDeleteTarget(r)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <SectionCard
        title="Sites"
        bodyClassName="p-2"
        extra={
          <>
            <CustomerCountChip count={sites.length} />
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleOpenDialog(null)}>
              Add Site
            </Button>
          </>
        }
      >
        <Table<CustomerSiteItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={TABLE_PAGINATION}
          locale={{ emptyText: "No sites yet" }}
        />
      </SectionCard>

      {/* A new key on every opening mounts the dialog with a fresh form (see ContactsTab). */}
      <CustomerSiteDialog
        key={dialog.key}
        open={dialog.open}
        site={dialog.site}
        saving={saving}
        onCancel={handleCloseDialog}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={handleCloseDelete}
        onConfirm={handleDelete}
        title="Delete site"
        description={`Delete ${deleteTarget?.label ?? "this site"}?`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}
