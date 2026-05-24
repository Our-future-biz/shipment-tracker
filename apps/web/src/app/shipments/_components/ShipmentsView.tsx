"use client";

import { useState, useCallback } from "react";
import { Input, Select, Button, Space, message } from "antd";
import { PlusOutlined, SearchOutlined, LinkOutlined } from "@ant-design/icons";
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
import type { controllers } from "@/lib/api/client";

export const ShipmentsView = () => {
  const queryClient = useQueryClient();
  const { shipments, isLoading, createShipment, updateField, deleteShipment, isCreating } = useShipments();
  const { filtered, search, setSearch, statusFilter, setStatusFilter } = useShipmentFilter(shipments);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentItem | null>(null);
  const [masterJobDialogOpen, setMasterJobDialogOpen] = useState(false);
  const [masterJobDetailMcz, setMasterJobDetailMcz] = useState<string | null>(null);
  const [dimensionsShipment, setDimensionsShipment] = useState<ShipmentItem | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

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
      <div className="flex-none flex items-center justify-between">
        <Space>
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
        </Space>
        <Space>
          <Button size="small" icon={<LinkOutlined />} onClick={() => setMasterJobDialogOpen(true)}>
            Master Job
          </Button>
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setCreateModalOpen(true)}>
            New Shipment
          </Button>
        </Space>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" }}>
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
        />
      </div>

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
          onSave={(json) => {
            updateField(dimensionsShipment.id, "dimensions", json);
            setDimensionsShipment(null);
          }}
        />
      )}
    </div>
  );
};
