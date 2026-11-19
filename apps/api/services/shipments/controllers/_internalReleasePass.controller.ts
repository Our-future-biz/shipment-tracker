import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { iso } from "../../../lib/db/serialize";
import type { ReleaseKind } from "../lib/prepaymentStop";
import { gateReleaseService } from "../services/gateRelease.service";

// Internal API of the Warehouse Concept gate (services/releasePayment there): its WH release of a job the
// prepayment stop holds, on the shipments' side (services/gateRelease.service). Called within the stamping
// person's own request, so the company and the user are theirs (auth), never sent.

interface ReleasePassUseRequest {
  shipmentId: string;
  kind: ReleaseKind;
}

interface ReleasePassUseResponse {
  /** The approved request the release goes through on, now marked used; null when there is none. */
  pass: { requestId: string; reason: string; usedAt: string } | null;
}

/** Uses an approved request to release this job (a pass), once: the gate's release then goes through on it. */
export const _internalReleasePassUse = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/release-pass/use" },
  async ({ shipmentId, kind }: ReleasePassUseRequest): Promise<ReleasePassUseResponse> => {
    const auth = getAuthData()!;
    const pass = await gateReleaseService.usePass(auth.companyID, auth.userID, shipmentId, kind);
    return { pass: pass ? { requestId: pass.requestId, reason: pass.reason, usedAt: iso(pass.usedAt) } : null };
  },
);

interface ReleasePassGiveBackRequest {
  requestId: string;
  /** The use to undo, as _internalReleasePassUse answered it. */
  usedAt: string;
}

/** Gives back a pass the gate used when its release was not made after all. */
export const _internalReleasePassGiveBack = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/release-pass/:requestId/give-back" },
  async ({ requestId, usedAt }: ReleasePassGiveBackRequest): Promise<{ givenBack: boolean }> => {
    const auth = getAuthData()!;
    const at = new Date(usedAt);
    if (Number.isNaN(at.getTime())) return { givenBack: false };
    return { givenBack: await gateReleaseService.giveBack(auth.companyID, auth.userID, requestId, at) };
  },
);

interface ReleaseOverrideRecordRequest {
  shipmentId: string;
  kind: ReleaseKind;
  /** A manager's reason at the gate, or who asked and who approved (an approved request): as long as both can be. */
  reason: string & MinLen<1> & MaxLen<2000>;
  invoices: { number: string & MaxLen<200>; leftToPay: number; currency: string & MaxLen<10> }[];
  /** False when Invoicing could not be asked. */
  checked: boolean;
}

/** Records on the shipment a release the gate let through on an unpaid prepayment job, as any override is. */
export const _internalReleaseOverrideRecord = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/release-override" },
  async ({ shipmentId, kind, reason, invoices, checked }: ReleaseOverrideRecordRequest): Promise<void> => {
    const auth = getAuthData()!;
    await gateReleaseService.recordOverride(auth.companyID, auth.userID, shipmentId, kind, { reason, invoices, checked });
  },
);
