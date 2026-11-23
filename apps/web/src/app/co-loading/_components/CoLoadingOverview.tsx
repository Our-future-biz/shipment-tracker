"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "antd";
import { PlusOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { ArrowsMergeIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Pill } from "@/components/Pill";
import { useCoLoadingServices } from "@/hooks/useCoLoadingServices";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN, BTN_PRIMARY, CARD, HINT, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";
import { canManageServices, closedLine, searchServices, tileLine, tilesInOrder } from "../_lib/services";
import { CoLoadingSettingsModal } from "./CoLoadingSettingsModal";
import { NewServiceModal } from "./NewServiceModal";

// Co-Loading Concept's own page: the consolidation hub customer service works in. The bar (New Service on
// the left, the search in the middle, as on Master Jobs) and the company's services as tiles to pick
// from, as Finance shows its pages. The search looks through the services only. Managers and higher
// make services (New Service) and see the closed ones too, after the open ones, to reopen them; for
// everyone else a closed service's tile is gone.
export function CoLoadingOverview() {
  const { services, isLoading, isError, create } = useCoLoadingServices();
  const { user } = useAuth();
  const isManager = canManageServices(user?.role);
  const message = useMessages();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const shown = useMemo(() => tilesInOrder(searchServices(services, query)), [services, query]);

  let empty: string | null = null;
  if (isLoading) empty = "Loading services…";
  else if (isError) empty = "Could not load the services.";
  else if (services.length === 0) empty = isManager ? "No services yet - create the first one with New Service." : "No services are open.";
  else if (shown.length === 0) empty = "No service matches this search.";

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <ArrowsMergeIcon size={22} weight="fill" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className={PAGE_TITLE}>Co-Loading Concept</h1>
            <p className={`${PAGE_SUBTITLE} mt-0.5`}>The consolidation hub for customer service in operations. Pick the service to work in.</p>
          </div>
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-3 ${CARD} px-4 py-3`}>
          {/* New Service is a manager's; without it the space stays, so the search stays in the middle. */}
          <div className="flex items-center gap-3 shrink-0 min-w-[124px] max-sm:min-w-0">
            {isManager && (
              <button type="button" onClick={() => setAdding(true)} className={BTN_PRIMARY}>
                <PlusOutlined />
                New Service
              </button>
            )}
          </div>
          <div className="flex flex-1 basis-[220px] justify-center min-w-[200px]">
            <Input
              placeholder="Search services..."
              aria-label="Search services"
              prefix={<SearchOutlined className="text-slate-400" />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              allowClear
              className="w-[320px] max-w-full"
            />
          </div>
          {/* Settings: the share of a box planned with. Everyone sees it; managers change it. */}
          <div className="flex shrink-0 justify-end min-w-[124px] max-sm:min-w-0">
            <button type="button" onClick={() => setSettingsOpen(true)} className={BTN}>
              <SettingOutlined />
              Settings
            </button>
          </div>
        </div>

        {empty ? (
          <p className={`${HINT} m-0`}>{empty}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => (
              <Link
                key={s.id}
                href={`/co-loading/${s.id}`}
                // A closed service (a manager's tile only) is greyed, marked Closed, when and by whom.
                className={`${CARD} group flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  s.closedAt ? "!bg-slate-50 border-dashed" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`text-[14px] font-semibold group-hover:text-indigo-700 ${s.closedAt ? "text-slate-500" : "text-slate-900"}`}>{s.name}</span>
                    {s.closedAt && <Pill tone="slate">Closed</Pill>}
                  </span>
                  <span className={`block ${HINT} mt-1`}>{tileLine(s)}</span>
                  {s.note && <span className={`block ${HINT} mt-0.5`}>{s.note}</span>}
                  {s.closedAt && <span className={`block ${HINT} mt-0.5`}>{closedLine(s, formatDate)} · hidden from users</span>}
                </span>
                <CaretRightIcon size={16} weight="bold" aria-hidden className="shrink-0 text-slate-400 group-hover:text-indigo-600" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <CoLoadingSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewServiceModal
        open={adding}
        onClose={() => setAdding(false)}
        saving={create.isPending}
        onCreate={async (input) => {
          const { service } = await create.mutateAsync(input);
          message.success(`Service "${service.name}" created`);
          return service;
        }}
      />
    </div>
  );
}
