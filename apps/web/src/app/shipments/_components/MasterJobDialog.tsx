"use client";

import { useState, useMemo, useEffect } from "react";
import { Modal, Button, Input, Checkbox, Radio, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useMasterJobs } from "@/hooks/useMasterJobs";
import { nextMczNumber } from "@/lib/mcz";
import { Badge } from "@/components/Badge";
import { useAuth } from "@/lib/auth/AuthContext";
import { canChangeShipmentDetails } from "@/lib/shipmentEditRule";
import { HINT, REF } from "@/styles/ui";

/** What a shipment the user may not link says (the server refuses it: lib/shipmentEditRule). */
export const LINK_REFUSED_HINT = "Only its Person in Charge, Holiday Cover or a manager can link it to a master job";

/**
 * Links each shipment by a request of its own, so one the server refuses does not stop the others.
 * Says how many were linked and how many not, with the first refusal.
 */
export async function linkEach(ids: string[], link: (id: string) => Promise<unknown>): Promise<{ linked: number; failed: number; error: unknown }> {
  const results = await Promise.allSettled(ids.map((id) => link(id)));
  const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  return { linked: results.length - refused.length, failed: refused.length, error: refused[0]?.reason };
}

/** "1 shipment", "3 shipments". */
export const linkedCount = (n: number) => `${n} shipment${n === 1 ? "" : "s"}`;

interface MasterJobDialogProps {
  open: boolean;
  onClose: () => void;
  /** The shipments to pick from; without them the dialog loads the newest itself while open. */
  shipments?: ShipmentItem[];
  onLink: (shipmentIds: string[], mczNumber: string) => void | Promise<void>;
  initialSelectedIds?: string[];
}

export const MasterJobDialog = ({ open, onClose, shipments: given, onLink, initialSelectedIds }: MasterJobDialogProps) => {
  // A page with no list of its own (a shipment's page) has the newest loaded here, only while open.
  const own = useShipments({ enabled: open && !given });
  const shipments = given ?? own.shipments;
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds ?? []));

  useEffect(() => {
    if (open) setSelected(new Set(initialSelectedIds ?? []));
  }, [open, initialSelectedIds]);
  const [search, setSearch] = useState("");
  const [selectedExistingMCZ, setSelectedExistingMCZ] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  // A shipment whose details the user may not change cannot be linked by them either: shown, not picked.
  const { user } = useAuth();
  const lockedIds = useMemo(() => new Set(shipments.filter((s) => !canChangeShipmentDetails(user, s)).map((s) => s.id)), [shipments, user]);
  const chosen = Array.from(selected).filter((id) => !lockedIds.has(id));

  // Every master job on the server counts: one created on the Master Jobs page has
  // no shipments yet, so the loaded shipments alone would hand out its number again.
  const { masterJobs } = useMasterJobs();
  const masterJobMczs = useMemo(() => masterJobs.map((m) => m.mczNumber), [masterJobs]);

  const nextMCZ = useMemo(() => nextMczNumber(shipments, masterJobMczs), [shipments, masterJobMczs]);

  const activeMCZ = mode === "existing" && selectedExistingMCZ ? selectedExistingMCZ : nextMCZ;

  // Existing MCZ numbers with their shipment counts
  const existingMCZs = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of shipments) {
      const mn = s.masterJobMczNumber;
      if (mn && mn.startsWith("MCZ")) map.set(mn, (map.get(mn) || 0) + 1);
    }
    // The server knows the full count, including shipments older than the loaded ones.
    for (const m of masterJobs) map.set(m.mczNumber, m.shipmentCount);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shipments, masterJobs]);

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    const list = shipments.filter((s) => s.jobNumber && !s.jobNumber.startsWith("CZQ"));
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((s) =>
      s.jobNumber.toLowerCase().includes(q) ||
      s.shipper.toLowerCase().includes(q) ||
      s.consignee.toLowerCase().includes(q)
    );
  }, [shipments, search]);

  const toggleShipment = (id: string) => {
    if (lockedIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (chosen.length === 0 || isLinking) return;
    setIsLinking(true);
    try {
      await onLink(chosen, activeMCZ);
    } finally {
      setIsLinking(false);
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    setMode("new");
    setSelectedExistingMCZ("");
    onClose();
  };

  return (
    <Modal
      title="Master Job"
      open={open}
      onCancel={handleClose}
      width={540}
      destroyOnHidden
      footer={
        <div className="flex justify-between items-center">
          <span className={HINT}>{chosen.length} shipment{chosen.length !== 1 ? "s" : ""} selected</span>
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              type="primary"
              disabled={chosen.length === 0 || isLinking || (mode === "existing" && !selectedExistingMCZ)}
              loading={isLinking}
              onClick={handleConfirm}
            >
              {mode === "new" ? `Create ${activeMCZ}` : `Link to ${activeMCZ}`}
            </Button>
          </Space>
        </div>
      }
    >
      {/* Mode toggle (only if existing MCZs exist) */}
      {existingMCZs.length > 0 && (
        <div className="mb-4">
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
            <Radio.Button value="new">Create New ({nextMCZ})</Radio.Button>
            <Radio.Button value="existing">Link to Existing</Radio.Button>
          </Radio.Group>

          {mode === "existing" && (
            <div className="mt-2 max-h-[100px] overflow-y-auto">
              <Radio.Group
                value={selectedExistingMCZ}
                onChange={(e) => setSelectedExistingMCZ(e.target.value)}
                className="flex flex-col gap-1"
              >
                {existingMCZs.map(([mcz, count]) => (
                  <Radio key={mcz} value={mcz}>
                    <span className={`${REF} font-medium text-slate-900`}>{mcz}</span>
                    <span className={`${HINT} ml-2`}>({count} shipment{count !== 1 ? "s" : ""})</span>
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
        </div>
      )}

      {/* No existing — just show the new MCZ info */}
      {existingMCZs.length === 0 && (
        <p className={`${HINT} mb-3`}>
          New Master Job: <strong className={`${REF} text-slate-900`}>{nextMCZ}</strong>
        </p>
      )}

      {/* Search */}
      <Input
        prefix={<SearchOutlined />}
        placeholder="Search shipments..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        allowClear
        className="mb-2"
      />

      {/* Shipment selection list */}
      <div className="max-h-[320px] overflow-y-auto border border-slate-200 rounded-lg">
        {filteredShipments.map((s) => {
          const locked = lockedIds.has(s.id);
          const isChecked = !locked && selected.has(s.id);
          return (
            <div
              key={s.id}
              onClick={() => toggleShipment(s.id)}
              title={locked ? LINK_REFUSED_HINT : undefined}
              className={`flex items-center gap-2.5 px-3 py-[7px] border-b border-slate-100 ${
                locked ? "cursor-not-allowed opacity-50" : isChecked ? "cursor-pointer bg-indigo-50" : "cursor-pointer hover:bg-slate-50"
              }`}
            >
              <Checkbox checked={isChecked} disabled={locked} />
              <span className={`${REF} text-[13px] font-medium text-slate-900 w-[100px] shrink-0`}>
                {s.jobNumber}
              </span>
              <span className="text-[13px] text-slate-700 flex-1 truncate">
                {s.shipper || s.consignee || "—"}
              </span>
              {s.masterJobMczNumber && (
                <Badge tone="a" className={REF}>{s.masterJobMczNumber}</Badge>
              )}
            </div>
          );
        })}
        {filteredShipments.length === 0 && (
          <p className={`${HINT} text-center p-6`}>No shipments found</p>
        )}
      </div>
    </Modal>
  );
};
