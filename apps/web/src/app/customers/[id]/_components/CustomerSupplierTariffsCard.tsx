"use client";

import Link from "next/link";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import { useSupplierTariffs } from "./useSupplierTariffs";

interface CustomerSupplierTariffsCardProps {
  customer: CustomerItem;
}

// The tariffs Tariffs holds from this supplier, per role, each leading to its page under Tariffs.
export function CustomerSupplierTariffsCard({ customer }: CustomerSupplierTariffsCardProps) {
  const { summaries, isLoading, isError, hasTariffRole } = useSupplierTariffs(customer);
  if (!hasTariffRole) return null;

  return (
    <SectionCard title="Tariffs we hold">
      {isLoading && <span className="text-xs text-slate-400">Loading…</span>}
      {isError && <span className="text-xs text-red-600">The tariffs could not be read.</span>}
      {summaries.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {summaries.map((t) => (
            <li key={t.role} className="flex items-baseline justify-between gap-3 text-[13px]">
              <Link href={t.href} className="font-medium text-indigo-600 hover:underline">
                {t.label}
              </Link>
              <span className={`text-xs ${t.activeCount === 0 ? "text-red-600" : "text-slate-500"}`}>
                {t.tariffCount === 0
                  ? "None on file"
                  : t.activeCount === 0
                    ? `${t.tariffCount} on file, none valid today`
                    : `${t.activeCount} valid${t.activeUntil ? ` · to ${formatDate(t.activeUntil)}` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
