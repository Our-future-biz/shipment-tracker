import { businessDay } from "../../../lib/businessDate";
import type { TrackingAttentionItem } from "../interfaces/interfaces";
import { attentionFlags } from "../lib/trackingAttention";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentCustomerNoticeRepository } from "../repositories/shipmentCustomerNotice.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";

/** How many shipments are looked at, the newest first; the answer says when there were more. */
export const TRACKING_ATTENTION_LIMIT = 1000;

class TrackingAttentionService {
  /** The company's active shipments whose dates need a look, those with something urgent first. */
  async list(companyId: string, now = new Date()): Promise<{ items: TrackingAttentionItem[]; capped: boolean }> {
    const rows = await shipmentRepository.trackingAttentionCandidates(companyId, TRACKING_ATTENTION_LIMIT + 1);
    const shipments = rows.slice(0, TRACKING_ATTENTION_LIMIT);
    const ids = shipments.map((s) => s.id);
    const [proposed, latest, hub, notices] = await Promise.all([
      shipmentTrackingEventRepository.proposedOn(ids, companyId),
      shipmentTrackingEventRepository.latestPerShipment(ids, companyId),
      shipmentTrackingEventRepository.arrivedAtHub(ids, companyId),
      shipmentCustomerNoticeRepository.latestPerShipment(ids, companyId),
    ]);
    const today = businessDay(now);
    const items = shipments.flatMap((s): TrackingAttentionItem[] => {
      const flags = attentionFlags(
        s,
        {
          proposed: proposed.filter((p) => p.shipmentId === s.id),
          lastEventDay: latest.get(s.id)?.occurredOn ?? null,
          arrivedAtHub: hub.has(s.id),
          lastNotice: notices.get(s.id) ?? null,
        },
        today,
      );
      if (flags.length === 0) return [];
      const { id, jobNumber, customerId, customer, tradeDirection, status } = s;
      return [{ id, jobNumber, customerId, customer, tradeDirection, status, flags }];
    });
    items.sort((a, b) => Number(b.flags[0]!.severity === "urgent") - Number(a.flags[0]!.severity === "urgent") || a.jobNumber.localeCompare(b.jobNumber));
    return { items, capped: rows.length > TRACKING_ATTENTION_LIMIT };
  }
}

export const trackingAttentionService = new TrackingAttentionService();
