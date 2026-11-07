"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebounced } from "@/hooks/useDebounced";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useToast } from "@/lib/toast";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { ShipmentsTable } from "./ShipmentsTable";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { MasterJobDialog, linkEach, linkedCount } from "./MasterJobDialog";
import { apiErrorMessage } from "@/lib/api";

// Search/status live in the URL (?q= / ?status=), written by the table's toolbar and read
// here to drive the server-side query — so filtering covers the whole company dataset
// instead of only the rows already in the browser.
export const ShipmentsView = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = useDebounced(searchParams.get("q") ?? "", 300);
  const statusBucket = searchParams.get("status") ?? "all";
  const tile = searchParams.get("tile") ?? "all";
  // "Create New Shipment" on a quote's page leads here with ?fromQuote=QCZ..., with &another=1 as
  // well once the quote has a shipment booked.
  const fromQuote = searchParams.get("fromQuote");
  const anotherFromQuote = !!fromQuote && searchParams.get("another") === "1";

  // The search looks only in the columns the table shows.
  const [searchColumns, setSearchColumns] = useState<string[]>();
  const { shipments, total, isLoading, isError, createShipment, linkMasterJob, isCreating } =
    useShipments({ search, searchColumns, statusBucket, tile });
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [masterJobOpen, setMasterJobOpen] = useState(false);
  // Shipments ticked in the table when "Add to Master Job" was pressed.
  const [masterJobPreselected, setMasterJobPreselected] = useState<string[]>([]);
  // The grid keeps its ticks through a search, so a ticked shipment may no longer be in the loaded
  // list: every one seen is remembered, and the dialog gets those ticked along with the list.
  const seenShipments = useRef(new Map<string, ShipmentItem>());
  useEffect(() => {
    for (const s of shipments) seenShipments.current.set(s.id, s);
  }, [shipments]);
  const [masterJobTickedAway, setMasterJobTickedAway] = useState<ShipmentItem[]>([]);
  const masterJobShipments = useMemo(
    () => (masterJobTickedAway.length ? [...shipments, ...masterJobTickedAway.filter((t) => !shipments.some((s) => s.id === t.id))] : shipments),
    [shipments, masterJobTickedAway],
  );
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

  // One request per shipment, each may be refused on its own (the details rule): the rest still link,
  // and the toasts say how many did and why the others did not.
  const handleLinkMasterJob = async (shipmentIds: string[], mczNumber: string) => {
    const { linked, failed, error } = await linkEach(shipmentIds, (id) => linkMasterJob({ shipmentId: id, mczNumber }));
    if (linked > 0) toast.success(`Linked ${linkedCount(linked)} to ${mczNumber}`);
    if (failed === 0) {
      setMasterJobOpen(false);
      return;
    }
    toast.error(`${linkedCount(failed)} not linked to ${mczNumber}: ${apiErrorMessage(error)}`);
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
      <ShipmentsTable
        shipments={shipments}
        cap={{ shown: shipments.length, total }}
        isLoading={isLoading}
        isError={isError}
        onVisibleColumnsChange={setSearchColumns}
        onCreateClick={() => setCreateOpen(true)}
        onAddMasterJob={(ids) => {
          setMasterJobPreselected(ids);
          setMasterJobTickedAway(ids.flatMap((id) => seenShipments.current.get(id) ?? []));
          setMasterJobOpen(true);
        }}
      />

      <MasterJobDialog
        open={masterJobOpen}
        onClose={() => setMasterJobOpen(false)}
        shipments={masterJobShipments}
        initialSelectedIds={masterJobPreselected}
        limitToSelected={masterJobPreselected.length > 0}
        onLink={handleLinkMasterJob}
      />

      <CreateShipmentWizard
        open={wizardOpen}
        onClose={closeCreate}
        createShipment={createShipment}
        isCreating={isCreating}
        existingShipments={shipments}
        fromQuote={fromQuote}
        anotherFromQuote={anotherFromQuote}
      />
      </div>
    </div>
  );
};
