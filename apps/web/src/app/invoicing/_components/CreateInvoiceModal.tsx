"use client";

import { AppModal } from "@/components/AppModal";
import { ShipmentPicker } from "./ShipmentPicker";

interface CreateInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  /** Opens the chosen job in Invoicing. */
  onSelect: (shipmentId: string) => void;
}

/** "Create invoice": choose the job; its costs and invoices open next. */
export function CreateInvoiceModal({ open, onClose, onSelect }: CreateInvoiceModalProps) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Create invoice"
      subtitle="Choose the shipment to invoice. Its costs and invoices open next."
      size="medium"
      footer={null}
    >
      <ShipmentPicker
        value={null}
        autoFocus
        className="w-full"
        onChange={(id) => {
          if (!id) return;
          onClose();
          onSelect(id);
        }}
      />
    </AppModal>
  );
}
