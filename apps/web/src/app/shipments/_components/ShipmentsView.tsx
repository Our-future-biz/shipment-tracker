"use client";

import { useState } from "react";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useToast } from "@/lib/toast";
import { ShipmentsTable } from "./ShipmentsTable";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { MasterJobDialog } from "./MasterJobDialog";
import { ConfirmModal } from "@/components/ConfirmModal";

export const ShipmentsView = () => {
  const { shipments, isLoading, createShipment, deleteShipment, linkMasterJob, isCreating, isDeleting } = useShipments();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [masterJobOpen, setMasterJobOpen] = useState(false);
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

  const handleLinkMasterJob = async (shipmentIds: string[], mczNumber: string) => {
    try {
      await Promise.all(shipmentIds.map((id) => linkMasterJob({ shipmentId: id, mczNumber })));
      toast.success(`Linked ${shipmentIds.length} shipment${shipmentIds.length === 1 ? "" : "s"} to ${mczNumber}`);
      setMasterJobOpen(false);
    } catch {
      toast.error("Failed to link to master job");
    }
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
      <ShipmentsTable
        shipments={shipments}
        isLoading={isLoading}
        onCreateClick={() => setCreateOpen(true)}
        onDelete={(shipment) => setDeleteTarget(shipment)}
        onAddMasterJob={() => setMasterJobOpen(true)}
      />

      <MasterJobDialog
        open={masterJobOpen}
        onClose={() => setMasterJobOpen(false)}
        shipments={shipments}
        onLink={handleLinkMasterJob}
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
