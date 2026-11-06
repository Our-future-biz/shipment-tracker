"use client";

import { Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/SectionCard";
import { isNotFound, publicApi } from "@/lib/api";
import { businessDateTime, formatDate } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { BTN, EMPTY, HINT, PAGE_SUBTITLE, PAGE_TITLE, REF } from "@/styles/ui";

type Milestone = interfaces.PublicMilestone;

const LEGS: { key: string; label: string }[] = [
  { key: "origin", label: "Origin" },
  { key: "main", label: "Main leg" },
  { key: "destination", label: "Destination" },
];

const DOT: Record<Milestone["state"], string> = {
  done: "border-emerald-600 bg-emerald-600",
  next: "border-indigo-600 bg-indigo-600",
  open: "border-slate-300 bg-white",
};

const STATE_NAME: Record<Milestone["state"], string> = { done: "Done", next: "Next step", open: "Still to come" };

function Row({ m }: { m: Milestone }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span title={STATE_NAME[m.state]} className={`mt-1 size-3 shrink-0 rounded-full border-2 ${DOT[m.state]}`}>
        <span className="sr-only">{STATE_NAME[m.state]}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-900">{m.label}</div>
        {m.place && <div className={HINT}>{m.place}</div>}
        {m.detail && <div className={HINT}>{m.detail}</div>}
      </div>
      <div className="shrink-0 text-right text-[13px] tabular-nums">
        {m.actual ? (
          <span className="font-medium text-slate-900">{formatDate(m.actual)}</span>
        ) : m.planned ? (
          <span className="text-slate-700">Planned {formatDate(m.planned)}</span>
        ) : (
          <span className={EMPTY}>—</span>
        )}
      </div>
    </li>
  );
}

/** What a customer sees through their link: the dates of one shipment, read-only. */
export function ShipmentStatusView({ token }: { token: string }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["public-shipment-status", token],
    queryFn: () => publicApi.shipments.publicShipmentStatus(token),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spin />
      </main>
    );
  }
  if (!data) {
    // A customer reads no server's wording: a link that doesn't open is just no longer valid.
    const gone = isNotFound(error);
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="m-0 text-[14px] text-slate-700">{gone ? "This link is no longer valid." : "Could not load this page. Please try again in a moment."}</p>
        {!gone && (
          <button type="button" disabled={isFetching} onClick={() => void refetch()} className={BTN}>
            Try again
          </button>
        )}
      </main>
    );
  }

  const { status } = data;
  const route = [status.pol, status.pod].filter(Boolean).join(" → ");
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header>
          {status.ourCompany && <div className={PAGE_SUBTITLE}>{status.ourCompany}</div>}
          <h1 className={PAGE_TITLE}>
            Shipment <span className={REF}>{status.reference}</span>
          </h1>
          <div className={`mt-1 ${PAGE_SUBTITLE}`}>{[status.customerReference && `Your reference ${status.customerReference}`, status.direction, status.freightMode].filter(Boolean).join(" · ")}</div>
          {route && <div className="mt-1 text-[14px] text-slate-900">{route}</div>}
          {status.vessel && <div className={PAGE_SUBTITLE}>{status.vessel}</div>}
          {status.containers.length > 0 && <div className={`${PAGE_SUBTITLE} ${REF}`}>{status.containers.join(", ")}</div>}
        </header>

        {LEGS.map((leg) => {
          const rows = status.milestones.filter((m) => m.leg === leg.key);
          if (rows.length === 0) return null;
          return (
            <SectionCard key={leg.key} title={leg.label} bodyClassName="p-0">
              <ul className="m-0 p-0 list-none divide-y divide-slate-100">
                {rows.map((m) => (
                  <Row key={m.key} m={m} />
                ))}
              </ul>
            </SectionCard>
          );
        })}

        <p className={`${HINT} m-0`}>As of {businessDateTime(status.asOf)}, Prague time. Dates may change while the shipment is under way.</p>
      </div>
    </main>
  );
}
