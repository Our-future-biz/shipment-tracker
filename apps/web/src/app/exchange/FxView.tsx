"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Spin, Tabs, Tooltip, message } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate, formatDateTime } from "@/lib/date";
import { CARD, FX_KEYS, type FxOverview } from "./_components/fxShared";
import { OverviewCards } from "./_components/OverviewCards";
import { DailyTab } from "./_components/DailyTab";
import { AveragesTab } from "./_components/AveragesTab";
import { RoeHistoryTab } from "./_components/RoeHistoryTab";
import { ImportLogTab } from "./_components/ImportLogTab";
import { ExchangeView } from "./ExchangeView";

const SYNC_ROLES = ["superadmin", "admin", "manager"];

function SyncPill({ sync }: { sync: FxOverview["sync"] }) {
  if (sync.state === "ok") {
    return (
      <span className="text-[12.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600 rounded-md px-2 py-0.5">
        Up to date · fixing {formatDate(sync.latestFixing)}
      </span>
    );
  }
  if (sync.state === "failed" || sync.state === "empty") {
    return (
      <span className="text-[12.5px] font-semibold text-red-700 bg-red-50 border border-red-600 rounded-md px-2 py-0.5">
        {sync.state === "empty" ? "No rates imported yet" : `Last sync failed ${formatDateTime(sync.lastRunAt)}`}
      </span>
    );
  }
  return (
    <span className="text-[12.5px] font-semibold text-[#95620B] bg-[#FBEED2] border border-[#95620B] rounded-md px-2 py-0.5">
      Waiting for ČNB fixing of {formatDate(sync.expectedFixing)}
    </span>
  );
}

// Explains anything other than "up to date", in words someone can act on.
function SyncWarning({ sync }: { sync: FxOverview["sync"] }) {
  if (sync.state === "ok") return null;
  const failed = sync.state === "failed" || sync.state === "empty";
  const text =
    sync.state === "empty"
      ? "No ČNB rates are stored yet. Use Sync now to import them."
      : failed
        ? `The last import failed (${sync.lastError || "no details"}). Rates shown are from the ${formatDate(sync.latestFixing)} fixing. ` +
          "The tool retries at 15:30 and 16:00."
        : `Today's ČNB fixing is not in yet. The tool pulls at 15:00, 15:30 and 16:00; ` +
          `until then the ${formatDate(sync.latestFixing)} fixing applies.`;
  return (
    <div
      className={
        "rounded-xl px-4 py-3 text-[13.5px] border " +
        (failed ? "bg-red-50 border-red-300 text-red-800" : "bg-[#FBEED2] border-[#E5C27A] text-[#6B4A0B]")
      }
    >
      {text}
    </div>
  );
}

// A fixing still missing after the 16:00 pull: reported to the admins, open until it arrives.
function AlertBanner({ alerts }: { alerts: FxOverview["alerts"] }) {
  if (!alerts.length) return null;
  return (
    <div className="rounded-xl px-4 py-3 text-[13.5px] border bg-red-50 border-red-300 text-red-800 flex flex-col gap-1">
      {alerts.map((a) => (
        <div key={a.id}>
          <span className="font-semibold">ČNB rates missing for {formatDate(a.fixingDate)}</span> — {a.reason}.{" "}
          <span className="text-red-700/80">
            {a.emailedAt ? `Admins e-mailed ${formatDateTime(a.emailedAt)}.` : `E-mail not sent: ${a.emailError || "unknown reason"}.`}
          </span>
        </div>
      ))}
      <div className="text-[12.5px] text-red-700/80">This closes by itself once the rates are imported (Sync now, or the next day&apos;s pull).</div>
    </div>
  );
}

export function FxView() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canSync = user != null && SYNC_ROLES.includes(user.role);
  const isAdmin = user != null && (user.role === "admin" || user.role === "superadmin");

  const { data, isLoading } = useQuery({
    queryKey: FX_KEYS.overview,
    queryFn: () => api.fx.fxOverview(),
    // Picks up the scheduled pulls (15:00, 15:30, 16:00) while the page is open.
    refetchInterval: (q) => (q.state.data?.sync.state === "ok" ? 5 * 60_000 : 60_000),
  });

  const sync = useMutation({
    mutationFn: () => api.fx.fxSync(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["fx"] });
      if (res.status === "failed") message.error(`ČNB import failed: ${res.error ?? ""}`);
      else if (res.status === "ok") message.success(`Imported ${res.rowsAdded} new rates`);
      else message.info("No new fixing — rates are already current");
    },
    onError: (e: unknown) => message.error(e instanceof Error ? e.message : "Sync failed"),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin />
      </div>
    );
  }

  return (
    <>
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-slate-600">ČNB official rates — CZK per 1 unit</span>
          <SyncPill sync={data.sync} />
          <span className="text-[12px] text-slate-400">Pulled daily at 15:00 · Zdroj: ČNB</span>
        </div>
        {canSync && (
          <Tooltip title="Fetch the latest fixing from ČNB now">
            <Button icon={<SyncOutlined spin={sync.isPending} />} onClick={() => sync.mutate()} disabled={sync.isPending} style={{ borderRadius: 6, height: 32 }}>
              Sync now
            </Button>
          </Tooltip>
        )}
      </div>

      <AlertBanner alerts={data.alerts} />
      {data.alerts.length === 0 && <SyncWarning sync={data.sync} />}
      <OverviewCards data={data} isAdmin={isAdmin} />

      <div className={`${CARD} px-4 pt-1 pb-4`}>
        <Tabs
          defaultActiveKey="daily"
          items={[
            { key: "daily", label: "Daily rates", children: <DailyTab initialMonth={data.month} /> },
            { key: "averages", label: "Period averages", children: <AveragesTab initialYear={Number(data.today.slice(0, 4))} /> },
            { key: "roe", label: "ROE history", children: <RoeHistoryTab /> },
            { key: "log", label: "Import log", children: <ImportLogTab /> },
            {
              key: "weekly",
              label: "Weekly sheet (Costs Breakdown)",
              children: (
                <div className="flex flex-col gap-4 pt-1">
                  <p className="text-[13px] text-slate-500 m-0">
                    Costs Breakdown still uses these hand-entered weekly rates. It moves to the ČNB rates in the next phase;
                    this sheet is then kept read-only for comparison.
                  </p>
                  <ExchangeView />
                </div>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
