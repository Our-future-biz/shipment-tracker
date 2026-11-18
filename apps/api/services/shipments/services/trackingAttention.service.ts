import { businessDay } from "../../../lib/businessDate";
import type { TrackingAttentionItem } from "../interfaces/interfaces";
import { CLOCK_EVENT_KINDS, clockApplies, clockOf } from "../lib/detentionClock";
import { attentionFlags, type AttentionFacts, type AttentionShipment } from "../lib/trackingAttention";
import { containerRepository } from "../repositories/container.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentCustomerNoticeRepository } from "../repositories/shipmentCustomerNotice.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";

/** How many shipments are looked at, those that happened longest ago first; the answer says when there were more. */
export const TRACKING_ATTENTION_LIMIT = 1000;

/**
 * What lib/trackingAttention needs to know about these shipments beyond their own columns, by
 * shipment id: the dates waiting to be confirmed, the last event, the hub arrival, what the
 * customer was last told and the boxes' free time clocks on `today`. Six reads for all of them
 * together, whoever asks (Needs Attention, Shipments → Managers), so both judge by the same facts.
 */
export async function attentionFactsOf(shipments: readonly (AttentionShipment & { id: string })[], companyId: string, today: string): Promise<Map<string, AttentionFacts>> {
  const ids = shipments.map((s) => s.id);
  const [proposed, latest, hub, notices, boxes, clockEvents] = await Promise.all([
    shipmentTrackingEventRepository.proposedOn(ids, companyId),
    shipmentTrackingEventRepository.latestPerShipment(ids, companyId),
    shipmentTrackingEventRepository.arrivedAtHub(ids, companyId),
    shipmentCustomerNoticeRepository.latestPerShipment(ids, companyId),
    containerRepository.withFreeTime(ids, companyId),
    shipmentTrackingEventRepository.ofKinds(ids, companyId, CLOCK_EVENT_KINDS),
  ]);
  // Each shipment's rows, in the order they were read.
  const byShipment = <R extends { shipmentId: string }>(rows: readonly R[]) => {
    const map = new Map<string, R[]>();
    for (const row of rows) {
      const list = map.get(row.shipmentId) ?? [];
      list.push(row);
      map.set(row.shipmentId, list);
    }
    return map;
  };
  const proposedOf = byShipment(proposed);
  const boxesOf = byShipment(boxes);
  const clockEventsOf = byShipment(clockEvents);
  return new Map(
    shipments.map((s): [string, AttentionFacts] => [
      s.id,
      {
        proposed: proposedOf.get(s.id) ?? [],
        lastEventDay: latest.get(s.id)?.occurredOn ?? null,
        arrivedAtHub: hub.has(s.id),
        lastNotice: notices.get(s.id) ?? null,
        clocks: clockApplies(s)
          ? (boxesOf.get(s.id) ?? []).filter((b) => b.containerNumber).map((b) => ({ containerNumber: b.containerNumber, clock: clockOf(b, clockEventsOf.get(s.id) ?? [], today) }))
          : [],
      },
    ]),
  );
}

class TrackingAttentionService {
  /** The company's active shipments whose dates need a look, those with something urgent first. */
  async list(companyId: string, now = new Date()): Promise<{ items: TrackingAttentionItem[]; capped: boolean }> {
    const rows = await shipmentRepository.trackingAttentionCandidates(companyId, TRACKING_ATTENTION_LIMIT + 1);
    const shipments = rows.slice(0, TRACKING_ATTENTION_LIMIT);
    const today = businessDay(now);
    const facts = await attentionFactsOf(shipments, companyId, today);
    const items = shipments.flatMap((s): TrackingAttentionItem[] => {
      const flags = attentionFlags(s, facts.get(s.id)!, today);
      if (flags.length === 0) return [];
      const { id, jobNumber, customerId, customer, tradeDirection, status } = s;
      return [{ id, jobNumber, customerId, customer, tradeDirection, status, flags }];
    });
    items.sort((a, b) => Number(b.flags[0]!.severity === "urgent") - Number(a.flags[0]!.severity === "urgent") || a.jobNumber.localeCompare(b.jobNumber));
    return { items, capped: rows.length > TRACKING_ATTENTION_LIMIT };
  }
}

export const trackingAttentionService = new TrackingAttentionService();
