"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { AddCustomerModal } from "@/app/customers/_components/AddCustomerModal";
import { useCustomers } from "@/hooks/useCustomers";
import { collectionTariffKeys, useCollectionHauliers, type CollectionHaulierItem } from "@/hooks/useCollectionTariffs";
import type { interfaces } from "@/lib/api/client";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { collectionHaulierHref, freightModesText } from "../../_lib/collectionTariffs";
import { CollectionHubsCard } from "./CollectionHubsCard";

const HAULIER_ROLE: interfaces.CustomerRole[] = ["first_last_mile_haulier"];

const byText = (a: string, b: string) => a.localeCompare(b, "cs");
const muted = (text: string) => <span className="text-slate-400">{text}</span>;

const COLUMNS: AppGridColumn<CollectionHaulierItem>[] = [
  {
    key: "company",
    title: "Haulier",
    text: (h) => h.companyName,
    sorter: (a, b) => byText(a.companyName, b.companyName),
    render: (_, h) => (
      <Link href={collectionHaulierHref(h.customerId)} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-600 hover:underline">
        {h.companyName}
      </Link>
    ),
  },
  { key: "ico", title: "IČO", text: (h) => h.ico, sorter: (a, b) => byText(a.ico, b.ico) },
  { key: "city", title: "City", text: (h) => h.city, sorter: (a, b) => byText(a.city, b.city) },
  { key: "country", title: "Country", text: (h) => h.country, sorter: (a, b) => byText(a.country, b.country) },
  { key: "tariffs", title: "Tariffs", text: (h) => String(h.tariffCount), sorter: (a, b) => a.tariffCount - b.tariffCount },
  {
    key: "freight",
    title: "Freight",
    text: (h) => freightModesText(h.freightModes),
    sorter: (a, b) => byText(freightModesText(a.freightModes), freightModesText(b.freightModes)),
    render: (_, h) => freightModesText(h.freightModes) || muted("—"),
  },
  {
    key: "active",
    title: "Pricing today",
    text: (h) => String(h.activeCount),
    sorter: (a, b) => a.activeCount - b.activeCount,
    render: (_, h) => (h.activeCount ? h.activeCount : muted("none")),
  },
  {
    key: "until",
    title: "Valid until",
    text: (h) => formatDate(h.activeUntil),
    sorter: (a, b) => (a.activeUntil ?? "9999").localeCompare(b.activeUntil ?? "9999"),
    render: (_, h) => formatDate(h.activeUntil) || muted("—"),
  },
  {
    key: "drafts",
    title: "Drafts to check",
    text: (h) => String(h.draftCount),
    sorter: (a, b) => a.draftCount - b.draftCount,
    render: (_, h) => (h.draftCount ? <span className="font-semibold text-amber-600">{h.draftCount}</span> : muted("0")),
  },
];

// Tariffs → Last / First Mile Collections: our hubs, and every Customer Database company with the
// First / last mile haulier role with its tariffs at a glance. A row opens the haulier, where its
// tariffs are uploaded and checked.
export function CollectionHauliersView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useCanManageTariffs();
  const { hauliers, isLoading } = useCollectionHauliers();
  // Only the create calls: the dialog needs no customer list.
  const { createCustomer, createManualCustomer, isCreating } = useCustomers({}, { enabled: false });
  const [addOpen, setAddOpen] = useState(false);

  const handleCreated = (customerId: string) => {
    setAddOpen(false);
    void queryClient.invalidateQueries({ queryKey: collectionTariffKeys.all });
    router.push(collectionHaulierHref(customerId));
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Last / First Mile Collections</h1>
        <CollectionHubsCard />
        <AppGrid<CollectionHaulierItem>
          searchPlaceholder="Search haulier, IČO, city…"
          columns={COLUMNS}
          rows={hauliers}
          rowKey={(h) => h.customerId}
          loading={isLoading}
          onRowClick={(h) => router.push(collectionHaulierHref(h.customerId))}
          storageKey="tariffs:collection-hauliers:v1"
          exportFilePrefix="collection-hauliers"
          emptyText={
            canManage
              ? "No first / last mile hauliers yet. Add one, or give a company the First / last mile haulier role in its Customer Database page."
              : "No first / last mile hauliers yet. A manager adds them."
          }
          actions={
            canManage && (
              <Tooltip title="Adds a company to the Customer Database with the First / last mile haulier role. A company already there gets the role in the CRM card of its Customer Database page.">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  <PlusOutlined />
                  Add haulier
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
        defaultRoles={HAULIER_ROLE}
      />
    </div>
  );
}
