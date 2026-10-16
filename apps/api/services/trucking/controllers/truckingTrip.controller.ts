import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { tripService } from "../services/trip.service";
import type { ConsignmentDetail, TripDetail, TripListItem, TripPriceInput, TripStatus } from "../interfaces/interfaces";

interface TruckingTripCreateFtlRequest {
  consignmentId: string;
  /** null = the rate engine's first candidate (preferred lane, then cheapest) */
  haulierCustomerId: string | null;
  vehicleTypeCode: string | null;
  price: TripPriceInput;
}

interface TruckingTripCreateFtlResponse {
  trip: TripDetail;
  consignment: ConsignmentDetail;
}

// Puts a booked consignment on a new FTL trip with a usable haulier (a blocked one is refused with its issues).
export const truckingTripCreateFtl = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/ftl" },
  async (req: TruckingTripCreateFtlRequest): Promise<TruckingTripCreateFtlResponse> => {
    return tripService.createFtl(requireRole(), req);
  },
);

interface TruckingTripResponse {
  trip: TripDetail;
}

interface TruckingTripGetRequest {
  id: string;
}

export const truckingTripGet = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/trips/:id" },
  async ({ id }: TruckingTripGetRequest): Promise<TruckingTripResponse> => {
    return { trip: await tripService.get(requireRole(), id) };
  },
);

interface TruckingTripListRequest {
  status?: TripStatus;
  /** Ref, haulier, plate, driver or consignment ref */
  search?: string;
}

interface TruckingTripListResponse {
  trips: TripListItem[];
}

export const truckingTripList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/trips" },
  async (req: TruckingTripListRequest): Promise<TruckingTripListResponse> => {
    return { trips: await tripService.list(requireRole(), req) };
  },
);

interface TruckingTripUpdateRequest {
  id: string;
  vehicleTypeCode: string | null;
  /** Normalised upper case without spaces */
  tractorPlate: string;
  trailerPlate: string;
  driverName: string;
  driverPhone: string;
  version: number;
}

// Vehicle, plates and driver of a trip, with the version read. A new tractor plate is written to the job.
export const truckingTripUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/trucking/trips/:id" },
  async ({ id, ...input }: TruckingTripUpdateRequest): Promise<TruckingTripResponse> => {
    return { trip: await tripService.update(requireRole(), id, input) };
  },
);

interface TruckingTripCancelRequest {
  id: string;
  reason: string;
}

// Cancels a trip (manager), refused after the pick-up: the consignment goes back to BOOKED.
export const truckingTripCancel = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/cancel" },
  async ({ id, reason }: TruckingTripCancelRequest): Promise<TruckingTripResponse> => {
    return { trip: await tripService.cancel(requireRole(), id, reason) };
  },
);
