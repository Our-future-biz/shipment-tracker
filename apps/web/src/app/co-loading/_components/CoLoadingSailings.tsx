"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useCoLoadingSailings } from "@/hooks/useCoLoadingServices";
import { formatDate } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN_PRIMARY, CARD, EMPTY_STATE, HEADING, LINK, REF, TD, TH } from "@/styles/ui";
import { sailingHref } from "../_lib/sailings";
import { CreateSailingModal } from "./CreateSailingModal";

// A Co-Loading Concept service's sailings, the newest first, over its shipments: "Create new sailing"
// on the right, above the grid's Export. A closed service takes no new sailing until it is reopened.
export function CoLoadingSailings({ serviceId, closed }: { serviceId: string; closed: boolean }) {
  const { sailings, isLoading, isError, create } = useCoLoadingSailings(serviceId);
  const message = useMessages();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const button = (
    <button
      type="button"
      onClick={() => setCreating(true)}
      disabled={closed}
      className={`${BTN_PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <PlusOutlined />
      Create new sailing
    </button>
  );

  let empty: string | null = null;
  if (isLoading) empty = "Loading sailings…";
  else if (isError) empty = "Could not load the sailings.";
  else if (sailings.length === 0)
    empty = closed
      ? "No sailings."
      : "No sailings yet - create the first one with Create new sailing.";

  return (
    <section className={`${CARD} px-4 py-3`} aria-label="Sailings">
      <div className="flex items-center justify-between gap-3">
        <h2 className={HEADING}>Sailings</h2>
        {closed ? (
          <Tooltip title="The service is closed: it takes no new sailing until it is reopened.">
            {/* A disabled button takes no hover: the span around it shows the reason. */}
            <span className="inline-flex">{button}</span>
          </Tooltip>
        ) : (
          button
        )}
      </div>
      {empty ? (
        <p className={`${EMPTY_STATE} m-0 !py-4`}>{empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Vessel</th>
                <th className={TH}>Voyage</th>
                <th className={TH}>Port of Loading</th>
                <th className={TH}>Port of Discharge</th>
                <th className={TH}>HUB</th>
                <th className={TH}>Container Type</th>
                <th className={TH}>Created</th>
              </tr>
            </thead>
            <tbody>
              {sailings.map((s) => (
                // A sailing opens its own page: by its vessel (a link, so it also opens in a new tab) or anywhere on its row.
                <tr
                  key={s.id}
                  onClick={() => router.push(sailingHref(s))}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className={TD}>
                    <Link
                      href={sailingHref(s)}
                      onClick={(e) => e.stopPropagation()}
                      className={`${LINK} ${REF} font-semibold`}
                    >
                      {s.vessel}
                    </Link>
                  </td>
                  <td className={TD}>{s.voyage || "—"}</td>
                  <td className={TD}>{s.pol}</td>
                  <td className={TD}>{s.pod}</td>
                  <td className={TD}>{s.hub}</td>
                  <td className={TD}>{s.containerType}</td>
                  <td className={`${TD} whitespace-nowrap text-slate-500`}>
                    {formatDate(s.createdAt)}
                    {s.createdByName ? ` · ${s.createdByName}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateSailingModal
        open={creating}
        onClose={() => setCreating(false)}
        saving={create.isPending}
        onCreate={async (input) => {
          const { sailing } = await create.mutateAsync(input);
          message.success(
            `Sailing ${sailing.vessel}${sailing.voyage ? ` ${sailing.voyage}` : ""} created`,
          );
          return sailing;
        }}
      />
    </section>
  );
}
