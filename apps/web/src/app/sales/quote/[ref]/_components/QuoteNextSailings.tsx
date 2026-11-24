"use client";

import Link from "next/link";
import { Select } from "antd";
import { BoxFillChip } from "@/app/co-loading/_components/BoxFillChip";
import { SailingStagePill } from "@/app/co-loading/_components/SailingStageControl";
import { freeWords } from "@/app/co-loading/_lib/attention";
import { containersWords } from "@/app/co-loading/_lib/boxUtilization";
import { CUTOFF_TONE, cutoffState, cutoffWords, sailingHref, sailingTitle } from "@/app/co-loading/_lib/sailings";
import { useCoLoadingBoard, useCoLoadingServices } from "@/hooks/useCoLoadingServices";
import { businessToday, formatDate } from "@/lib/date";
import { HINT, LABEL_TEXT, LINK, REF, TD, TH } from "@/styles/ui";
import { lclServicesFor, nextSailingsEmpty, nextSailingsOf } from "../../../_lib/nextSailings";

interface QuoteNextSailingsProps {
  /** The Co-Loading service the quote names; undefined while it names none. */
  serviceId: string | undefined;
  /** The quote's direction ("Import" / "Export"): its services are offered first. */
  direction: string | undefined;
  onPick: (serviceId: string | undefined) => void;
  readOnly: boolean;
}

// "Next sailings" in a Sea LCL quote's Routing (Council Outlay 14, C7): the quote names one of the
// company's Co-Loading Concept services and shows its next three sailings - cut-off, departure and
// the room left in the box - so sales answers "when is the next departure?" from the quote. The
// figures are the board's own, read as the quote is looked at; nothing of them is stored on the
// quote but the service's name. No money is shown.
export function QuoteNextSailings({ serviceId, direction, onPick, readOnly }: QuoteNextSailingsProps) {
  const { services, isLoading: servicesLoading } = useCoLoadingServices();
  const { board, isLoading: boardLoading, isError } = useCoLoadingBoard();
  const today = businessToday();
  const options = lclServicesFor(services, direction, serviceId);
  // Nothing to offer and nothing named: the company runs no sea-LCL service, and the quote says nothing about it.
  if (!servicesLoading && options.length === 0 && !serviceId) return null;
  const known = options.some((s) => s.id === serviceId && !s.closedAt);
  const sailings = nextSailingsOf(board?.sailings ?? [], serviceId);
  const empty = nextSailingsEmpty(!!serviceId, sailings.length, known);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-2.5">
        <span className={LABEL_TEXT}>Next sailings</span>
        <Select
          aria-label="Co-Loading service of this quote"
          size="small"
          className="min-w-[260px]"
          allowClear
          placeholder="Pick the Co-Loading service"
          loading={servicesLoading}
          disabled={readOnly}
          value={serviceId}
          onChange={(value) => onPick(value || undefined)}
          // A service named earlier that this person can no longer see (closed, or removed) still reads as words.
          options={[
            ...options.map((s) => ({ value: s.id, label: s.closedAt ? `${s.name} (closed)` : s.name })),
            ...(serviceId && !servicesLoading && !options.some((s) => s.id === serviceId) ? [{ value: serviceId, label: "A service no longer open" }] : []),
          ]}
        />
      </div>
      {isError ? (
        <p className="m-0 px-4 py-3 text-[13px] text-red-600" role="alert">
          The sailings could not be read.
        </p>
      ) : boardLoading && serviceId ? (
        <p className={`${HINT} m-0 px-4 py-3`}>Reading the sailings…</p>
      ) : empty ? (
        <p className={`${HINT} m-0 px-4 py-3`} role="status">
          {empty}
        </p>
      ) : (
        <div className="overflow-x-auto px-4 py-3">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Sailing</th>
                <th className={`${TH} w-[150px]`}>Cut-off</th>
                <th className={`${TH} w-[120px]`}>Departure</th>
                <th className={`${TH} w-[150px]`}>Box</th>
                <th className={`${TH} w-[190px]`}>Room left</th>
              </tr>
            </thead>
            <tbody>
              {sailings.map((s) => {
                const near = cutoffWords(s.cutoffDate, today);
                const over = (s.free.cbm ?? 0) < 0 || (s.free.kg ?? 0) < 0;
                return (
                  <tr key={s.id}>
                    <td className={TD}>
                      <Link href={sailingHref(s)} className={`${REF} ${LINK} font-semibold`}>
                        {sailingTitle(s)}
                      </Link>{" "}
                      <SailingStagePill sailing={s} />
                      <span className="block text-[11px] text-slate-500">{containersWords(s)}</span>
                    </td>
                    <td className={`${TD} tabular-nums`}>
                      {formatDate(s.cutoffDate) || "—"}
                      {near && <span className={`block text-[11px] font-medium ${CUTOFF_TONE[cutoffState(s.cutoffDate, today)]}`}>{near}</span>}
                    </td>
                    <td className={`${TD} tabular-nums`}>{formatDate(s.departureDate) || "—"}</td>
                    <td className={TD}>{s.fill ? <BoxFillChip fill={s.fill} /> : "—"}</td>
                    <td className={`${TD} tabular-nums ${over ? "font-semibold text-red-600" : ""}`}>{freeWords(s.free)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={`${HINT} m-0 border-t border-slate-100 px-4 py-2.5`}>
        The next three sailings of the service still to come, as they stand now. The room left is against what the box is planned to take; it promises no space until the shipment is linked to
        the sailing.
      </p>
    </div>
  );
}
