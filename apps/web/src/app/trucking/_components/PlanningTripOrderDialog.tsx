"use client";

import { Modal, Spin } from "antd";
import { useTrip } from "@/hooks/useTruckingConsignments";
import { TripDialogs } from "../trips/_components/TripDialogs";
import { TruckingLoadError } from "./TruckingLoadError";

interface PlanningTripOrderDialogProps {
  tripId: string;
  mode: "print" | "send";
  onClose: () => void;
}

// The Print… / Record as sent… transport-order dialogs for a trip card: the trip is read first.
export const PlanningTripOrderDialog = ({ tripId, mode, onClose }: PlanningTripOrderDialogProps) => {
  const { trip, error, reload } = useTrip(tripId);
  if (!trip) {
    return (
      <Modal open footer={null} closable onCancel={onClose} width={360}>
        {error ? (
          <div className="pt-6">
            <TruckingLoadError what="the trip" error={error} onRetry={() => reload()} />
          </div>
        ) : (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        )}
      </Modal>
    );
  }
  return <TripDialogs trip={trip} dialog={mode} onClose={onClose} />;
};
