"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { Alert, DatePicker, Segmented, Spin } from "antd";
import { LeftOutlined, PlusOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { addDays, businessToday } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useHauliers, useTruckingSettings } from "@/hooks/useTrucking";
import type { LtlTripKind, PlanningLeg, PlanningTrip, TripAssignLegs, TripDetail } from "@/hooks/useTruckingConsignments";
import { usePlanningBoard } from "@/hooks/useTruckingPlanning";
import { useUrlParam } from "@/hooks/useUrlParam";
import { btnDefault, btnPrimary } from "@/components/buttons";
import { TERMS } from "../_lib/glossary";
import { PLANNING_CONFLICT_TEXT, TRIP_KIND_LABEL, TRIP_KIND_OPTIONS, addLegsWarnings, groupLegsByZone, openTrips, planningDayOf, warningSummary } from "../_lib/planning";
import { isVersionConflict } from "../_lib/saveConflict";
import { HUB_MISSING_TEXT, hubIsSet } from "../_lib/settings";
import { LabelsModal } from "./LabelsModal";
import { ManifestModal } from "./ManifestModal";
import { NewLtlTripModal } from "./NewLtlTripModal";
import { PlanningLegList } from "./PlanningLegList";
import { PlanningTripCard, type TripCardAction } from "./PlanningTripCard";
import { useAvizacePending } from "@/hooks/useTruckingControl";
import { avizaceWarning } from "../_lib/avizace";
import { PlanningTripOrderDialog } from "./PlanningTripOrderDialog";

const KINDS = TRIP_KIND_OPTIONS.map((o) => o.value);

type Dialog = { kind: "new" } | { kind: "order"; tripId: string; mode: "print" | "send" } | { kind: "manifest"; trip: PlanningTrip } | { kind: "labels"; trip: PlanningTrip } | null;

// Planning: the open LTL legs of a day by zone (left) and the day's trips of one kind as cards
// (right). A leg is dragged onto a card or put there with "Add to trip…"; ticked legs make a new
// trip. Warnings are shown, never blocking; a change on top of someone else's reloads the board.
export const TruckingPlanningTab = () => {
  const toast = useToast();
  const [kind, setKind] = useUrlParam<LtlTripKind>("kind", KINDS, "PICKUP_RUN");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The day is in the address (?date=, today left out), so a link to "line hauls on Friday" opens Friday.
  const date = planningDayOf(searchParams.get("date"), businessToday());
  const setDate = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === businessToday()) params.delete("date");
    else params.set("date", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const [selected, setSelected] = useState<string[]>([]);
  const [draggingLeg, setDraggingLeg] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const { settings } = useTruckingSettings();
  const { hauliers } = useHauliers();
  const avizacePending = useAvizacePending();
  const { unplanned, trips, isLoading, isFetching, error, reload, createTrip, assignLegs, isAssigning } = usePlanningBoard(date, kind);

  const groups = useMemo(() => groupLegsByZone(unplanned), [unplanned]);
  const vehicleTypes = useMemo(() => settings?.vehicleTypes ?? [], [settings]);
  const vehicleLabel = (code: string | null) => (code ? (vehicleTypes.find((v) => v.code === code)?.label ?? code) : "No vehicle type");
  const selectedLegs = unplanned.filter((l) => selected.includes(l.legId));
  const hub = settings?.hub ?? null;
  const hubSet = hubIsSet(hub);

  // What a leg would bring up on each open trip, for the keyboard menu (the server's list counts).
  const targets = openTrips(trips).map((trip) => {
    const vehicle = vehicleTypes.find((v) => v.code === trip.vehicleTypeCode);
    const haulier = hauliers.find((h) => h.customerId === trip.haulierCustomerId);
    return {
      trip,
      warnings: (leg: PlanningLeg) =>
        addLegsWarnings(trip.fill, [leg], { capacity: trip.capacity, vehicleTailLift: vehicle ? vehicle.tailLift : null, haulierAdr: haulier ? haulier.adrCapable : null, tripDate: date }),
    };
  });

  const handleKind = (next: LtlTripKind) => {
    setSelected([]);
    setKind(next);
  };
  const handleDate = (next: string) => {
    setSelected([]);
    setDate(next);
  };

  const reportWarnings = (trip: TripDetail) => {
    const summary = warningSummary(trip.warnings);
    if (summary) toast.warning(`${trip.ref}: ${summary}`);
  };

  const change = async (trip: PlanningTrip, req: Omit<TripAssignLegs, "version">, done: string) => {
    try {
      const res = await assignLegs({ tripId: trip.id, req: { ...req, version: trip.version } });
      toast.success(done);
      reportWarnings(res.trip);
    } catch (e) {
      if (isVersionConflict(e)) {
        toast.warning(PLANNING_CONFLICT_TEXT);
        void reload();
      } else {
        toast.error(`${trip.ref} not changed: ${apiErrorMessage(e)}`);
      }
    }
  };

  const handleAdd = (legId: string, trip: PlanningTrip) => {
    const leg = unplanned.find((l) => l.legId === legId);
    if (!leg) return;
    setSelected((s) => s.filter((x) => x !== legId));
    void change(trip, { add: [legId], remove: [], stopOrder: null }, `${leg.consignmentRef} added to ${trip.ref}`);
  };
  const handleRemove = (trip: PlanningTrip, legId: string) => {
    const ref = trip.stops.find((s) => s.legId === legId)?.consignmentRef ?? "The leg";
    void change(trip, { add: [], remove: [legId], stopOrder: null }, `${ref} taken off ${trip.ref}`);
  };
  const handleReorder = (trip: PlanningTrip, stopOrder: string[]) => void change(trip, { add: [], remove: [], stopOrder }, `Stops of ${trip.ref} reordered`);
  const handleAction = (trip: PlanningTrip, action: TripCardAction) => {
    if (action === "print" || action === "send") setDialog({ kind: "order", tripId: trip.id, mode: action });
    else setDialog({ kind: action, trip });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm" aria-label="Day and kind">
        <span className="inline-flex items-center gap-1">
          <button type="button" className={btnDefault} aria-label="Previous day" onClick={() => handleDate(addDays(date, -1))}>
            <LeftOutlined />
          </button>
          <DatePicker aria-label="Day" format="DD.MM.YYYY" allowClear={false} value={dayjs(date)} onChange={(d) => d && handleDate(d.format("YYYY-MM-DD"))} />
          <button type="button" className={btnDefault} aria-label="Next day" onClick={() => handleDate(addDays(date, 1))}>
            <RightOutlined />
          </button>
          <button type="button" className={btnDefault} onClick={() => handleDate(businessToday())}>
            Today
          </button>
        </span>
        <Segmented<LtlTripKind> aria-label="Trip kind" options={TRIP_KIND_OPTIONS} value={kind} onChange={handleKind} />
        <button type="button" className={`${btnDefault} ml-auto`} aria-label="Reload the board" onClick={() => void reload()}>
          <ReloadOutlined spin={isFetching} />
        </button>
      </section>

      {settings && !hubSet && (
        <Alert
          type="warning"
          showIcon
          message={HUB_MISSING_TEXT}
          description={
            <span>
              Every {TERMS.ltl} trip starts or ends at our warehouse. <Link href="/trucking/settings">Open Trucking settings</Link>
            </span>
          }
        />
      )}
      {error && <Alert type="error" showIcon message={`The board could not be loaded: ${apiErrorMessage(error)}.`} />}

      {isLoading ? (
        <div className="flex justify-center p-16">
          <Spin size="large" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={`Open ${TERMS.leg.toLowerCase()}s`}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
              <h2 className="m-0 text-[12px] font-bold uppercase tracking-wide text-slate-600">Open {TERMS.leg.toLowerCase()}s</h2>
              <span className="text-[11px] text-slate-500">{unplanned.length}</span>
              <button
                type="button"
                className={`${btnPrimary} ml-auto`}
                disabled={!selectedLegs.length || !hubSet}
                title={!hubSet ? HUB_MISSING_TEXT : selectedLegs.length ? undefined : "Tick the legs of the new trip"}
                onClick={() => setDialog({ kind: "new" })}
              >
                <PlusOutlined /> New trip{selectedLegs.length ? ` (${selectedLegs.length})` : ""}
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <PlanningLegList
                groups={groups}
                selected={selected}
                onSelect={setSelected}
                targets={targets}
                onAdd={(leg, trip) => handleAdd(leg.legId, trip)}
                onDragStart={setDraggingLeg}
                onDragEnd={() => setDraggingLeg(null)}
                busy={isAssigning}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3" aria-label={`${TRIP_KIND_LABEL[kind]}s`}>
            {trips.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-[13px] text-slate-500">
                No {TRIP_KIND_LABEL[kind].toLowerCase()}s on this day yet. Tick open legs and choose <b>New trip</b>.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                {trips.map((trip) => (
                  <PlanningTripCard
                    key={trip.id}
                    trip={trip}
                    vehicleLabel={vehicleLabel(trip.vehicleTypeCode)}
                    avizaceWarning={avizaceWarning({ kind: trip.kind, consignmentIds: trip.stops.map((s) => s.consignmentId), warnings: trip.warnings }, avizacePending)}
                    legDragging={!!draggingLeg}
                    busy={isAssigning}
                    onDropLeg={(t, legId) => {
                      setDraggingLeg(null);
                      handleAdd(legId, t);
                    }}
                    onReorder={handleReorder}
                    onRemove={handleRemove}
                    onAction={handleAction}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {dialog?.kind === "new" && hub && (
        <NewLtlTripModal
          kind={kind}
          date={date}
          legs={selectedLegs}
          hubPostcode={hub.postcode}
          onClose={() => setDialog(null)}
          onCreate={(req) =>
            createTrip(req)
              .then((res) => {
                toast.success(`${res.trip.ref} made with ${res.trip.haulierName} — send the ${TERMS.transportOrder.toLowerCase()} next`);
                reportWarnings(res.trip);
                setSelected([]);
              })
              .catch((e: unknown) => {
                toast.error(`Trip not made: ${apiErrorMessage(e)}`);
                throw e;
              })
          }
        />
      )}
      {dialog?.kind === "order" && <PlanningTripOrderDialog tripId={dialog.tripId} mode={dialog.mode} onClose={() => setDialog(null)} />}
      {dialog?.kind === "manifest" && <ManifestModal tripId={dialog.trip.id} tripRef={dialog.trip.ref} onClose={() => setDialog(null)} />}
      {dialog?.kind === "labels" && (
        <LabelsModal consignmentIds={[...new Set(dialog.trip.stops.map((s) => s.consignmentId))]} what={dialog.trip.ref} onClose={() => setDialog(null)} />
      )}
    </div>
  );
};
