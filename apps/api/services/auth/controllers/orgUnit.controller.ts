import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { searchAirports, type Airport } from "../../../lib/geo/airports";
import { orgUnitService } from "../services/orgUnit.service";
import type { DepartmentInfo, BranchInfo, CountryInfo, LocationInfo, PlaceInfo, PlaceCandidateQuery } from "../services/orgUnit.service";

// The company's departments, branches and countries. Everyone in the company can read them
// (the noticeboard and user forms need the names); only admins maintain them.

interface OkResponse {
  ok: boolean;
}

interface DepartmentListResponse {
  departments: DepartmentInfo[];
}

export const departmentList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/departments" },
  async (): Promise<DepartmentListResponse> => {
    return { departments: await orgUnitService.listDepartments(getAuthData()!.companyID) };
  },
);

interface DepartmentCreateRequest {
  name: string;
}
interface DepartmentResponse {
  department: DepartmentInfo;
}

export const departmentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/departments" },
  async (req: DepartmentCreateRequest): Promise<DepartmentResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { department: await orgUnitService.createDepartment(actor.companyID, req) };
  },
);

interface DepartmentUpdateRequest {
  id: string;
  name: string;
}

export const departmentUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/departments/:id" },
  async (req: DepartmentUpdateRequest): Promise<DepartmentResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { department: await orgUnitService.updateDepartment(req.id, actor.companyID, req) };
  },
);

interface OrgUnitDeleteRequest {
  id: string;
}

export const departmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/departments/:id" },
  async (req: OrgUnitDeleteRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin");
    await orgUnitService.deleteDepartment(req.id, actor.companyID);
    return { ok: true };
  },
);

interface BranchListResponse {
  branches: BranchInfo[];
}

export const branchList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/branches" },
  async (): Promise<BranchListResponse> => {
    return { branches: await orgUnitService.listBranches(getAuthData()!.companyID) };
  },
);

interface BranchCreateRequest {
  name: string;
  countryCode: string;
  locationId: number;
}
interface BranchResponse {
  branch: BranchInfo;
}

export const branchCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/branches" },
  async (req: BranchCreateRequest): Promise<BranchResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { branch: await orgUnitService.createBranch(actor.companyID, req) };
  },
);

interface BranchUpdateRequest {
  id: string;
  name: string;
  countryCode: string;
  locationId: number;
}

export const branchUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/branches/:id" },
  async (req: BranchUpdateRequest): Promise<BranchResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { branch: await orgUnitService.updateBranch(req.id, actor.companyID, req) };
  },
);

export const branchDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/branches/:id" },
  async (req: OrgUnitDeleteRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin");
    await orgUnitService.deleteBranch(req.id, actor.companyID);
    return { ok: true };
  },
);

interface CountryListResponse {
  countries: CountryInfo[];
}

export const countryList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/countries" },
  async (): Promise<CountryListResponse> => {
    return { countries: await orgUnitService.listCountries(getAuthData()!.companyID) };
  },
);

// The country by its ISO code; its name is taken from the server's country list.
interface CountryCreateRequest {
  code: string & MinLen<2> & MaxLen<2>;
}
interface CountryResponse {
  country: CountryInfo;
}

export const countryCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/countries" },
  async (req: CountryCreateRequest): Promise<CountryResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { country: await orgUnitService.createCountry(actor.companyID, req) };
  },
);

interface CountryUpdateRequest {
  id: string;
  code: string & MinLen<2> & MaxLen<2>;
}

export const countryUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/countries/:id" },
  async (req: CountryUpdateRequest): Promise<CountryResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { country: await orgUnitService.updateCountry(req.id, actor.companyID, req) };
  },
);

export const countryDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/countries/:id" },
  async (req: OrgUnitDeleteRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin");
    await orgUnitService.deleteCountry(req.id, actor.companyID);
    return { ok: true };
  },
);

interface LocationListRequest {
  countryCode: string;
}
interface LocationListResponse {
  locations: LocationInfo[];
}

// Every UN/LOCODE place of one country, for the branch city picker.
export const locationList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/locations/:countryCode" },
  async (req: LocationListRequest): Promise<LocationListResponse> => {
    return { locations: await orgUnitService.listLocations(req.countryCode) };
  },
);

interface PlaceSearchRequest {
  q: string;
  countryCode?: string;
}
interface PlaceListResponse {
  places: PlaceInfo[];
}

// Places worldwide matching typed text, for the Origin / POL / POD / Destination / HUB / CFS pickers.
export const placeSearch = api(
  { expose: true, auth: true, method: "GET", path: "/auth/places" },
  async (req: PlaceSearchRequest): Promise<PlaceListResponse> => {
    return { places: await orgUnitService.searchPlaces(req.q, req.countryCode) };
  },
);

interface AirportSearchRequest {
  q: string;
}
interface AirportListResponse {
  airports: Airport[];
}

// IATA-coded airports matching typed text, offered beside the places when a quote goes by air.
export const airportSearch = api(
  { expose: true, auth: true, method: "GET", path: "/auth/airports" },
  async (req: AirportSearchRequest): Promise<AirportListResponse> => {
    return { airports: searchAirports(req.q) };
  },
);

interface PlaceLookupRequest {
  codes: string[];
  names: PlaceCandidateQuery[];
}
interface PlaceLookupResponse {
  // The known ones among `codes`.
  byCode: PlaceInfo[];
  // Per entry of `names`, the places it could mean.
  candidates: PlaceInfo[][];
}

// For the extraction service, which matches what the AI read to the database.
export const placeLookup = api(
  { expose: false, method: "POST", path: "/auth/places/lookup" },
  async (req: PlaceLookupRequest): Promise<PlaceLookupResponse> => {
    const [byCode, candidates] = await Promise.all([
      orgUnitService.placesByCodes(req.codes),
      orgUnitService.placeCandidates(req.names),
    ]);
    return { byCode, candidates };
  },
);
