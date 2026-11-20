"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { AppModal } from "@/components/AppModal";
import { invalidateQuoteLists } from "@/hooks/useSalesQuotes";
import { useToast } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { quoteHref, type QuoteOrigin } from "../_lib/quoteHref";
import { SERVICE_TYPES, serviceTypeLabel, type SalesQuoteData } from "../_lib/types";
import { api, apiErrorMessage } from "@/lib/api";

interface NewQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  // What the quote starts with - the customer it is made for - asked for once the creation is
  // confirmed. Without it the quote starts empty.
  start?: () => Promise<SalesQuoteData>;
  // The screen the quote is created on, when the new quote's page should lead back there.
  origin?: QuoteOrigin;
}

/**
 * What a new quote is created with: what it starts with, and the Freight Mode picked in the dialog.
 * The mode is asked before the quote exists because the reference carries its letters (QCZFCL…,
 * QCZAIR…): given with the create, the reference is right from the start instead of changing while
 * the quote is filled (User Council S17, owner's answer Q33).
 */
export function newQuoteData(start: SalesQuoteData, serviceType: string): SalesQuoteData {
  return { ...start, serviceType };
}

// The confirmation behind every "New Quote": the quote is created only on confirm, so an
// accidental click never burns a reference. The server assigns the reference while it creates
// the quote, so there is no number to show beforehand - the quote page that opens shows it.
export function NewQuoteDialog({ open, onClose, start, origin }: NewQuoteDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [serviceType, setServiceType] = useState<string | undefined>(undefined);

  const close = () => {
    setServiceType(undefined);
    onClose();
  };

  const confirm = async () => {
    if (!serviceType) return;
    setCreating(true);
    try {
      // The server makes the quote a Draft owned by whoever creates it, whatever it starts with.
      const { quote } = await api.quotes.salesQuoteCreate({ data: newQuoteData(start ? await start() : {}, serviceType) });
      // The new quote opens at once (User Council S22): the lists that show it refresh behind,
      // not first - waiting for them left the user looking at the list with the new number in it.
      void invalidateQuoteLists(queryClient);
      close();
      router.push(quoteHref(quote.quoteNumber, origin));
    } catch (err) {
      toast.error(`Failed to create quote - ${apiErrorMessage(err)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppModal
      open={open}
      // Once confirmed the quote is being created and its page will open: there is nothing left
      // to cancel, so the dialog waits for the server's answer.
      onClose={close}
      closable={!creating}
      title="Create new quote"
      subtitle="A unique reference will be assigned when you confirm."
      size="small"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={close} disabled={creating}>
            Cancel
          </Button>
          <Button type="primary" onClick={confirm} loading={creating} disabled={!serviceType}>
            Create quote
          </Button>
        </div>
      }
    >
      <label htmlFor="new-quote-freight-mode" className={`block ${LABEL_TEXT} mb-1`}>
        Freight mode
      </label>
      <Select
        id="new-quote-freight-mode"
        className="w-full"
        placeholder="Pick the freight mode"
        value={serviceType}
        onChange={setServiceType}
        disabled={creating}
        showSearch
        optionFilterProp="label"
        options={SERVICE_TYPES.map((mode) => ({ value: mode, label: serviceTypeLabel(mode) }))}
      />
      <div className={`${HINT} mt-2`}>The reference shows the freight mode (QCZFCL…, QCZAIR…), so it is asked first.</div>
    </AppModal>
  );
}
