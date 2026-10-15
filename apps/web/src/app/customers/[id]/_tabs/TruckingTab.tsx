"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Tooltip } from "antd";
import { PercentageOutlined, PlusOutlined } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import { SectionCard } from "@/components/SectionCard";
import { useCustomer } from "@/hooks/useCustomers";
import { useTariffs, type TariffListItem } from "@/hooks/useTrucking";
import { useAuth } from "@/lib/auth/AuthContext";
import { TariffCreateModal, type TariffCreatePreset } from "@/app/trucking/_components/TariffCreateModal";
import { tariffHref } from "@/app/trucking/_components/TruckingTariffsTab";
import { isTruckingManager } from "@/app/trucking/_lib/roles";
import { SCOPE_LABELS, modeLabel, tariffListStatus, validityLabel, versionLabel } from "@/app/trucking/_lib/tariffs";
import { haulierBuyTariffs, priceListsUsed } from "../../_lib/customerTrucking";
import { CustomerConsignmentsCard } from "./CustomerConsignmentsCard";

const LINK = "font-semibold text-indigo-600 hover:underline";

// One tariff in a line: its name (to the tariff page), how it prices and the version that prices today.
const TariffLine = ({ tariff, note }: { tariff: TariffListItem; note?: string }) => {
  const status = tariffListStatus(tariff);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 border-b border-slate-100 last:border-b-0 text-[13px]">
      <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{SCOPE_LABELS[tariff.scope]}</span>
      <Link href={tariffHref(tariff.id)} className={LINK}>
        {tariff.name}
      </Link>
      <span className="text-slate-600">{modeLabel(tariff)}</span>
      {tariff.activeVersion && (
        <span className="text-slate-500 whitespace-nowrap">
          {versionLabel(tariff.activeVersion)} · {validityLabel(tariff.activeVersion.validFrom, tariff.activeVersion.validTo)}
        </span>
      )}
      <Tooltip title={status.hint}>
        <Pill tone={status.tone}>{status.label}</Pill>
      </Tooltip>
      {note && <span className="text-[12px] text-slate-500">{note}</span>}
    </div>
  );
};

// What trucking means for this company: the price list its consignments are priced with, for a
// haulier its buy tariffs, and its consignments. The tariffs themselves are kept in Trucking.
export function TruckingTab({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { customer } = useCustomer(customerId);
  const { tariffs, isLoading, isError, create, isCreating } = useTariffs();
  const [preset, setPreset] = useState<TariffCreatePreset | null>(null);

  const canManage = isTruckingManager(user);
  const used = priceListsUsed(tariffs, customerId);
  const hasOwn = used.some((u) => u.own);
  const buy = haulierBuyTariffs(tariffs, customerId);
  const isHaulier = !!customer?.roles.includes("haulier");
  const name = customer?.companyName ?? "this customer";

  const openCreate = (discount: boolean) => setPreset({ ownerCustomerId: customerId, ownerName: name, discount });

  const usedNote = (u: (typeof used)[number]) => {
    if (!u.own) return "Standard list — the customer has no own list for this scope";
    if (u.tariff.mode === "DISCOUNT") return u.standard?.activeVersion ? `follows Standard ${versionLabel(u.standard.activeVersion)}` : "follows the Standard list";
    return undefined;
  };

  let priceLists = <div className="text-[13px] text-slate-500">No sell price list exists yet. A manager creates the Standard list under Trucking → Tariffs.</div>;
  if (isLoading) priceLists = <div className="text-[13px] text-slate-400">Loading…</div>;
  else if (isError) priceLists = <div className="text-[13px] text-red-600">The tariffs could not be read.</div>;
  else if (used.length) priceLists = <div>{used.map((u) => <TariffLine key={u.scope} tariff={u.tariff} note={usedNote(u)} />)}</div>;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Price list used"
        extra={
          canManage && (
            <>
              <Button size="small" icon={<PercentageOutlined />} onClick={() => openCreate(true)}>
                Give a discount on Standard…
              </Button>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(false)}>
                Create own price list
              </Button>
            </>
          )
        }
      >
        <p className="mt-0 mb-2 text-[12.5px] text-slate-500">
          Quotes and the rate calculator price {name}&apos;s consignments with {hasOwn ? "its own list where it has one" : "the Standard list"}; a scope without an own list
          falls back to Standard.
        </p>
        {priceLists}
      </SectionCard>

      {isHaulier && (
        <SectionCard
          title="Buy tariffs (haulier)"
          extra={
            <Link href={`/trucking/hauliers/${customerId}`} className="text-xs font-semibold text-indigo-600 whitespace-nowrap hover:underline">
              Open in Trucking
            </Link>
          }
        >
          {buy.length ? (
            <div>{buy.map((t) => <TariffLine key={t.id} tariff={t} />)}</div>
          ) : (
            <div className="text-[13px] text-slate-500">
              No buy tariff yet{canManage ? " — create one under Trucking → Tariffs → Buy" : ""}. Without one the haulier is not offered when pricing.
            </div>
          )}
        </SectionCard>
      )}

      <CustomerConsignmentsCard customerId={customerId} companyName={customer?.companyName ?? ""} />

      {preset && (
        <TariffCreateModal
          key={String(preset.discount)}
          open
          side="SELL"
          preset={preset}
          onClose={() => setPreset(null)}
          create={create}
          isCreating={isCreating}
          onCreated={(id) => {
            setPreset(null);
            router.push(tariffHref(id));
          }}
        />
      )}
    </div>
  );
}
