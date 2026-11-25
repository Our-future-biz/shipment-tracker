"use client";

import { useMutation } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { uuid } from "@/lib/uuid";
import type { DraftLine } from "@/app/loading-planner/_lib/cargoForm";
import { linesFromQuote, linesFromSailing, quotePackages } from "@/app/loading-planner/_lib/jobCargo";
import { shipmentLines, shipmentLookup, shipmentWithJobNumber } from "@/app/loading-planner/_lib/plannerScreen";

/** How a job is named when it is looked up: a shipment by its id or its job number, a quote by its reference. */
export interface JobKey {
  kind: interfaces.PlanLinkKind;
  /** A shipment's id, its job number, a quote's reference, or a sailing's id. */
  key: string;
}

/** A job as a loading plan links to it, with its cargo as planner lines. */
export interface PlanJob {
  kind: interfaces.PlanLinkKind;
  id: string;
  ref: string;
  lines: DraftLine[];
  /** For a sailing: the containers it has, to nominate and to judge the plan against. */
  box?: { containerType: string; containerCount: number };
}

/** There is no such shipment or quote; its message says which. */
export class JobNotFound extends Error {}

const newId = uuid;

/** The id of the shipment with this job number: the list's search finds it by its digits, whatever letters it carries now. */
async function shipmentIdOf(jobNumber: string): Promise<string> {
  const found = shipmentWithJobNumber((await api.shipments.shipmentList({ search: jobNumber, limit: 100 })).data, jobNumber);
  if (!found) throw new JobNotFound(`No shipment with the job number "${jobNumber}" was found.`);
  return found.id;
}

async function readShipment(key: string): Promise<PlanJob> {
  const lookup = shipmentLookup(key);
  const { shipment } = await api.shipments.shipmentGet("id" in lookup ? lookup.id : await shipmentIdOf(lookup.jobNumber));
  return { kind: "shipment", id: shipment.id, ref: shipment.jobNumber ?? "", lines: shipmentLines(shipment, newId) };
}

async function readQuote(key: string): Promise<PlanJob> {
  try {
    const { quote } = await api.quotes.salesQuoteGet(key.trim());
    return { kind: "quote", id: quote.id, ref: quote.quoteNumber, lines: linesFromQuote(quotePackages(quote.data), newId) };
  } catch (err) {
    if (isNotFound(err)) throw new JobNotFound(`No quote with the reference "${key.trim()}" was found.`);
    throw err;
  }
}

/** A Co-Loading sailing's box: every counted shipment's cargo, each line under its job number (Council Outlay 14, C1). */
async function readSailing(key: string): Promise<PlanJob> {
  try {
    const box = await api.shipments.coLoadingSailingPlanCargo(key.trim());
    return { kind: "sailing", id: box.sailingId, ref: box.reference, lines: linesFromSailing(box, newId), box: { containerType: box.containerType, containerCount: box.containerCount } };
  } catch (err) {
    if (isNotFound(err)) throw new JobNotFound("This sailing was not found.");
    throw err;
  }
}

/**
 * The job a saved plan is linked to, with its cargo as the plan's GET carries it (Council Outlay 14,
 * P3): what the page judges "the job's cargo differs" by, read on the server with the plan - so
 * opening a plan asks nothing more. Null when the GET has none: no link, the job is gone, or the
 * service that owns it did not answer.
 */
export function linkedJobOf(plan: interfaces.LoadingPlanItem): PlanJob | null {
  const cargo = plan.jobCargo;
  if (!cargo || !plan.linkKind || !plan.linkId) return null;
  const job = { kind: plan.linkKind, id: plan.linkId, ref: plan.linkRef };
  if (plan.linkKind === "shipment" && cargo.shipment) return { ...job, lines: shipmentLines(cargo.shipment, newId) };
  if (plan.linkKind === "quote" && cargo.quote) return { ...job, lines: linesFromQuote(cargo.quote.packages, newId) };
  if (plan.linkKind === "sailing" && cargo.sailing) {
    return { ...job, lines: linesFromSailing(cargo.sailing, newId), box: { containerType: cargo.sailing.containerType, containerCount: cargo.sailing.containerCount } };
  }
  return null;
}

/** Reads a shipment, a quote or a sailing for a loading plan (Link, Reload cargo, a plan opened from a job): what to link to, and its cargo. */
export const useLoadingPlanJob = () => {
  const read = useMutation({ mutationFn: ({ kind, key }: JobKey) => (kind === "shipment" ? readShipment(key) : kind === "sailing" ? readSailing(key) : readQuote(key)) });
  return { readJob: read.mutateAsync, isReading: read.isPending };
};
