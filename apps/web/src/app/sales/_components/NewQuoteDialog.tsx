"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useToast } from "@/lib/toast";
import { quoteHref, type QuoteOrigin } from "../_lib/quoteHref";
import type { SalesQuoteData } from "../_lib/types";

interface NewQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  // What the quote starts with - the customer it is made for - asked for once the creation is
  // confirmed. Without it the quote starts empty.
  start?: () => Promise<SalesQuoteData>;
  // The screen the quote is created on, when the new quote's page should lead back there.
  origin?: QuoteOrigin;
}

// The confirmation behind every "New Quote": the quote is created only on confirm, so an
// accidental click never burns a reference. The server assigns the reference while it creates
// the quote, so there is no number to show beforehand - the quote page that opens shows it.
export function NewQuoteDialog({ open, onClose, start, origin }: NewQuoteDialogProps) {
  const router = useRouter();
  const { createQuote } = useSalesQuotes();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const confirm = async () => {
    setCreating(true);
    try {
      // The server makes the quote a Draft owned by whoever creates it, whatever it starts with.
      const ref = await createQuote(start ? await start() : {});
      onClose();
      router.push(quoteHref(ref, origin));
    } catch {
      toast.error("Failed to create quote");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ConfirmModal
      open={open}
      // Once confirmed the quote is being created and its page will open: there is nothing left
      // to cancel, so the dialog waits for the server's answer.
      onClose={() => {
        if (!creating) onClose();
      }}
      onConfirm={confirm}
      title="Create new quote"
      description="A unique reference will be assigned when you confirm."
      confirmLabel="Create quote"
      loading={creating}
    />
  );
}
