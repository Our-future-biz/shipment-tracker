"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { btnPrimary } from "@/components/buttons";
import { LINK_CLASS } from "@/components/linkClass";
import { AddCustomerModal } from "@/app/customers/_components/AddCustomerModal";
import { CUSTOMER_ROLE_LABELS } from "@/app/customers/_lib/constants";
import { useCustomers } from "@/hooks/useCustomers";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { muted } from "./TariffText";

/** A supplier as a Tariffs section lists it: the Customer Database company and its tariffs at a glance. */
interface TariffSupplierRow {
  customerId: string;
  companyName: string;
  ico: string;
  city: string;
  country: string;
  tariffCount: number;
  activeCount: number;
  draftCount: number;
  activeUntil: string | null;
}

const byText = (a: string, b: string) => a.localeCompare(b, "cs");

function supplierColumns<T extends TariffSupplierRow>(nameTitle: string, href: (customerId: string) => string, forColumns: AppGridColumn<T>[]): AppGridColumn<T>[] {
  return [
    {
      key: "company",
      title: nameTitle,
      text: (s) => s.companyName,
      sorter: (a, b) => byText(a.companyName, b.companyName),
      render: (_, s) => (
        <Link href={href(s.customerId)} onClick={(e) => e.stopPropagation()} className={`font-semibold ${LINK_CLASS}`}>
          {s.companyName}
        </Link>
      ),
    },
    { key: "ico", title: "IČO", text: (s) => s.ico, sorter: (a, b) => byText(a.ico, b.ico) },
    { key: "city", title: "City", text: (s) => s.city, sorter: (a, b) => byText(a.city, b.city) },
    { key: "country", title: "Country", text: (s) => s.country, sorter: (a, b) => byText(a.country, b.country) },
    { key: "tariffs", title: "Tariffs", text: (s) => String(s.tariffCount), sorter: (a, b) => a.tariffCount - b.tariffCount },
    ...forColumns,
    {
      key: "active",
      title: "Pricing today",
      text: (s) => String(s.activeCount),
      sorter: (a, b) => a.activeCount - b.activeCount,
      render: (_, s) => (s.activeCount ? s.activeCount : muted("none")),
    },
    {
      key: "until",
      title: "Valid until",
      text: (s) => formatDate(s.activeUntil),
      sorter: (a, b) => (a.activeUntil ?? "9999").localeCompare(b.activeUntil ?? "9999"),
      render: (_, s) => formatDate(s.activeUntil) || muted("—"),
    },
    {
      key: "drafts",
      title: "Drafts to check",
      text: (s) => String(s.draftCount),
      sorter: (a, b) => a.draftCount - b.draftCount,
      render: (_, s) => (s.draftCount ? <span className="font-semibold text-amber-600">{s.draftCount}</span> : muted("0")),
    },
  ];
}

/** A text column of what a section's suppliers' tariffs are for (ports, directions, freight). */
export function forColumn<T extends TariffSupplierRow>(key: string, title: string, text: (row: T) => string): AppGridColumn<T> {
  return { key, title, text, sorter: (a, b) => byText(text(a), text(b)), render: (_, row) => text(row) || muted("—") };
}

interface TariffSuppliersViewProps<T extends TariffSupplierRow> {
  title: string;
  /** The Customer Database role that makes a company a supplier of this section */
  role: interfaces.CustomerRole;
  /** The first column's title: "Rail operator" */
  nameTitle: string;
  /** The suppliers in the plural, as the empty list says it: "rail operators" */
  plural: string;
  /** The add button's label: "Add rail operator" */
  addLabel: string;
  searchPlaceholder: string;
  suppliers: T[];
  isLoading: boolean;
  error: unknown;
  href: (customerId: string) => string;
  /** The section's own columns, between the number of tariffs and what prices today */
  forColumns: AppGridColumn<T>[];
  /** Read again once a supplier was added here */
  queryKey: QueryKey;
  storageKey: string;
  exportFilePrefix: string;
  /** Shown between the title and the list */
  above?: ReactNode;
}

// A Tariffs section's suppliers: every Customer Database company with the section's role and its
// tariffs at a glance. A row opens the supplier, where its tariffs are uploaded and checked; a
// manager adds a supplier here.
export function TariffSuppliersView<T extends TariffSupplierRow>({
  title,
  role,
  nameTitle,
  plural,
  addLabel,
  searchPlaceholder,
  suppliers,
  isLoading,
  error,
  href,
  forColumns,
  queryKey,
  storageKey,
  exportFilePrefix,
  above,
}: TariffSuppliersViewProps<T>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useCanManageTariffs();
  // Only the create calls: the dialog needs no customer list.
  const { createCustomer, createManualCustomer, isCreating } = useCustomers({}, { enabled: false });
  const [addOpen, setAddOpen] = useState(false);
  const roleLabel = CUSTOMER_ROLE_LABELS[role];

  const handleCreated = (customerId: string) => {
    setAddOpen(false);
    void queryClient.invalidateQueries({ queryKey });
    router.push(href(customerId));
  };

  const emptyText = error
    ? `Could not load the ${plural}: ${apiErrorMessage(error)}.`
    : canManage
      ? `No ${plural} yet. Add one, or give a company the ${roleLabel} role in its Customer Database page.`
      : `No ${plural} yet. A manager adds them.`;

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {above}
        <AppGrid<T>
          searchPlaceholder={searchPlaceholder}
          columns={supplierColumns(nameTitle, href, forColumns)}
          rows={suppliers}
          rowKey={(s) => s.customerId}
          loading={isLoading}
          onRowClick={(s) => router.push(href(s.customerId))}
          storageKey={storageKey}
          exportFilePrefix={exportFilePrefix}
          emptyText={emptyText}
          actions={
            canManage && (
              <Tooltip title={`Adds a company to the Customer Database with the ${roleLabel} role. A company already there gets the role in the CRM card of its Customer Database page.`}>
                <button type="button" onClick={() => setAddOpen(true)} className={btnPrimary}>
                  <PlusOutlined />
                  {addLabel}
                </button>
              </Tooltip>
            )
          }
        />
      </div>
      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
        createCustomer={createCustomer}
        createManualCustomer={createManualCustomer}
        isCreating={isCreating}
        defaultRoles={[role]}
      />
    </div>
  );
}
