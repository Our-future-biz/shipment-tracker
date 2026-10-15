"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebounced } from "@/hooks/useDebounced";
import { useShipments } from "@/hooks/useShipments";
import { useToast } from "@/lib/toast";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { ShipmentsTable } from "./ShipmentsTable";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { MasterJobDialog } from "./MasterJobDialog";

// Search/status live in the URL (?q= / ?status=), written by the table's toolbar and read
// here to drive the server-side query — so filtering covers the whole company dataset
// instead of only the rows already in the browser.
export const ShipmentsView = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = useDebounced(searchParams.get("q") ?? "", 300);
  const statusBucket = searchParams.get("status") ?? "all";
  const tile = searchParams.get("tile") ?? "all";
  // "Create shipment" on a quote's page leads here with ?fromQuote=QCZ...
  const fromQuote = searchParams.get("fromQuote");

  const { shipments, isLoading, createShipment, linkMasterJob, isCreating } =
    useShipments({ search, statusBucket, tile });
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [masterJobOpen, setMasterJobOpen] = useState(false);
  // Shipments ticked in the table when "Add to Master Job" was pressed.
  const [masterJobPreselected, setMasterJobPreselected] = useState<string[]>([]);
  // An address that names a quote opens New Shipment for that quote, until the wizard is closed
  // (the address is left then, but that navigation takes a moment).
  const [dismissedQuote, setDismissedQuote] = useState<string | null>(null);
  const wizardOpen = createOpen || (!!fromQuote && dismissedQuote !== fromQuote);

  // An address that names a quote is left once the wizard is closed: coming back to it, or
  // reloading it, must not open the wizard again. That is done by the one navigation there is:
  // Next drops a navigation that is still under way when the next one starts, so a clean-up of
  // the address followed by a push would leave it as it was.
  const closeCreate = (openShipmentId?: string) => {
    setCreateOpen(false);
    setDismissedQuote(fromQuote);
    if (openShipmentId) {
      const href = `/shipments/${openShipmentId}`;
      // In place of the entry that names the quote: Back from the shipment leads to where the
      // wizard was asked for, not into it again.
      if (fromQuote) router.replace(href);
      else router.push(href);
      return;
    }
    // Opened for a quote and closed without opening a shipment: back to that quote, in place of
    // the entry that asked for the wizard. Whoever came from a quote was not going to the list.
    if (fromQuote) router.replace(quoteHref(fromQuote));
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
        onAddMasterJob={(ids) => {
          setMasterJobPreselected(ids);
          setMasterJobOpen(true);
        }}
      />

      <MasterJobDialog
        open={masterJobOpen}
        onClose={() => setMasterJobOpen(false)}
        shipments={shipments}
        initialSelectedIds={masterJobPreselected}
        onLink={handleLinkMasterJob}
      />

      <CreateShipmentWizard
        open={wizardOpen}
        onClose={closeCreate}
        createShipment={createShipment}
        isCreating={isCreating}
        existingShipments={shipments}
        fromQuote={fromQuote}
      />
      </div>
    </div>
  );
};
