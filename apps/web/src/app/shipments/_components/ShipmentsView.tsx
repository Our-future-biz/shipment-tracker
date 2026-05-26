"use client";

import { useState } from "react";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { toast } from "@/lib/toast";
import { ShipmentsTable } from "./ShipmentsTable";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { ConfirmModal } from "@/components/ConfirmModal";

export const ShipmentsView = () => {
  const { shipments, isLoading, createShipment, deleteShipment, isCreating, isDeleting } = useShipments();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShipmentItem | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShipment(deleteTarget.id);
      toast.success("Shipment deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete shipment");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <ShipmentsTable
        shipments={shipments}
        isLoading={isLoading}
        onCreateClick={() => setCreateOpen(true)}
        onDelete={(shipment) => setDeleteTarget(shipment)}
      />

      <CreateShipmentWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        createShipment={createShipment}
        isCreating={isCreating}
        existingShipments={shipments}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Shipment"
        description={`Are you sure you want to delete shipment ${deleteTarget?.jobNumber || ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={isDeleting}
      />
    </div>
  );
};
