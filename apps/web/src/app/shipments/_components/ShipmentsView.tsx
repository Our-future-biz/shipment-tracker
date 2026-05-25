"use client";

import { useState, useCallback } from "react";
import { Input, Select, Button, Space, message, Popconfirm, Segmented } from "antd";
import { PlusOutlined, SearchOutlined, LinkOutlined, DeleteOutlined, CloseOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useShipments, useShipmentFilter, type ShipmentItem } from "@/hooks/useShipments";
import { DROPDOWN_OPTIONS } from "@/lib/columnConfig";
import { api } from "@/lib/api";
import { ShipmentsTable } from "./ShipmentsTable";
import { ShipmentDetailModal } from "./ShipmentDetailModal";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { MasterJobDialog } from "./MasterJobDialog";
import { MasterJobDetailModal } from "./MasterJobDetailModal";
import { DimensionsPopup } from "./DimensionsPopup";
import { ChatPanel } from "./ChatPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { Dashboard } from "./Dashboard";
import type { controllers } from "@/lib/api/client";

export const ShipmentsView = () => {
  const queryClient = useQueryClient();
  const { shipments, isLoading, createShipment, updateField, deleteShipment, isCreating } = useShipments();
  const { filtered, search, setSearch, statusFilter, setStatusFilter } = useShipmentFilter(shipments);
  const [view, setView] = useState<"shipments" | "dashboard">("shipments");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentItem | null>(null);
  const [masterJobDialogOpen, setMasterJobDialogOpen] = useState(false);
  const [masterJobDetailMcz, setMasterJobDetailMcz] = useState<string | null>(null);
  const [dimensionsShipment, setDimensionsShipment] = useState<ShipmentItem | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  // Delete mode
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteJobInput, setDeleteJobInput] = useState("");

  // Chat/Attachments panels
  const [chatShipment, setChatShipment] = useState<ShipmentItem | null>(null);
  const [attachShipment, setAttachShipment] = useState<ShipmentItem | null>(null);

  const handleCreate = async (values: controllers.ShipmentCreateRequest) => {
    try {
      await createShipment(values);
      setCreateModalOpen(false);
      messageApi.success("Shipment created");
    } catch {
      messageApi.error("Failed to create");
    }
  };

  const handleDelete = async (shipmentId: string) => {
    try {
      await deleteShipment(shipmentId);
      messageApi.success("Deleted");
    } catch {
      messageApi.error("Failed to delete");
    }
  };

  const handleDeleteByJobNumber = async () => {
    const jn = deleteJobInput.trim();
    if (!jn) return;
    const found = shipments.find((s) => s.jobNumber === jn);
    if (!found) { messageApi.error(`No shipment found: "${jn}"`); return; }
    try {
      await deleteShipment(found.id);
      messageApi.success(`Deleted ${jn}`);
      setDeleteJobInput("");
      setDeleteMode(false);
    } catch {
      messageApi.error("Failed to delete");
    }
  };

  const handleCellEdit = useCallback((shipmentId: string, field: string, value: string) => {
    updateField(shipmentId, field, value);
  }, [updateField]);

  const statusOptions = [
    { value: "all", label: "All Statuses" },
    ...(DROPDOWN_OPTIONS["Shipment Status"] ?? [])
      .filter((s) => s !== "---")
      .map((s) => ({ value: s, label: s })),
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 16, gap: 12 }}>
      {contextHolder}

      {/* Toolbar */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space>
          <Segmented
            size="small"
            value={view}
            onChange={(v) => setView(v as "shipments" | "dashboard")}
            options={[
              { value: "shipments", label: "Shipments" },
              { value: "dashboard", label: "Dashboard" },
            ]}
          />
          <Input
            placeholder="Search all columns..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
            allowClear
            size="small"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 300 }}
            size="small"
            options={statusOptions}
          />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{filtered.length} / {shipments.length} rows</span>
        </Space>
        <Space>
          {/* Delete mode */}
          {!deleteMode ? (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteMode(true)}>
              Delete
            </Button>
          ) : (
            <Space size={4}>
              <Input
                size="small"
                placeholder="Job Number..."
                value={deleteJobInput}
                onChange={(e) => setDeleteJobInput(e.target.value)}
                onPressEnter={handleDeleteByJobNumber}
                style={{ width: 130 }}
                autoFocus
              />
              <Popconfirm title={`Delete ${deleteJobInput}?`} onConfirm={handleDeleteByJobNumber} disabled={!deleteJobInput.trim()}>
                <Button size="small" danger disabled={!deleteJobInput.trim()}>Confirm</Button>
              </Popconfirm>
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => { setDeleteMode(false); setDeleteJobInput(""); }} />
            </Space>
          )}
          <Button size="small" icon={<LinkOutlined />} onClick={() => setMasterJobDialogOpen(true)}>
            Master Job
          </Button>
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setCreateModalOpen(true)}>
            New Shipment
          </Button>
        </Space>
      </div>

      {/* Content area */}
      {view === "dashboard" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <Dashboard onShipmentClick={(id) => {
            const s = shipments.find((s) => s.id === id);
            if (s) setSelectedShipment(s);
          }} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          {/* Main table */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <ShipmentsTable
              shipments={filtered}
              isLoading={isLoading}
              onCellEdit={handleCellEdit}
              onRowClick={(shipment) => setSelectedShipment(shipment)}
              onDelete={handleDelete}
              onMasterJobClick={(mcz) => { if (mcz) setMasterJobDetailMcz(mcz); else setMasterJobDialogOpen(true); }}
              onRemoveMasterJob={async (shipment) => {
                try {
                  await api.shipments.shipmentUnlinkMasterJob(shipment.id);
                  queryClient.invalidateQueries({ queryKey: ["shipments"] });
                  messageApi.success("Unlinked from master job");
                } catch { messageApi.error("Failed to unlink"); }
              }}
              onOpenDimensions={(shipment) => setDimensionsShipment(shipment)}
              onOpenChat={(shipment) => { setChatShipment(shipment); setAttachShipment(null); }}
              onOpenAttachments={(shipment) => { setAttachShipment(shipment); setChatShipment(null); }}
            />
          </div>

          {/* Chat panel */}
          {chatShipment && (
            <ChatPanel
              shipmentId={chatShipment.id}
              jobNumber={chatShipment.jobNumber}
              onClose={() => setChatShipment(null)}
            />
          )}

          {/* Attachments panel */}
          {attachShipment && (
            <AttachmentsPanel
              shipmentId={attachShipment.id}
              jobNumber={attachShipment.jobNumber}
              context={`${attachShipment.shipper || ""} → ${attachShipment.consignee || ""}`}
              onClose={() => setAttachShipment(null)}
            />
          )}
        </div>
      )}

      {/* Create Wizard */}
      <CreateShipmentWizard
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreate}
        isLoading={isCreating}
        existingShipments={shipments}
      />

      {/* Detail Modal */}
      {selectedShipment && (
        <ShipmentDetailModal
          shipment={selectedShipment}
          open={!!selectedShipment}
          onClose={() => setSelectedShipment(null)}
        />
      )}

      {/* Master Job Dialog */}
      <MasterJobDialog
        open={masterJobDialogOpen}
        onClose={() => setMasterJobDialogOpen(false)}
        shipments={shipments}
        onLink={async (shipmentIds, mczNumber) => {
          try {
            for (const id of shipmentIds) {
              await api.shipments.shipmentLinkMasterJob(id, { mczNumber });
            }
            queryClient.invalidateQueries({ queryKey: ["shipments"] });
            messageApi.success(`Linked ${shipmentIds.length} shipment(s) to ${mczNumber}`);
          } catch { messageApi.error("Failed to link"); }
          setMasterJobDialogOpen(false);
        }}
      />

      {/* Master Job Detail */}
      {masterJobDetailMcz && (
        <MasterJobDetailModal
          mczNumber={masterJobDetailMcz}
          open={!!masterJobDetailMcz}
          onClose={() => setMasterJobDetailMcz(null)}
          shipments={shipments}
          onUnlink={async (shipment) => {
            try {
              await api.shipments.shipmentUnlinkMasterJob(shipment.id);
              queryClient.invalidateQueries({ queryKey: ["shipments"] });
              messageApi.success("Unlinked");
            } catch { messageApi.error("Failed to unlink"); }
          }}
        />
      )}

      {/* Dimensions Popup */}
      {dimensionsShipment && (
        <DimensionsPopup
          shipment={dimensionsShipment}
          open={!!dimensionsShipment}
          onClose={() => setDimensionsShipment(null)}
          onSave={(dimensions) => {
            api.shipments.shipmentUpdate(dimensionsShipment.id, { dimensions }).then(() => {
              queryClient.invalidateQueries({ queryKey: ["shipments"] });
            });
            setDimensionsShipment(null);
          }}
        />
      )}
    </div>
  );
};
