"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, Input } from "antd";
import { RollbackOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DataTable } from "@/components/DataTable";
import { useDeletedCustomers, type DeletedCustomerItem } from "@/hooks/useCustomers";
import { apiErrorMessage } from "@/lib/api";
import { flagOf } from "@/lib/countries";
import { formatDateTime } from "@/lib/date";
import { foldIncludes } from "@/lib/fold";
import { useToast } from "@/lib/toast";
import { CustomerAccountTypeBadge } from "./CustomerAccountTypeBadge";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// What a restore brings back besides the customer itself.
const restoredWith = (c: DeletedCustomerItem) =>
  `${plural(c.contactCount, "contact", "contacts")} · ${plural(c.addressCount, "address", "addresses")}`;

// The Deleted view of the Customer Database (superadmins only): customers hidden from everyone,
// kept in the database, and brought back here with what was deleted together with them.
export function DeletedCustomersPanel() {
  const toast = useToast();
  const { deletedCustomers, isLoading, isError, restoreCustomer } = useDeletedCustomers(true);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<DeletedCustomerItem | null>(null);
  const [restoring, setRestoring] = useState(false);

  const rows = useMemo(
    () =>
      search.trim()
        ? deletedCustomers.filter((c) => [c.companyName, c.ico, c.city].some((text) => foldIncludes(text, search)))
        : deletedCustomers,
    [deletedCustomers, search],
  );

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value);

  const handleRestore = async () => {
    if (!target) return;
    setRestoring(true);
    try {
      await restoreCustomer(target.id);
      toast.success(`${target.companyName} restored`);
      setTarget(null);
    } catch (err) {
      toast.error(`Failed to restore the customer: ${apiErrorMessage(err)}`);
    } finally {
      setRestoring(false);
    }
  };

  const columns: ColumnsType<DeletedCustomerItem> = [
    {
      title: "Customer",
      key: "companyName",
      render: (_: unknown, c) => <span className="font-medium text-slate-800">{c.companyName || c.ico}</span>,
    },
    {
      title: "IČO / Reg. no.",
      key: "ico",
      width: 130,
      render: (_: unknown, c) => <span className="font-mono text-xs">{c.ico || "—"}</span>,
    },
    {
      title: "Location",
      key: "location",
      render: (_: unknown, c) => (
        <span className="whitespace-nowrap">
          {flagOf(c.country)} {[c.city, c.country].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      title: "Account type",
      key: "label",
      render: (_: unknown, c) => <CustomerAccountTypeBadge label={c.label} />,
    },
    {
      title: "Deleted",
      key: "deletedAt",
      render: (_: unknown, c) => <span className="whitespace-nowrap">{formatDateTime(c.deletedAt)}</span>,
    },
    {
      title: "Comes back with",
      key: "restoredWith",
      render: (_: unknown, c) => <span className="whitespace-nowrap text-slate-600">{restoredWith(c)}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 120,
      render: (_: unknown, c) => (
        <div className="flex justify-end">
          <Button size="small" icon={<RollbackOutlined />} onClick={() => setTarget(c)}>
            Restore
          </Button>
        </div>
      ),
    },
  ];

  let emptyText = "No deleted customers.";
  if (search.trim()) emptyText = "No deleted customers match this search.";
  if (isLoading) emptyText = "Loading deleted customers…";
  if (isError) emptyText = "The deleted customers could not be loaded.";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <p className="m-0 text-[13px] text-slate-500 min-w-0">
          Deleted customers are hidden from everyone. Restore brings a customer back with the contacts,
          addresses, notes, documents, invoices and sites deleted together with it.
        </p>
        <Input
          placeholder="Search deleted customers..."
          aria-label="Search deleted customers"
          prefix={<SearchOutlined className="text-slate-400" />}
          value={search}
          onChange={handleSearchChange}
          allowClear
          className="!w-60 shrink-0 ml-auto"
        />
      </div>

      <DataTable<DeletedCustomerItem>
        dataSource={rows}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: "max-content" }}
        resetKey={search}
        locale={{ emptyText }}
      />

      <ConfirmModal
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={handleRestore}
        title="Restore customer"
        description={
          target
            ? `Restore ${target.companyName}? It comes back for everyone with ${restoredWith(target).replace(" · ", " and ")}, and the notes, documents, invoices and sites deleted together with it.`
            : ""
        }
        confirmLabel="Restore"
        loading={restoring}
      />
    </>
  );
}
