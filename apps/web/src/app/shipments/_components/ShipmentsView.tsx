"use client";

import { useState, useCallback } from "react";
import { Input, Select, Button, Space, Modal, Form, message, Drawer } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useShipments, useShipmentFilter } from "@/hooks/useShipments";
import { SHIPMENT_STATUSES, TRADE_DIRECTIONS, LOAD_TYPES } from "@/lib/enums";
import { COLUMNS } from "@/lib/columnConfig";
import { ShipmentsTable } from "./ShipmentsTable";
import { ShipmentDetail } from "./ShipmentDetail";
import { CreateShipmentModal } from "./CreateShipmentModal";
import type { controllers, interfaces } from "@/lib/api/client";

type ShipmentItem = interfaces.ShipmentItem;

export const ShipmentsView = () => {
  const { shipments, isLoading, createShipment, updateShipment, deleteShipment, isCreating } = useShipments();
  const { filtered, search, setSearch, statusFilter, setStatusFilter } = useShipmentFilter(shipments);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentItem | null>(null);
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

  const handleCellEdit = useCallback(async (shipmentId: string, field: string, value: string) => {
    await updateShipment({ id: shipmentId, data: { [field]: value } as controllers.ShipmentUpdateRequest });
  }, [updateShipment]);

  return (
    <div className="h-full flex flex-col">
      {contextHolder}

      {/* Toolbar */}
      <div className="flex-none flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <Space>
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined className="text-gray-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
            allowClear
            size="small"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 260 }}
            size="small"
            options={[
              { value: "all", label: "All Statuses" },
              ...SHIPMENT_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setCreateModalOpen(true)}>
          New Shipment
        </Button>
      </div>

      {/* Table */}
      <ShipmentsTable
        shipments={filtered}
        isLoading={isLoading}
        columns={COLUMNS}
        onCellEdit={handleCellEdit}
        onRowClick={(shipment) => setSelectedShipment(shipment)}
        onDelete={handleDelete}
      />

      {/* Create Modal */}
      <CreateShipmentModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreate}
        isLoading={isCreating}
      />

      {/* Detail Drawer */}
      <Drawer
        title={selectedShipment ? `${selectedShipment.jobNumber} — ${selectedShipment.shipper}` : ""}
        open={!!selectedShipment}
        onClose={() => setSelectedShipment(null)}
        width={640}
        destroyOnClose
      >
        {selectedShipment && <ShipmentDetail shipment={selectedShipment} />}
      </Drawer>
    </div>
  );
};
