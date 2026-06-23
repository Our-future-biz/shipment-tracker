"use client";

import { useState, useMemo, useEffect } from "react";
import { Modal, Button, Input, Checkbox, Tag, Radio, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { type ShipmentItem } from "@/hooks/useShipments";

interface MasterJobDialogProps {
  open: boolean;
  onClose: () => void;
  shipments: ShipmentItem[];
  onLink: (shipmentIds: string[], mczNumber: string) => void | Promise<void>;
  initialSelectedIds?: string[];
}

export const MasterJobDialog = ({ open, onClose, shipments, onLink, initialSelectedIds }: MasterJobDialogProps) => {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds ?? []));

  useEffect(() => {
    if (open) setSelected(new Set(initialSelectedIds ?? []));
  }, [open, initialSelectedIds]);
  const [search, setSearch] = useState("");
  const [selectedExistingMCZ, setSelectedExistingMCZ] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  // Generate next MCZ number
  const nextMCZ = useMemo(() => {
    let maxNum = 0;
    for (const s of shipments) {
      const mn = s.masterJobMczNumber;
      if (mn && mn.startsWith("MCZ")) {
        const num = parseInt(mn.substring(3), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    return `MCZ${String(maxNum + 1).padStart(8, "0")}`;
  }, [shipments]);

  const activeMCZ = mode === "existing" && selectedExistingMCZ ? selectedExistingMCZ : nextMCZ;

  // Existing MCZ numbers
  const existingMCZs = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of shipments) {
      const mn = s.masterJobMczNumber;
      if (mn && mn.startsWith("MCZ")) {
        map.set(mn, (map.get(mn) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shipments]);

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
      destroyOnClose
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{selected.size} shipment{selected.size !== 1 ? "s" : ""} selected</span>
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
        <div style={{ marginBottom: 16 }}>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
            <Radio.Button value="new">Create New ({nextMCZ})</Radio.Button>
            <Radio.Button value="existing">Link to Existing</Radio.Button>
          </Radio.Group>

          {mode === "existing" && (
            <div style={{ marginTop: 8, maxHeight: 100, overflowY: "auto" }}>
              <Radio.Group
                value={selectedExistingMCZ}
                onChange={(e) => setSelectedExistingMCZ(e.target.value)}
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                {existingMCZs.map(([mcz, count]) => (
                  <Radio key={mcz} value={mcz}>
                    <span style={{ fontFamily: "monospace", color: "#f59e0b", fontWeight: 500 }}>{mcz}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>({count} shipment{count !== 1 ? "s" : ""})</span>
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
        </div>
      )}

      {/* No existing — just show the new MCZ info */}
      {existingMCZs.length === 0 && (
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          New Master Job: <strong style={{ fontFamily: "monospace", color: "#f59e0b" }}>{nextMCZ}</strong>
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
        style={{ marginBottom: 8 }}
      />

      {/* Shipment selection list */}
      <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6 }}>
        {filteredShipments.map((s) => {
          const isChecked = selected.has(s.id);
          return (
            <div
              key={s.id}
              onClick={() => toggleShipment(s.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", cursor: "pointer",
                borderBottom: "1px solid #fafafa",
                background: isChecked ? "rgba(245, 158, 11, 0.04)" : undefined,
              }}
            >
              <Checkbox checked={isChecked} />
              <span style={{ fontFamily: "monospace", color: "#0d9488", fontWeight: 500, fontSize: 12, width: 100, flexShrink: 0 }}>
                {s.jobNumber}
              </span>
              <span style={{ fontSize: 12, color: "#6b7280", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.shipper || s.consignee || "—"}
              </span>
              {s.masterJobMczNumber && (
                <Tag color="gold" style={{ fontSize: 10, margin: 0 }}>{s.masterJobMczNumber}</Tag>
              )}
            </div>
          );
        })}
        {filteredShipments.length === 0 && (
          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: 24 }}>No shipments found</p>
        )}
      </div>
    </Modal>
  );
};
