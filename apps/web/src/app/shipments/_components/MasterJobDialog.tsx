"use client";

import { useState, useMemo, useEffect } from "react";
import { Modal, Button, Input, Checkbox, Tag, Radio, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useMasterJobs } from "@/hooks/useMasterJobs";
import { nextMczNumber } from "@/lib/mcz";

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
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || isLinking) return;
    setIsLinking(true);
    try {
      await onLink(Array.from(selected), activeMCZ);
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
          <span className="text-xs text-slate-500">{selected.size} shipment{selected.size !== 1 ? "s" : ""} selected</span>
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              type="primary"
              disabled={selected.size === 0 || isLinking || (mode === "existing" && !selectedExistingMCZ)}
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
                    <span className="font-mono text-amber-500 font-medium">{mcz}</span>
                    <span className="text-[11px] text-slate-400 ml-2">({count} shipment{count !== 1 ? "s" : ""})</span>
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
        </div>
      )}

      {/* No existing — just show the new MCZ info */}
      {existingMCZs.length === 0 && (
        <p className="text-xs text-slate-500 mb-3">
          New Master Job: <strong className="font-mono text-amber-500">{nextMCZ}</strong>
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
      <div className="max-h-[320px] overflow-y-auto border border-neutral-100 rounded-md">
        {filteredShipments.map((s) => {
          const isChecked = selected.has(s.id);
          return (
            <div
              key={s.id}
              onClick={() => toggleShipment(s.id)}
              className={`flex items-center gap-2.5 px-3 py-[7px] cursor-pointer border-b border-neutral-50 ${isChecked ? "bg-amber-500/[0.04]" : ""}`}
            >
              <Checkbox checked={isChecked} />
              <span className="font-mono text-teal-600 font-medium text-xs w-[100px] shrink-0">
                {s.jobNumber}
              </span>
              <span className="text-xs text-gray-500 flex-1 truncate">
                {s.shipper || s.consignee || "—"}
              </span>
              {s.masterJobMczNumber && (
                <Tag color="gold" className="!text-[10px] !m-0">{s.masterJobMczNumber}</Tag>
              )}
            </div>
          );
        })}
        {filteredShipments.length === 0 && (
          <p className="text-center text-slate-400 text-xs p-6">No shipments found</p>
        )}
      </div>
    </Modal>
  );
};
