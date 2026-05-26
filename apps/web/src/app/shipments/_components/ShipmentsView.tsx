"use client";

import { useState } from "react";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useToast } from "@/lib/toast";
import { ShipmentsTable } from "./ShipmentsTable";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { ConfirmModal } from "@/components/ConfirmModal";

export const ShipmentsView = () => {
  const { shipments, isLoading, createShipment, deleteShipment, isCreating, isDeleting } = useShipments();
  const toast = useToast();
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
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
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
    </div>
  );
};
