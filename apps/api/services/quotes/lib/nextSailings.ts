import { isUuid } from "../../../lib/uuid";
import type { QuoteNextSailings } from "../interfaces/interfaces";

// "Next sailings" on a Sea LCL quote (Council Outlay 14, C7): the quote names one of the company's
// Co-Loading Concept services (data.coLoadingServiceId), and every read of the one quote carries
// that service's next sailings, asked of Co-Loading Concept (the shipments service). Pure.

/** The Co-Loading service a quote's document names, when it is a Sea LCL quote; null for any other quote, and for a pick that is no id. */
export function coLoadingServiceOf(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { serviceType, coLoadingServiceId } = data as Record<string, unknown>;
  return serviceType === "Sea LCL" && typeof coLoadingServiceId === "string" && isUuid(coLoadingServiceId) ? coLoadingServiceId : null;
}

/** What Co-Loading Concept answered about the service, as the quote carries it. */
export const nextSailingsAnswer = (serviceId: string, answer: { open: boolean; name: string; sailings: QuoteNextSailings["sailings"] }): QuoteNextSailings =>
  answer.open ? { serviceId, state: "open", serviceName: answer.name, sailings: answer.sailings } : { serviceId, state: "gone", serviceName: "", sailings: [] };

/** Co-Loading Concept did not answer: nothing is known of the sailings - not that there are none. */
export const nextSailingsUnavailable = (serviceId: string): QuoteNextSailings => ({ serviceId, state: "unavailable", serviceName: "", sailings: [] });
