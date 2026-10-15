"use client";

import { Modal, Spin } from "antd";
import { useTrip } from "@/hooks/useTruckingConsignments";
import { TripDialogs } from "../trips/_components/TripDialogs";

interface PlanningTripOrderDialogProps {
  tripId: string;
  mode: "print" | "send";
  onClose: () => void;
}

// The Phase 4 Print… / Send… transport-order dialogs for a trip card: the trip is read first.
export const PlanningTripOrderDialog = ({ tripId, mode, onClose }: PlanningTripOrderDialogProps) => {
  const { trip } = useTrip(tripId);
  if (!trip) {
    return (
      <Modal open footer={null} closable onCancel={onClose} width={360}>
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      </Modal>
    );
  }
  return <TripDialogs trip={trip} dialog={mode} onClose={onClose} />;
};
