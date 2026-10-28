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
import { railTariffKeys, useRailOperators, type RailOperatorItem } from "@/hooks/useRailTariffs";
import type { interfaces } from "@/lib/api/client";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { directionsText, portsText, railOperatorHref } from "../../_lib/railTariffs";

const RAIL_OPERATOR_ROLE: interfaces.CustomerRole[] = ["rail_operator"];

const byText = (a: string, b: string) => a.localeCompare(b, "cs");
const muted = (text: string) => <span className="text-slate-400">{text}</span>;

const COLUMNS: AppGridColumn<RailOperatorItem>[] = [
  {
    key: "company",
    title: "Rail operator",
    text: (o) => o.companyName,
    sorter: (a, b) => byText(a.companyName, b.companyName),
    render: (_, o) => (
      <Link href={railOperatorHref(o.customerId)} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-600 hover:underline">
        {o.companyName}
      </Link>
    ),
  },
  { key: "ico", title: "IČO", text: (o) => o.ico, sorter: (a, b) => byText(a.ico, b.ico) },
  { key: "city", title: "City", text: (o) => o.city, sorter: (a, b) => byText(a.city, b.city) },
  { key: "country", title: "Country", text: (o) => o.country, sorter: (a, b) => byText(a.country, b.country) },
  { key: "tariffs", title: "Tariffs", text: (o) => String(o.tariffCount), sorter: (a, b) => a.tariffCount - b.tariffCount },
  {
    key: "ports",
    title: "Ports",
    text: (o) => portsText(o.ports),
    sorter: (a, b) => byText(portsText(a.ports), portsText(b.ports)),
    render: (_, o) => portsText(o.ports) || muted("—"),
  },
  {
    key: "directions",
    title: "Direction",
    text: (o) => directionsText(o.directions),
    sorter: (a, b) => byText(directionsText(a.directions), directionsText(b.directions)),
    render: (_, o) => directionsText(o.directions) || muted("—"),
  },
  {
    key: "active",
    title: "Pricing today",
    text: (o) => String(o.activeCount),
    sorter: (a, b) => a.activeCount - b.activeCount,
    render: (_, o) => (o.activeCount ? o.activeCount : muted("none")),
  },
  {
    key: "until",
    title: "Valid until",
    text: (o) => formatDate(o.activeUntil),
    sorter: (a, b) => (a.activeUntil ?? "9999").localeCompare(b.activeUntil ?? "9999"),
    render: (_, o) => formatDate(o.activeUntil) || muted("—"),
  },
  {
    key: "drafts",
    title: "Drafts to check",
    text: (o) => String(o.draftCount),
    sorter: (a, b) => a.draftCount - b.draftCount,
    render: (_, o) => (o.draftCount ? <span className="font-semibold text-amber-600">{o.draftCount}</span> : muted("0")),
  },
];

// Tariffs → Rail Operators: every Customer Database company with the Rail operator role and its
// tariffs at a glance. A row opens the operator, where its tariffs are uploaded and checked.
export function RailOperatorsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useCanManageTariffs();
  const { operators, isLoading } = useRailOperators();
  // Only the create calls: the dialog needs no customer list.
  const { createCustomer, createManualCustomer, isCreating } = useCustomers({}, { enabled: false });
  const [addOpen, setAddOpen] = useState(false);

  const handleCreated = (customerId: string) => {
    setAddOpen(false);
    void queryClient.invalidateQueries({ queryKey: railTariffKeys.all });
    router.push(railOperatorHref(customerId));
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Rail Operators</h1>
        <AppGrid<RailOperatorItem>
          searchPlaceholder="Search operator, IČO, city…"
          columns={COLUMNS}
          rows={operators}
          rowKey={(o) => o.customerId}
          loading={isLoading}
          onRowClick={(o) => router.push(railOperatorHref(o.customerId))}
          storageKey="tariffs:rail-operators:v1"
          exportFilePrefix="rail-operators"
          emptyText={
            canManage
              ? "No rail operators yet. Add one, or give a company the Rail operator role in its Customer Database page."
              : "No rail operators yet. A manager adds them."
          }
          actions={
            canManage && (
              <Tooltip title="Adds a company to the Customer Database with the Rail operator role. A company already there gets the role in the CRM card of its Customer Database page.">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  <PlusOutlined />
                  Add rail operator
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
        defaultRoles={RAIL_OPERATOR_ROLE}
      />
    </div>
  );
}
