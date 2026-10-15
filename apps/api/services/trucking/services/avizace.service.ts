import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { appendEvent } from "../repositories/event.repository";
import type { ConsignmentDetail } from "../interfaces/interfaces";
import type { AvizaceTemplate } from "../interfaces/avizace.interfaces";
import type { Actor } from "../../../lib/rbac";
import { avizaceTemplate, cleanAvizace, type AvizaceInput } from "../lib/avizaceRules";
import { userName } from "../lib/users";
import { CONSIGNMENT_CONFLICT, consignmentService } from "./consignment.service";

// Avizace (announcing a delivery to the consignee): e-mail sending is off, so the app prepares the
// text (Czech and English) to copy, and staff record how and when they told the consignee. A
// delivery run / FTL trip warns while a delivery on it needs one and none is recorded.

class AvizaceService {
  /** Any user: the text to copy. */
  async template(actor: Actor, id: string): Promise<AvizaceTemplate> {
    const { c } = await consignmentService.load(actor.companyID, id);
    return avizaceTemplate(c);
  }

  /** Any user: records the avizace given (a later record replaces it; the event of each stays). */
  async record(actor: Actor, id: string, input: AvizaceInput): Promise<ConsignmentDetail> {
    const { c } = await consignmentService.load(actor.companyID, id);
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    const by = await userName(actor.userID);
    const avizace = cleanAvizace(input, new Date(), by);
    await inTx(async (tx) => {
      const row = await consignmentRepository.update(tx, actor.companyID, c.id, { avizace }, { version: c.version, live: true });
      if (!row) throw APIError.aborted(CONSIGNMENT_CONFLICT);
      const window = avizace.agreedFrom || avizace.agreedTo ? `, window ${[avizace.agreedFrom, avizace.agreedTo].filter(Boolean).join(" – ")}` : "";
      await appendEvent(tx, actor.companyID, {
        kind: "avizace_recorded",
        consignmentId: c.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: { avizace: { before: c.avizace, after: avizace } },
          summary: `Avizace given by ${avizace.channel.toLowerCase()} to ${avizace.contact}${window}`,
        },
      });
    });
    return consignmentService.get(actor, id);
  }
}

export const avizaceService = new AvizaceService();
