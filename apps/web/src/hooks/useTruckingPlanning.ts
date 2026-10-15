"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { truckingKeys } from "./truckingKeys";
import { useRefreshLists, type LtlTripKind, type PlanningLeg, type PlanningTrip, type TripAssignLegs, type TripCreateLtl, type TripDetail } from "./useTruckingConsignments";

// The LTL planning board (Phase 5): the open legs and the trips of one day and trip kind, a new
// trip from legs, and legs moved onto, off or within a trip. Every change reads the board again.

const NO_LEGS: PlanningLeg[] = [];
const NO_TRIPS: PlanningTrip[] = [];

export function usePlanningBoard(date: string, kind: LtlTripKind) {
  const queryClient = useQueryClient();
  const refreshLists = useRefreshLists();
  const query = useQuery({
    queryKey: truckingKeys.planningBoard(date, kind),
    queryFn: () => api.trucking.truckingPlanningBoard({ date, kind }),
    enabled: !!date,
    // Another day or kind keeps the board on screen until the new one arrives.
    placeholderData: keepPreviousData,
  });

  const onTrip = (res: { trip: TripDetail }) => {
    queryClient.setQueryData(truckingKeys.trip(res.trip.id), { trip: res.trip });
    return refreshLists();
  };

  const createTrip = useMutation({ mutationFn: (req: TripCreateLtl) => api.trucking.truckingTripCreateLtl(req), onSuccess: onTrip });
  const assignLegs = useMutation({
    mutationFn: ({ tripId, req }: { tripId: string; req: TripAssignLegs }) => api.trucking.truckingTripAssignLegs(tripId, req),
    onSuccess: onTrip,
  });

  return {
    unplanned: query.data?.unplanned ?? NO_LEGS,
    trips: query.data?.trips ?? NO_TRIPS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    reload: query.refetch,
    createTrip: createTrip.mutateAsync,
    isCreating: createTrip.isPending,
    assignLegs: assignLegs.mutateAsync,
    isAssigning: assignLegs.isPending,
  };
}
