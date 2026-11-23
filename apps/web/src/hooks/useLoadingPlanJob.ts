"use client";

import { useMutation } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { isUuid } from "@/lib/uuid";
import type { DraftLine } from "@/app/loading-planner/_lib/cargoForm";
import { linesFromQuote, linesFromShipment, quotePackages } from "@/app/loading-planner/_lib/jobCargo";

/** How a job is named when it is looked up: a shipment by its id or its job number, a quote by its reference. */
export interface JobKey {
  kind: interfaces.PlanLinkKind;
  /** A shipment's id, its job number, or a quote's reference. */
  key: string;
}

/** A job as a loading plan links to it, with its cargo as planner lines. */
export interface PlanJob {
  kind: interfaces.PlanLinkKind;
  id: string;
  ref: string;
  lines: DraftLine[];
}

/** There is no such shipment or quote; its message says which. */
export class JobNotFound extends Error {}

const newId = () => crypto.randomUUID();

async function readShipment(key: string): Promise<PlanJob> {
  let id = key;
  if (!isUuid(key)) {
    // A job number: the list's search finds it, and only the exact number counts.
    const wanted = key.trim().toLowerCase();
    const found = (await api.shipments.shipmentList({ search: key.trim(), limit: 25 })).data.find((s) => (s.jobNumber ?? "").toLowerCase() === wanted);
    if (!found) throw new JobNotFound(`No shipment with the job number "${key.trim()}" was found.`);
    id = found.id;
  }
  const { shipment } = await api.shipments.shipmentGet(id);
  return { kind: "shipment", id: shipment.id, ref: shipment.jobNumber ?? "", lines: linesFromShipment(shipment.cargoDimensions, newId) };
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

/** Reads a shipment or a quote for a loading plan: what to link to, and its cargo. */
export const useLoadingPlanJob = () => {
  const read = useMutation({ mutationFn: ({ kind, key }: JobKey) => (kind === "shipment" ? readShipment(key) : readQuote(key)) });
  return { readJob: read.mutateAsync, isReading: read.isPending };
};
