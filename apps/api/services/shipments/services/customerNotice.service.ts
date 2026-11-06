import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { LOGGED_NOTICE_KINDS, NOTICE_KINDS, TICK_NOTICES, communicationLogText, datesToTell, isNoticeChannel, isNoticeKind, noteTypeOf, type NoticeChannel, type NoticeKind } from "../lib/customerNotice";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentCustomerNoticeRepository } from "../repositories/shipmentCustomerNotice.repository";
import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";
import type { ShipmentCustomerNoticeRecord } from "../schemas/shipmentCustomerNotice.schema";
import type { ShipmentRecord } from "../schemas/shipment.schema";

export interface CustomerNoticeInput {
  kind: string;
  channel: string;
  toldTo?: string;
  subject?: string;
  note?: string;
  /** The checklist tick this notice comes with. */
  taskKey?: string;
}

class CustomerNoticeService {
  /**
   * Somebody says the customer was told. Their word is what is recorded, as "Mark as sent" is for
   * a quote: the message itself goes out from their own mail program or by phone. The notice keeps
   * a copy of the dates as they stand, which is what later moves are measured against.
   */
  async record(shipmentId: string, companyId: string, userId: string, input: CustomerNoticeInput): Promise<ShipmentCustomerNoticeRecord> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound("Shipment not found");
    if (!isNoticeKind(input.kind)) throw APIError.invalidArgument(`"${input.kind}" is no kind of notice`);
    if (!isNoticeChannel(input.channel)) throw APIError.invalidArgument("Say how the customer was told");
    if (input.taskKey !== undefined && TICK_NOTICES[input.taskKey] !== input.kind) throw APIError.invalidArgument("That task doesn't go with this notice");

    const toldTo = (input.toldTo ?? "").trim();
    const row = await shipmentCustomerNoticeRepository.createForCompany(companyId, {
      shipmentId,
      kind: input.kind,
      channel: input.channel,
      toldTo,
      subject: (input.subject ?? "").trim(),
      note: (input.note ?? "").trim(),
      ...datesToTell(shipment),
      toldById: userId,
    });
    if (input.taskKey) await shipmentTaskRepository.upsert(shipmentId, companyId, input.taskKey, true, userId);
    await this.logWithCustomer(shipment, input.kind, input.channel, toldTo);
    return row;
  }

  // Sales' "Last contact" becomes true for what matters to them (D13). The notice stands either way:
  // a Customer Database that can't be reached must not make the user tell the customer twice.
  private async logWithCustomer(shipment: ShipmentRecord, kind: NoticeKind, channel: NoticeChannel, toldTo: string): Promise<void> {
    if (!shipment.customerId || !LOGGED_NOTICE_KINDS.has(kind)) return;
    try {
      await customers._internalNoteFromShipment({
        customerId: shipment.customerId,
        type: noteTypeOf(channel),
        content: communicationLogText(kind, shipment.jobNumber, toldTo, datesToTell(shipment)),
      });
    } catch (err) {
      log.warn(err, `tracking: "${NOTICE_KINDS[kind]}" did not reach the Communication log`, { shipmentId: shipment.id });
    }
  }
}

export const customerNoticeService = new CustomerNoticeService();
