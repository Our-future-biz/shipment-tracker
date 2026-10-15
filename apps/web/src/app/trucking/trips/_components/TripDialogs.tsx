"use client";

import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useTrip, type TripDetail } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../../_lib/glossary";
import { TruckingTextModal } from "../../_components/TruckingTextModal";
import { TransportOrderModal } from "./TransportOrderModal";

export type TripDialog = "print" | "send" | "confirm" | "cancel" | null;

interface TripDialogsProps {
  trip: TripDetail;
  dialog: TripDialog;
  onClose: () => void;
}

// The dialogs of a trip — print or send its transport order, record the haulier's confirmation,
// cancel it — shared by the consignment page and the trip page.
export const TripDialogs = ({ trip, dialog, onClose }: TripDialogsProps) => {
  const toast = useToast();
  const { print, send, confirm, cancel } = useTrip(trip.id);
  const reportAndRethrow = (what: string) => (e: unknown) => {
    toast.error(`${what}: ${apiErrorMessage(e)}`);
    throw e;
  };

  if (dialog === "print" || dialog === "send") return <TransportOrderModal mode={dialog} trip={trip} onClose={onClose} onPrint={print} onSend={send} />;
  if (dialog === "confirm") {
    return (
      <TruckingTextModal
        title="Record confirmation"
        hint={`The haulier confirmed ${trip.transportOrder?.number ?? "the transport order"} by phone or e-mail (a confirmation through the link is recorded by itself). Who confirmed and how is logged.`}
        placeholder="Who confirmed, and how (required)"
        okText="Record confirmation"
        onClose={onClose}
        onSubmit={(note) =>
          confirm(note)
            .then(() => toast.success("Confirmation recorded"))
            .catch(reportAndRethrow("Could not record the confirmation"))
        }
      />
    );
  }
  if (dialog === "cancel") {
    return (
      <TruckingTextModal
        title={`Cancel trip ${trip.ref}`}
        hint={`The trip is cancelled and its consignment goes back to Booked, to be planned again. Tell ${trip.haulierName} yourself if the ${TERMS.transportOrder.toLowerCase()} went out. The reason is logged.`}
        placeholder="Reason (required)"
        okText="Cancel trip"
        danger
        onClose={onClose}
        onSubmit={(reason) =>
          cancel(reason)
            .then(() => toast.success(`${trip.ref} cancelled`))
            .catch(reportAndRethrow("Could not cancel the trip"))
        }
      />
    );
  }
  return null;
};
