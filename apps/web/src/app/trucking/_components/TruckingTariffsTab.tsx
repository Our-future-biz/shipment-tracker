"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { Pill } from "@/components/Pill";
import { PillTabs } from "@/components/SectionCard";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { useTariffs, type TariffListItem, type TariffSide, type TariffVersionSummary } from "@/hooks/useTrucking";
import { isTruckingManager } from "../_lib/roles";
import { SCOPE_LABELS, TARIFF_SIDES, ZONE_BY_LABELS, modeLabel, ownerLabel, tariffListStatus, validityLabel, versionLabel } from "../_lib/tariffs";
import { TariffCreateModal } from "./TariffCreateModal";

export const tariffHref = (id: string) => `/trucking/tariffs/${id}`;

const SIDE_PARAM: Record<string, TariffSide> = { buy: "BUY", sell: "SELL", internal: "INTERNAL" };
const DEFAULT_SIDE: TariffSide = "SELL";

const byText = (a: string, b: string) => a.localeCompare(b, "cs");

const VersionCell = ({ version }: { version: TariffVersionSummary | null }) => {
  if (!version) return <span className="text-slate-400">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-slate-800">{versionLabel(version)}</span>
      <span className="ml-1.5 text-[12px] text-slate-500">{validityLabel(version.validFrom, version.validTo)}</span>
    </span>
  );
};

const COLUMNS: AppGridColumn<TariffListItem>[] = [
  {
    key: "name",
    title: "Tariff",
    text: (t) => t.name,
    sorter: (a, b) => byText(a.name, b.name),
    render: (_, t) => (
      <Link href={tariffHref(t.id)} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-600 hover:underline">
        {t.name}
      </Link>
    ),
  },
  { key: "owner", title: "Owner", text: ownerLabel, sorter: (a, b) => byText(ownerLabel(a), ownerLabel(b)) },
  { key: "scope", title: "Scope", text: (t) => SCOPE_LABELS[t.scope], filterOptions: Object.values(SCOPE_LABELS) },
  { key: "mode", title: "Mode", text: modeLabel },
  { key: "currency", title: "Currency", text: (t) => t.currency, filterOptions: ["CZK", "EUR"] },
  { key: "zoneBy", title: "Zone from", text: (t) => ZONE_BY_LABELS[t.zoneBy], defaultVisible: false },
  {
    key: "active",
    title: "Active version",
    text: (t) => (t.activeVersion ? `${versionLabel(t.activeVersion)} ${validityLabel(t.activeVersion.validFrom, t.activeVersion.validTo)}` : ""),
    render: (_, t) => <VersionCell version={t.activeVersion} />,
  },
  {
    key: "next",
    title: "Next version",
    text: (t) => (t.nextVersion ? `${versionLabel(t.nextVersion)} from ${formatDate(t.nextVersion.validFrom)}` : ""),
    render: (_, t) =>
      t.nextVersion ? (
        <span className="whitespace-nowrap">
          <span className="font-semibold text-slate-800">{versionLabel(t.nextVersion)}</span>
          <span className="ml-1.5 text-[12px] text-slate-500">from {formatDate(t.nextVersion.validFrom)}</span>
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    key: "drafts",
    title: "Drafts",
    text: (t) => String(t.draftCount),
    sorter: (a, b) => a.draftCount - b.draftCount,
    render: (_, t) => (t.draftCount ? <span className="tabular-nums">{t.draftCount}</span> : <span className="text-slate-400">0</span>),
  },
  {
    key: "status",
    title: "Status",
    text: (t) => tariffListStatus(t).label,
    filterOptions: ["Active", "Follows Standard", "Scheduled", "Draft only", "No versions"],
    render: (_, t) => {
      const s = tariffListStatus(t);
      return (
        <Tooltip title={s.hint} mouseEnterDelay={0.4}>
          <Pill tone={s.tone}>{s.label}</Pill>
        </Tooltip>
      );
    },
  },
];

// The tariffs of one side (?side=buy|sell|internal, sell by default): who they belong to, how they
// price and which version prices today. A row opens the tariff; a manager creates new ones.
export const TruckingTariffsTab = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { tariffs, isLoading, create, isCreating } = useTariffs();
  const [createOpen, setCreateOpen] = useState(false);

  const side = SIDE_PARAM[searchParams.get("side") ?? ""] ?? DEFAULT_SIDE;
  const setSide = (next: TariffSide) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("side", next.toLowerCase());
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const counts = useMemo(() => {
    const out: Record<TariffSide, number> = { BUY: 0, SELL: 0, INTERNAL: 0 };
    for (const t of tariffs) out[t.side] += 1;
    return out;
  }, [tariffs]);
  const rows = useMemo(() => tariffs.filter((t) => t.side === side), [tariffs, side]);
  const sideInfo = TARIFF_SIDES.find((s) => s.key === side)!;

  return (
    <>
      <AppGrid<TariffListItem>
        subHeader={
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PillTabs tabs={TARIFF_SIDES.map((s) => ({ key: s.key, label: `${s.label} · ${counts[s.key]}` }))} active={side} onChange={setSide} />
            <span className="text-[12.5px] text-slate-500">{sideInfo.hint}.</span>
          </div>
        }
        searchPlaceholder="Search tariff, owner…"
        columns={COLUMNS}
        rows={rows}
        rowKey={(t) => t.id}
        loading={isLoading}
        onRowClick={(t) => router.push(tariffHref(t.id))}
        storageKey="trucking:tariffs:v1"
        exportFilePrefix={`tariffs-${side.toLowerCase()}`}
        emptyText={`No ${sideInfo.label.toLowerCase()} tariffs yet.${isTruckingManager(user) ? " Create one with “New tariff”." : ""}`}
        resetKey={side}
        actions={
          isTruckingManager(user) && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <PlusOutlined />
              New tariff
            </button>
          )
        }
      />
      <TariffCreateModal
        key={side}
        open={createOpen}
        side={side}
        onClose={() => setCreateOpen(false)}
        create={create}
        isCreating={isCreating}
        onCreated={(id) => {
          setCreateOpen(false);
          router.push(tariffHref(id));
        }}
      />
    </>
  );
};
