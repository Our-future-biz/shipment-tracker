"use client";

import { Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/SectionCard";
import { isNotFound, publicApi } from "@/lib/api";
import { businessDateTime, formatDate } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { BTN, EMPTY, HINT, PAGE_SUBTITLE, PAGE_TITLE, REF } from "@/styles/ui";
import { Bi } from "@/app/haulier/_components/Bi";
import { LEG_TITLES, TEXT, asOfText, cargoText, contactText, kindText, routeText, stateText, stepText } from "./statusText";

type State = interfaces.PublicMilestone["state"];

const DOT: Record<State, string> = {
  done: "border-emerald-600 bg-emerald-600",
  next: "border-indigo-600 bg-indigo-600",
  open: "border-slate-300 bg-white",
  unconfirmed: "border-amber-500 bg-white",
};

const STATE_TEXT: Record<State, string> = {
  done: "text-emerald-700",
  next: "text-indigo-700",
  open: "text-slate-500",
  unconfirmed: "text-amber-700",
};

function Row({ m }: { m: interfaces.PublicMilestone }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span aria-hidden className={`mt-1 size-3 shrink-0 rounded-full border-2 ${DOT[m.state]}`} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-900">
          <Bi text={stepText(m.label)} />
        </div>
        {/* Printed beside the dot, so a phone shows it too, in the words the staff's customer-view preview uses
            (User Council E2): never "late", and "Still to come" for a step with no planned day yet (Q15). */}
        <div className={`text-[12px] font-medium ${STATE_TEXT[m.state]}`}>
          <Bi text={stateText(m.state, !!m.planned)} />
        </div>
        {m.place && <div className={HINT}>{m.place}</div>}
        {m.detail && <div className={HINT}>{m.detail}</div>}
      </div>
      <div className="shrink-0 text-right text-[13px] tabular-nums">
        {m.actual ? (
          <span className="font-medium text-slate-900">{formatDate(m.actual)}</span>
        ) : m.planned ? (
          <span className="text-slate-700">
            <Bi text={TEXT.planned} /> {formatDate(m.planned)}
            {/* on a phone its own line, so the step's name keeps its room */}
            {m.state === "unconfirmed" && (
              <span className="block">
                <Bi text={TEXT.notConfirmed} />
              </span>
            )}
          </span>
        ) : (
          <span className={EMPTY}>—</span>
        )}
      </div>
    </li>
  );
}

/** What a customer sees through their link: the dates of one shipment, read-only, in Czech and English. */
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
        <p className="m-0 text-center text-[14px] text-slate-700">
          <Bi text={gone ? TEXT.linkInvalid : TEXT.loadFailed} />
        </p>
        {!gone && (
          <button type="button" disabled={isFetching} onClick={() => void refetch()} className={BTN}>
            <Bi text={TEXT.tryAgain} />
          </button>
        )}
      </main>
    );
  }

  const { status } = data;
  const route = routeText(status);
  const kind = kindText(status);
  const cargo = cargoText(status);
  const contact = contactText(status);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header>
          {status.ourCompany && <div className={PAGE_SUBTITLE}>{status.ourCompany}</div>}
          <h1 className={PAGE_TITLE}>
            <Bi text={TEXT.shipment} /> <span className={REF}>{status.reference}</span>
          </h1>
          {status.customerReference && (
            <div className={`mt-1 ${PAGE_SUBTITLE}`}>
              <Bi text={TEXT.yourReference} />: {status.customerReference}
            </div>
          )}
          {kind.en && (
            <div className={PAGE_SUBTITLE}>
              <Bi text={kind} />
            </div>
          )}
          {route && <div className="mt-1 text-[14px] text-slate-900">{route}</div>}
          {cargo && (
            <div className={PAGE_SUBTITLE}>
              <Bi text={TEXT.cargo} />: {cargo}
            </div>
          )}
          {status.vessel && <div className={PAGE_SUBTITLE}>{status.vessel}</div>}
          {status.containers.length > 0 && <div className={`${PAGE_SUBTITLE} ${REF}`}>{status.containers.join(", ")}</div>}
        </header>

        {LEG_TITLES.map((leg) => {
          const rows = status.milestones.filter((m) => m.leg === leg.key);
          if (rows.length === 0) return null;
          return (
            <SectionCard key={leg.key} title={`${leg.text.cs} · ${leg.text.en}`} bodyClassName="p-0">
              <ul className="m-0 p-0 list-none divide-y divide-slate-100">
                {rows.map((m) => (
                  <Row key={m.key} m={m} />
                ))}
              </ul>
            </SectionCard>
          );
        })}

        {/* Whom to ask (user council E10): our company and its own phone and e-mail, never a person. */}
        {contact && (
          <p className="m-0 text-[13px] text-slate-700">
            <Bi text={contact.lead} />
            {contact.ways.length > 0 && (
              <span className="block tabular-nums">
                {contact.ways.map((w, i) => (
                  <span key={w}>
                    {i > 0 && " · "}
                    {w.includes("@") ? (
                      <a href={`mailto:${w}`} className="text-indigo-600">
                        {w}
                      </a>
                    ) : (
                      <a href={`tel:${w.replace(/\s/g, "")}`} className="text-indigo-600">
                        {w}
                      </a>
                    )}
                  </span>
                ))}
              </span>
            )}
          </p>
        )}

        <p className={`${HINT} m-0`}>
          <Bi text={asOfText(businessDateTime(status.asOf))} />
        </p>
      </div>
    </main>
  );
}
