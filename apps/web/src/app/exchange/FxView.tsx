"use client";

import { Alert, Button, Spin, Tabs, Tooltip } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useFxOverview, useFxSync } from "@/hooks/useFx";
import { formatDate, formatDateTime } from "@/lib/date";
import { CARD, type FxOverview } from "./_components/fxShared";
import { OverviewCards } from "./_components/OverviewCards";
import { DailyTab } from "./_components/DailyTab";
import { AveragesTab } from "./_components/AveragesTab";
import { RoeHistoryTab } from "./_components/RoeHistoryTab";
import { ImportLogTab } from "./_components/ImportLogTab";

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
    <span className="text-[12.5px] font-semibold text-warn bg-warn-soft border border-warn rounded-md px-2 py-0.5">
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
        (failed ? "bg-red-50 border-red-300 text-red-800" : "bg-warn-soft border-warn/40 text-warn-ink")
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
  const toast = useToast();
  const { user } = useAuth();
  const canSync = user != null && SYNC_ROLES.includes(user.role);
  const isAdmin = user != null && (user.role === "admin" || user.role === "superadmin");

  const { data, isLoading, isError } = useFxOverview();
  const sync = useFxSync();

  const handleSync = () =>
    sync.mutate(undefined, {
      onSuccess: (res) => {
        if (res.status === "failed") toast.error(`ČNB import failed${res.error ? `: ${res.error}` : ""}`);
        else if (res.status === "ok") toast.success(`Imported ${res.rowsAdded} new rates`);
        else toast.info("No new fixing — rates are already current");
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Sync failed"),
    });

  if (isError) {
    return <Alert type="error" showIcon message="Could not load the exchange rates. Try reloading the page." />;
  }
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
          <span className="text-[12px] text-slate-400">Pulled daily at 15:00 · Source: ČNB</span>
        </div>
        {canSync && (
          <Tooltip title="Fetch the latest fixing from ČNB now">
            <Button icon={<SyncOutlined spin={sync.isPending} />} onClick={handleSync} disabled={sync.isPending} className="!rounded-md !h-8">
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
          ]}
        />
      </div>
    </>
  );
}
