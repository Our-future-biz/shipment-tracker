import type { ReactNode } from "react";
import { APIError, type interfaces } from "@/lib/api/client";

// Values and colour rules taken from the Warehouse prototype (v0.6, Gate Log).

export const VISITS = ["příjem", "výdej"] as const;
export const HANDLINGS = ["Import", "Export"] as const;
export const OPERATION_TYPES = [
  "LCL consolidation",
  "FCL stuffing",
  "FCL stripping",
  "FCL transload (cross-stuff)",
  "Cargo storage",
  "Cargo storage (bonded)",
  "Container yard storage",
];
export const CUSTOMS_MODES = ["SCP", "JSD", "T1", "T2L", "ATA Carnet", "RDT", "C-Goods"];
// Same list as the Shipments module; only the last one releases cargo.
export const CUSTOMS_STATUSES = [
  "Waiting For Commercial Paperwork",
  "Paperwork Verification Pending",
  "Paperwork Verified",
  "Under Customs Clearance",
  "Customs Cleared/Released",
];
export const CUSTOMS_CLEARED = "Customs Cleared/Released";
export const PACKINGS = ["Pallet(s)", "Cartons", "Colli", "Boxes", "Wooden boxes", "Drums"];
export const FREIGHT_MODES = ["Air Freight", "Sea Freight", "Rail Freight", "Road Freight"];
export const LOAD_TYPES = ["Full Load", "Consolidation", "Project Shipment"];
// Each container is surveyed once on receipt and once on release; the two passes are kept apart.
// Surveys stored with the old "Both" phase count as the receipt pass (same rule as the server).
export const SURVEY_PHASES = ["Receipt — survey on gate in", "Release — survey on gate out"] as const;
export type SurveyPhaseKey = "receipt" | "release";
export const surveyPhaseKey = (phase: string): SurveyPhaseKey => (/^Release/.test(phase) ? "release" : "receipt");
export const surveyPhaseOf = (key: SurveyPhaseKey) => SURVEY_PHASES[key === "release" ? 1 : 0];

type SurveyState = Pick<interfaces.GateMovementItem, "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt" | "containers" | "surveys">;
// The survey pass due now: release once the cargo is released or gated out, receipt once it has
// arrived (gate-in or an export receipt), none before arrival.
export const requiredSurveyPhase = (m: SurveyState): SurveyPhaseKey | null =>
  m.impRelease || m.gateOut ? "release" : m.gateIn || m.expDraft || m.expReceipt ? "receipt" : null;
// Every container (or the position itself when none is recorded) needs a survey for that pass.
export const surveyTargets = (m: SurveyState) => (m.containers.length ? m.containers.map((c) => c.number) : [""]);
export const hasSurvey = (m: SurveyState, container: string, phase: SurveyPhaseKey) =>
  m.surveys.some((s) => s.container === container && surveyPhaseKey(s.phase) === phase);
export const OUTER_PACKINGS = ["Cartons", "Case", "Barrel", "Sack", "Pallets", "Unpacked"];
export const VISUAL_FLAGS = ["Broken", "Dented", "Hole in", "Torn", "Wet", "Bad loose", "Open"];
export const INNER_FLAGS = ["Soiled", "Pour out", "Unidentified", "Not visible", "Accessible"];
export const CONTAINER_TYPES = ["20' DV", "40' DV", "40' HC", "45' HC", "20' OT", "40' FR"];
export const MAX_DROPS = 10;
export const EXPECTED_FILE_BYTES = 20 * 1000 * 1000;
// The movement's own status. It moves only through the stamps, Refuse and the supervisor override.
export const GATE_STATUSES = ["Expected", "In Warehouse", "Released"];
export const RELEASE_STATES = ["OK", "Pending", "Blocked"] as const;

// Badge tones: g green · a amber · r red · b blue · i indigo · "" grey.
export type Tone = "g" | "a" | "r" | "b" | "i" | "";

const TONE_CLASS: Record<Tone, string> = {
  g: "bg-emerald-50 text-green-700",
  a: "bg-orange-50 text-orange-700",
  r: "bg-red-50 text-red-700",
  b: "bg-blue-50 text-blue-700",
  i: "bg-indigo-50 text-indigo-600",
  "": "bg-gray-100 text-gray-600",
};

export function Badge({ tone = "", children, className = "", onClick, title }: { tone?: Tone; children: ReactNode; className?: string; onClick?: () => void; title?: string }) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={`inline-block whitespace-nowrap rounded-[5px] px-2 py-[2.5px] text-[10.5px] font-semibold tracking-[.1px] ${TONE_CLASS[tone]} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  Expected: "",
  "In Warehouse": "b",
  Released: "g",
  Refused: "r",
};
export const HANDLING_TONE: Record<string, Tone> = { Import: "b", Export: "i" };
export const VISIT_TONE: Record<string, Tone> = { příjem: "b", výdej: "i" };
export const CUSTOMS_STATUS_TONE: Record<string, Tone> = {
  "Waiting For Commercial Paperwork": "r",
  "Paperwork Verification Pending": "a",
  "Paperwork Verified": "b",
  "Under Customs Clearance": "a",
  "Customs Cleared/Released": "g",
};
export const RELEASE_TONE: Record<string, Tone> = { OK: "g", Pending: "a", Blocked: "r" };

export const isFcl = (operationType: string) => /^FCL/.test(operationType);
export const isLcl = (operationType: string) => /^LCL/.test(operationType);

// Thousands separated by a space, decimal point — readable for CZ and EN users.
export const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, " ");

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const stamp = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm(iso)}`;
};

export const errorMessage = (e: unknown, fallback: string) => (e instanceof APIError ? e.message : fallback);

// Managers (same roles the server allows): supervisor override, void a stamp, archive / restore
// a record, remove a position whose gate record has stamps.
export const SUPERVISOR_ROLES = ["superadmin", "admin", "manager"];
export const isManager = (user: { role: string } | null | undefined) => !!user && SUPERVISOR_ROLES.includes(user.role);

type Stamps = Pick<interfaces.GateMovementItem, "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt">;
// Any gate stamp on the record: then only a manager archives it (with a reason); others may delete
// a record without stamps.
export const hasAnyStamp = (m: Stamps) => !!(m.gateIn || m.gateOut || m.impRelease || m.expDraft || m.expReceipt);
