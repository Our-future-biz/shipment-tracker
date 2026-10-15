"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { AddCustomerModal } from "@/app/customers/_components/AddCustomerModal";
import { useCustomers } from "@/hooks/useCustomers";
import { truckingKeys } from "@/hooks/truckingKeys";
import { useHauliers, useTruckingSettings, type HaulierListItem } from "@/hooks/useTrucking";
import type { interfaces } from "@/lib/api/client";
import { businessToday, formatDate } from "@/lib/date";
import { HAULIER_CHIPS, HAULIER_STATUS_CHIP, issueSummary, type HaulierChipId, type HaulierStatus } from "../_lib/hauliers";
import { HaulierFilterBubbles } from "./HaulierFilterBubbles";
import { HaulierQuickChips } from "./HaulierQuickChips";
import { HaulierStatusChip } from "./HaulierStatusChip";

const HAULIER_ROLE: interfaces.CustomerRole[] = ["haulier"];
const STATUSES: HaulierStatus[] = ["blocked", "warning", "ok"];
const STATUS_RANK: Record<HaulierStatus, number> = { blocked: 0, warning: 1, ok: 2 };

export const haulierHref = (customerId: string) => `/trucking/hauliers/${customerId}`;

const byText = (a: string, b: string) => a.localeCompare(b, "cs");
const byDate = (a: string | null, b: string | null) => (a ?? "9999").localeCompare(b ?? "9999");

const buildColumns = (vehicleLabel: (code: string) => string): AppGridColumn<HaulierListItem>[] => [
  {
    key: "company",
    title: "Haulier",
    text: (h) => h.companyName,
    sorter: (a, b) => byText(a.companyName, b.companyName),
    render: (_, h) => (
      <Link href={haulierHref(h.customerId)} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-600 hover:underline">
        {h.companyName}
      </Link>
    ),
  },
  { key: "ico", title: "IČO", text: (h) => h.ico, sorter: (a, b) => byText(a.ico, b.ico) },
  { key: "city", title: "City", text: (h) => h.city, sorter: (a, b) => byText(a.city, b.city) },
  {
    key: "status",
    title: "Status",
    text: (h) => HAULIER_STATUS_CHIP[h.status].label,
    filterOptions: STATUSES.map((s) => HAULIER_STATUS_CHIP[s].label),
    sorter: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
    render: (_, h) => <HaulierStatusChip status={h.status} />,
  },
  {
    key: "issues",
    title: "Issues",
    text: (h) => h.issues.map((i) => i.message).join("; "),
    render: (_, h) => {
      const summary = issueSummary(h.issues);
      if (!summary) return <span className="text-slate-400">—</span>;
      return (
        <Tooltip title={summary.more ? h.issues.map((i) => i.message).join(" · ") : undefined}>
          <span className="text-[12.5px] text-slate-700">
            {summary.first}
            {summary.more > 0 && <span className="ml-1 font-semibold text-slate-500">+{summary.more}</span>}
          </span>
        </Tooltip>
      );
    },
  },
  {
    key: "insurance",
    title: "Insurance valid to",
    text: (h) => formatDate(h.insuranceValidTo),
    sorter: (a, b) => byDate(a.insuranceValidTo, b.insuranceValidTo),
    render: (_, h) => formatDate(h.insuranceValidTo) || <span className="text-slate-400">—</span>,
  },
  {
    key: "licence",
    title: "Licence valid to",
    text: (h) => formatDate(h.licenceValidTo),
    sorter: (a, b) => byDate(a.licenceValidTo, b.licenceValidTo),
    render: (_, h) => formatDate(h.licenceValidTo) || <span className="text-slate-400">{h.hasProfile ? "No end date" : "—"}</span>,
  },
  { key: "adr", title: "ADR", text: (h) => (h.adrCapable ? "Yes" : "No"), filterOptions: ["Yes", "No"], render: (_, h) => (h.adrCapable ? "Yes" : <span className="text-slate-400">No</span>) },
  { key: "vehicles", title: "Vehicle types", text: (h) => h.vehicleTypes.map(vehicleLabel).join(", ") },
  { key: "lanes", title: "Preferred lanes", text: (h) => String(h.preferredLaneCount), sorter: (a, b) => a.preferredLaneCount - b.preferredLaneCount },
];

// The hauliers we hire: every Customer Database company with the Haulier role, with its Trucking
// status. Tiles filter by status, chips by what needs doing; a row opens the haulier page.
export const TruckingHauliersTab = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { hauliers, isLoading } = useHauliers();
  const { settings } = useTruckingSettings();
  // Only the create call: the dialog needs no customer list.
  const { createCustomer, isCreating } = useCustomers({}, { enabled: false });
  const [addOpen, setAddOpen] = useState(false);
  const today = businessToday();

  const statusParam = searchParams.get("status");
  const activeStatus = STATUSES.find((s) => s === statusParam) ?? null;
  const viewParam = searchParams.get("view");
  const activeChip = HAULIER_CHIPS.find((c) => c.id === viewParam) ?? null;
  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const columns = useMemo(() => {
    const labels = new Map(settings?.vehicleTypes.map((v) => [v.code, v.label]) ?? []);
    return buildColumns((code) => labels.get(code) ?? code);
  }, [settings]);

  const statusCounts = useMemo(() => {
    const counts: Record<HaulierStatus, number> = { blocked: 0, warning: 0, ok: 0 };
    for (const h of hauliers) counts[h.status] += 1;
    return counts;
  }, [hauliers]);
  // Chip counts follow the tile chosen, so a chip says how many rows clicking it leaves.
  const inStatus = useMemo(() => (activeStatus ? hauliers.filter((h) => h.status === activeStatus) : hauliers), [hauliers, activeStatus]);
  const chipCounts = useMemo(
    () => Object.fromEntries(HAULIER_CHIPS.map((c) => [c.id, inStatus.filter((h) => c.match(h, today)).length])) as Record<HaulierChipId, number>,
    [inStatus, today],
  );
  const rows = useMemo(() => (activeChip ? inStatus.filter((h) => activeChip.match(h, today)) : inStatus), [inStatus, activeChip, today]);

  const handleCreated = (customerId: string) => {
    setAddOpen(false);
    void queryClient.invalidateQueries({ queryKey: truckingKeys.hauliers() });
    router.push(haulierHref(customerId));
  };

  return (
    <>
      <AppGrid<HaulierListItem>
        subHeader={
          <>
            <HaulierFilterBubbles active={activeStatus} counts={statusCounts} onSelect={(s) => setParam("status", s)} />
            <HaulierQuickChips active={activeChip?.id ?? null} counts={chipCounts} onSelect={(id) => setParam("view", id)} />
          </>
        }
        searchPlaceholder="Search haulier, IČO, city…"
        columns={columns}
        rows={rows}
        rowKey={(h) => h.customerId}
        loading={isLoading}
        onRowClick={(h) => router.push(haulierHref(h.customerId))}
        storageKey="trucking:hauliers:v1"
        exportFilePrefix="hauliers"
        emptyText={hauliers.length ? "No hauliers match this filter." : "No hauliers yet. Add one, or give a company the Haulier role in the Customer Database."}
        resetKey={`${activeStatus ?? ""}|${activeChip?.id ?? ""}`}
        actions={
          <Tooltip title="Adds a company to the Customer Database with the Haulier role. A company already there gets the Haulier role in the CRM card of its Customer Database page.">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <PlusOutlined />
              Add haulier
            </button>
          </Tooltip>
        }
      />
      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
        createCustomer={createCustomer}
        isCreating={isCreating}
        defaultRoles={HAULIER_ROLE}
      />
    </>
  );
};
