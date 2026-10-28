"use client";

import { useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { SectionCard } from "@/components/SectionCard";
import { useCollectionHubs, useCollectionTariffActions, type CollectionFreightMode, type CollectionHub } from "@/hooks/useCollectionTariffs";
import { apiErrorMessage } from "@/lib/api";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { COLLECTION_FREIGHT_MODES, postcodeText } from "../../_lib/collectionTariffs";
import { muted } from "../../_components/TariffText";

// What keeps a hub from being saved, in words; null when it can be.
function hubProblem(hub: CollectionHub): string | null {
  if (!/^\d{5}$/.test(hub.postcode.replace(/\s/g, ""))) return "The postcode is 5 digits, e.g. 252 61";
  if (!/^[A-Za-z]{2}$/.test(hub.country.trim())) return "The country is a 2-letter code, e.g. CZ";
  return null;
}

// Our end of collections and deliveries: per freight mode, the postcode a haulier collects to and
// delivers from (our CFS for Sea LCL, the airport's cargo terminal for Air). A manager sets them.
export const CollectionHubsCard = () => {
  const toast = useToast();
  const canManage = useCanManageTariffs();
  const { hubs, isLoading, error } = useCollectionHubs();
  const { setHub, isSettingHub } = useCollectionTariffActions();
  const [editing, setEditing] = useState<CollectionHub | null>(null);
  const problem = editing && hubProblem(editing);

  const handleSave = async () => {
    if (!editing || problem) return;
    try {
      await setHub({ ...editing, postcode: editing.postcode.replace(/\s/g, ""), country: editing.country.trim().toUpperCase(), label: editing.label.trim() });
      setEditing(null);
      toast.success("Hub saved");
    } catch (e) {
      toast.error(`Could not save the hub: ${apiErrorMessage(e)}`);
    }
  };

  const hubOf = (mode: CollectionFreightMode) => hubs.find((h) => h.freightMode === mode);

  return (
    <SectionCard title="Our hubs" dense>
      <p className="mt-0 mb-3 text-[12.5px] text-slate-500">Collections and deliveries are priced between the hub of the freight and the customer&apos;s postcode.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COLLECTION_FREIGHT_MODES.map(({ value, label }) => {
          const hub = hubOf(value);
          return (
            <div key={value} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
                <div className="text-[13px] text-slate-800">
                  {hub ? (
                    <>
                      {hub.label || muted("No name")} · {postcodeText(hub.postcode)} {hub.country}
                    </>
                  ) : isLoading ? (
                    muted("Loading…")
                  ) : error ? (
                    <span className="text-red-600">Could not load the hubs: {apiErrorMessage(error)}</span>
                  ) : (
                    muted("Not set: quotes cannot be priced until it is")
                  )}
                </div>
              </div>
              {canManage && !isLoading && (
                <Tooltip title={`Set the ${label} hub`}>
                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`Set the ${label} hub`}
                    onClick={() => setEditing(hub ?? { freightMode: value, postcode: "", country: "CZ", label: "" })}
                  />
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
      <AppModal
        open={editing !== null}
        onClose={() => !isSettingHub && setEditing(null)}
        title={`${COLLECTION_FREIGHT_MODES.find((m) => m.value === editing?.freightMode)?.label ?? ""} hub`}
        size="small"
        footer={
          <div className="flex items-center justify-end gap-2">
            {problem && <span className="mr-auto text-[12.5px] text-slate-500">{problem}</span>}
            <Button disabled={isSettingHub} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="primary" loading={isSettingHub} disabled={!!problem} onClick={handleSave}>
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600">
              Name
              <Input aria-label="Hub name" placeholder="CFS Jeneč" value={editing.label} maxLength={100} disabled={isSettingHub} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </label>
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600">
                Postcode
                <Input aria-label="Hub postcode" placeholder="252 61" value={editing.postcode} maxLength={6} disabled={isSettingHub} onChange={(e) => setEditing({ ...editing, postcode: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600">
                Country
                <Input aria-label="Hub country" value={editing.country} maxLength={2} disabled={isSettingHub} onChange={(e) => setEditing({ ...editing, country: e.target.value.toUpperCase() })} />
              </label>
            </div>
          </div>
        )}
      </AppModal>
    </SectionCard>
  );
};
