"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button } from "antd";
import { XIcon } from "@phosphor-icons/react";
import { useDebounced } from "@/hooks/useDebounced";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useToast } from "@/lib/toast";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { ShipmentsTable } from "./ShipmentsTable";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { MasterJobDialog, linkEach, linkedCount } from "./MasterJobDialog";
import { apiErrorMessage } from "@/lib/api";
import { searchColumnsFor, searchesAllFields, shownColumnsParams } from "../_lib/allFieldsSearch";
import { addressFiltersOf, withoutAddressFilter, type AddressFilterParam } from "../_lib/addressFilters";
import { usePeopleNames } from "../_lib/usePeopleNames";
import { myJobsOf, myJobsWaiting } from "../_lib/myJobs";
import { useAuth } from "@/lib/auth/AuthContext";
import { HINT } from "@/styles/ui";

// Search/status live in the URL (?q= / ?status=), written by the table's toolbar and read
// here to drive the server-side query — so filtering covers the whole company dataset
// instead of only the rows already in the browser.
// A link may narrow the list further by its address alone (?handledBy=, ?mode=, ?direction=,
// ?customs=, ?invoicing=, and the tiles of Shipments → Managers): those go to the same server-side query and
// each shows as a chip over the table, so the list never is short without saying why (_lib/addressFilters).
export const ShipmentsView = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useDebounced(searchParams.get("q") ?? "", 300);
  const statusBucket = searchParams.get("status") ?? "all";
  const tile = searchParams.get("tile") ?? "all";
  // "Create New Shipment" on a quote's page leads here with ?fromQuote=QCZ..., with &another=1 as
  // well once the quote has a shipment booked.
  const fromQuote = searchParams.get("fromQuote");
  const anotherFromQuote = !!fromQuote && searchParams.get("another") === "1";

  // The search looks only in the columns the table shows - unless "Show all" on the main search's
  // results led here: then in every field, as the main search does, to list what it counted.
  const [shownColumns, setShownColumns] = useState<string[]>();
  const allFields = searchesAllFields(searchParams);
  const peopleNames = usePeopleNames();
  const { request: addressRequest, chips } = addressFiltersOf(searchParams, peopleNames);
  // The toolbar's "My jobs" (?mine=1): the signed-in user's jobs, matched over every job (mock council S9-1).
  const { user } = useAuth();
  const jobsOf = myJobsOf(searchParams, user?.email);
  // Until the user is loaded, no request: one without jobsOf would list every job first (review of S9-1).
  const waitingForUser = myJobsWaiting(searchParams, user?.email);
  const { shipments, total, isLoading: listLoading, isError, createShipment, linkMasterJob, isCreating } = useShipments({
    search,
    searchColumns: searchColumnsFor(searchParams, shownColumns),
    statusBucket,
    tile,
    jobsOf,
    ...addressRequest,
    enabled: !waitingForUser,
  });
  const isLoading = listLoading || waitingForUser;
  // A chip's ×: its parameter leaves the address, everything else in it stays.
  const clearAddressFilter = (param: AddressFilterParam) => {
    const qs = withoutAddressFilter(searchParams, param).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [masterJobOpen, setMasterJobOpen] = useState(false);
  // Shipments ticked in the table when "Link to Master Job" was pressed.
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
        onVisibleColumnsChange={setShownColumns}
        notice={
          <>
            {chips.length > 0 && (
              // The filters the address holds and no control on the page shows: why the list is short, and the way out.
              <div role="group" aria-label="Filters on this list" className="flex flex-wrap items-center gap-2">
                <span className={HINT}>Showing only:</span>
                {chips.map((chip) => (
                  <span
                    key={chip.param}
                    className="inline-flex max-w-full items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg border border-indigo-200 bg-indigo-50 text-[12px] font-medium text-indigo-700"
                  >
                    <span className="truncate">{chip.label}</span>
                    <button
                      type="button"
                      onClick={() => clearAddressFilter(chip.param)}
                      aria-label={`Clear filter ${chip.label}`}
                      title="Clear this filter"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <XIcon size={12} weight="bold" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {allFields && (
              // Says why rows show that match nowhere in their columns, and how to go back to the list's own search.
              <Alert
                type="info"
                showIcon
                className="!mb-3"
                message={`Searching every field for “${searchParams.get("q")?.trim()}”, as the main search does, so some shipments match in fields that aren't shown as columns.`}
                action={
                  <Button size="small" onClick={() => router.replace(`${pathname}?${shownColumnsParams(searchParams).toString()}`, { scroll: false })}>
                    Search shown columns only
                  </Button>
                }
              />
            )}
          </>
        }
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
        fromQuote={fromQuote}
        anotherFromQuote={anotherFromQuote}
      />
      </div>
    </div>
  );
};
