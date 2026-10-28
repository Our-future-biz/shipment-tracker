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
import { oceanTariffKeys, useShippingLines, type ShippingLineItem } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { shippingLineHref } from "../../_lib/oceanTariffs";
import { directionsText } from "../../_lib/railTariffs";

const SHIPPING_LINE_ROLE: interfaces.CustomerRole[] = ["shipping_line"];

const byText = (a: string, b: string) => a.localeCompare(b, "cs");
const muted = (text: string) => <span className="text-slate-400">{text}</span>;

const COLUMNS: AppGridColumn<ShippingLineItem>[] = [
  {
    key: "company",
    title: "Shipping line",
    text: (l) => l.companyName,
    sorter: (a, b) => byText(a.companyName, b.companyName),
    render: (_, l) => (
      <Link href={shippingLineHref(l.customerId)} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-600 hover:underline">
        {l.companyName}
      </Link>
    ),
  },
  { key: "ico", title: "IČO", text: (l) => l.ico, sorter: (a, b) => byText(a.ico, b.ico) },
  { key: "city", title: "City", text: (l) => l.city, sorter: (a, b) => byText(a.city, b.city) },
  { key: "country", title: "Country", text: (l) => l.country, sorter: (a, b) => byText(a.country, b.country) },
  { key: "tariffs", title: "Tariffs", text: (l) => String(l.tariffCount), sorter: (a, b) => a.tariffCount - b.tariffCount },
  {
    key: "directions",
    title: "Direction",
    text: (l) => directionsText(l.directions),
    sorter: (a, b) => byText(directionsText(a.directions), directionsText(b.directions)),
    render: (_, l) => directionsText(l.directions) || muted("—"),
  },
  {
    key: "active",
    title: "Pricing today",
    text: (l) => String(l.activeCount),
    sorter: (a, b) => a.activeCount - b.activeCount,
    render: (_, l) => (l.activeCount ? l.activeCount : muted("none")),
  },
  {
    key: "until",
    title: "Valid until",
    text: (l) => formatDate(l.activeUntil),
    sorter: (a, b) => (a.activeUntil ?? "9999").localeCompare(b.activeUntil ?? "9999"),
    render: (_, l) => formatDate(l.activeUntil) || muted("—"),
  },
  {
    key: "drafts",
    title: "Drafts to check",
    text: (l) => String(l.draftCount),
    sorter: (a, b) => a.draftCount - b.draftCount,
    render: (_, l) => (l.draftCount ? <span className="font-semibold text-amber-600">{l.draftCount}</span> : muted("0")),
  },
];

// Tariffs → Shipping Lines: every Customer Database company with the Shipping line role and its
// ocean tariffs at a glance. A row opens the line, where its rate documents are uploaded and checked.
export function ShippingLinesView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useCanManageTariffs();
  const { lines, isLoading } = useShippingLines();
  // Only the create calls: the dialog needs no customer list.
  const { createCustomer, createManualCustomer, isCreating } = useCustomers({}, { enabled: false });
  const [addOpen, setAddOpen] = useState(false);

  const handleCreated = (customerId: string) => {
    setAddOpen(false);
    void queryClient.invalidateQueries({ queryKey: oceanTariffKeys.all });
    router.push(shippingLineHref(customerId));
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Shipping Lines</h1>
        <AppGrid<ShippingLineItem>
          searchPlaceholder="Search shipping line, IČO, city…"
          columns={COLUMNS}
          rows={lines}
          rowKey={(l) => l.customerId}
          loading={isLoading}
          onRowClick={(l) => router.push(shippingLineHref(l.customerId))}
          storageKey="tariffs:shipping-lines:v1"
          exportFilePrefix="shipping-lines"
          emptyText={
            canManage
              ? "No shipping lines yet. Add one, or give a company the Shipping line role in its Customer Database page."
              : "No shipping lines yet. A manager adds them."
          }
          actions={
            canManage && (
              <Tooltip title="Adds a company to the Customer Database with the Shipping line role. A company already there gets the role in the CRM card of its Customer Database page.">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  <PlusOutlined />
                  Add shipping line
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
        defaultRoles={SHIPPING_LINE_ROLE}
      />
    </div>
  );
}
