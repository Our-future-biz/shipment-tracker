import { APIError, api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { canEditSalesSettings } from "../../../lib/salesPolicy";
import { GUARDRAIL_MODES, PER_CONTAINER_MODES, settingsProblem, type GuardrailMode } from "../lib/guardrails";
import { quoteGuardrailRepository } from "../repositories/quoteGuardrail.repository";
import { companyGuardrails } from "../services/marginRates";

// Sales Settings → Guardrails (Council Outlay 6 D1-D3): the margin floor of each freight mode,
// a minimum % and a minimum CZK (per container for Sea FCL and Rail). Everybody may read them -
// every quote is judged by them - and those who manage Sales change them. Road's is Trucking's
// floor, shown here and set in Trucking.

interface GuardrailRow {
  serviceType: string;
  percent: number;
  minAmountCzk: number;
  /** The CZK minimum is per container. */
  perContainer: boolean;
  /** Where it is set: Sales, or Trucking (Road). */
  setIn: "sales" | "trucking";
  /** Changed from the starting floor of the council (a stored row). */
  changed: boolean;
}

interface GuardrailsResponse {
  guardrails: GuardrailRow[];
  canEdit: boolean;
}

async function guardrailsOf(companyId: string, role: string): Promise<GuardrailsResponse> {
  const [settings, stored] = await Promise.all([companyGuardrails(companyId), quoteGuardrailRepository.list(companyId)]);
  return {
    guardrails: GUARDRAIL_MODES.map((mode: GuardrailMode) => ({
      serviceType: mode,
      percent: settings[mode].percent,
      minAmountCzk: settings[mode].minAmountCzk,
      perContainer: PER_CONTAINER_MODES.includes(mode),
      setIn: mode === "Road" ? "trucking" : "sales",
      changed: stored.some((r) => r.serviceType === mode),
    })),
    canEdit: canEditSalesSettings(role),
  };
}

export const salesGuardrailsGet = api(
  { expose: true, auth: true, method: "GET", path: "/sales-guardrails" },
  async (): Promise<GuardrailsResponse> => {
    const auth = getAuthData()!;
    return guardrailsOf(auth.companyID, auth.role);
  },
);

interface GuardrailsSetRequest {
  guardrails: { serviceType: string; percent: number; minAmountCzk: number }[] & MaxLen<10>;
}

export const salesGuardrailsSet = api(
  { expose: true, auth: true, method: "PUT", path: "/sales-guardrails" },
  async ({ guardrails }: GuardrailsSetRequest): Promise<GuardrailsResponse> => {
    const auth = getAuthData()!;
    if (!canEditSalesSettings(auth.role)) throw APIError.permissionDenied("Only those who manage Sales change the guardrails");
    const problem = settingsProblem(guardrails);
    if (problem) throw APIError.invalidArgument(problem);
    await quoteGuardrailRepository.save(auth.companyID, guardrails, auth.userID);
    return guardrailsOf(auth.companyID, auth.role);
  },
);
