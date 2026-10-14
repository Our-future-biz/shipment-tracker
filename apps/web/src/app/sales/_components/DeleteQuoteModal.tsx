"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import { quoteProblem } from "../_lib/quoteProblem";

interface DeleteQuoteModalProps {
  quoteNumber: string;
  onDelete: (quoteNumber: string) => Promise<unknown>;
  onClose: () => void;
}

// The confirmation one quote is deleted behind, and what follows it. `onDelete` asks the server
// and rejects when it refuses. That happens although Delete was offered: the button goes by what
// the quote was when the screen read it, the server by the quote as it is now - a shipment linked
// meanwhile, another owner - and its sentence is what the user is told.
export function DeleteQuoteModal({
  quoteNumber,
  onDelete,
  onClose,
}: DeleteQuoteModalProps) {
  const toast = useToast();
  // The request is on its way: the dialog waits for the server's answer.
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await onDelete(quoteNumber);
      toast.success(`${quoteNumber} deleted`);
    } catch (err) {
      toast.error(`${quoteNumber} - ${quoteProblem(err).reason}`);
    }
    onClose();
  };

  return (
    <ConfirmModal
      open
      onClose={() => {
        if (!deleting) onClose();
      }}
      onConfirm={confirm}
      title="Delete quote"
      description={`Delete quote ${quoteNumber}? It disappears from Sales for everyone and its reference is never used again.`}
      confirmLabel="Delete"
      danger
      loading={deleting}
    />
  );
}
