import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { iso } from "../../../lib/db/serialize";
import type { FileContent } from "../../../lib/fileContent";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import type { DocumentChangeRequestItem } from "../interfaces/interfaces";
import { attachmentContentUrl, companyOfDocumentChangeToken, documentChangeContentUrl } from "../lib/contentToken";
import { canManageDocuments } from "../lib/documentRules";
import { DocumentNoLongerApproved, documentChangeRequestRepository as requests, type DocumentChangeRequestRow } from "../repositories/documentChangeRequest.repository";
import { shipmentAttachmentRepository as attachments } from "../repositories/shipmentAttachment.repository";
import { attachmentBucket } from "../storage/attachmentBucket";
import { commentService } from "./comment.service";

const MAX_TEXT = 1000;
const MIN_REASON = 3;
const HISTORY_DAYS = 30;
const SEEN_KEEP_DAYS = 7;
const LIST_LIMIT = 200;
const DAY_MS = 86_400_000;
const DOCUMENT_CHANGED = "The document has changed since this was asked: reject the request instead";

const toItem = (r: DocumentChangeRequestRow): DocumentChangeRequestItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  jobNumber: r.jobNumber ?? "",
  customer: r.customer,
  attachmentId: r.attachmentId,
  fileName: r.fileName,
  documentType: r.documentType,
  fileUrl: attachmentContentUrl(r.shipmentId, r.attachmentId, r.companyId),
  newFileName: r.newFileName,
  newFileSize: r.newFileSize,
  // Only while it waits: once answered the new file is the document, or gone.
  newFileUrl: r.status === "pending" ? documentChangeContentUrl(r.id, r.companyId) : null,
  reason: r.reason,
  status: r.status,
  requestedById: r.requestedById,
  requestedByName: r.requestedByName,
  requestedAt: iso(r.requestedAt),
  decidedByName: r.decidedByName,
  decidedAt: r.decidedAt ? iso(r.decidedAt) : null,
  comment: r.comment,
  answerSeenAt: r.answerSeenAt ? iso(r.answerSeenAt) : null,
});

// The name a request keeps of who asked or answered; a failed look-up doesn't stop the request.
async function nameOf(userId: string): Promise<string> {
  try {
    const { users } = await auth.userLookup({ ids: [userId] });
    return users[0]?.name ?? "";
  } catch (err) {
    log.warn(err, "document change request: user not resolved", { userId });
    return "";
  }
}

// A stored file nothing refers to any more: a failure only leaves it unused.
async function discard(storageKey: string, id: string): Promise<void> {
  try {
    await attachmentBucket.remove(storageKey);
  } catch (err) {
    log.warn(err, "document change request: the new file could not be removed", { id });
  }
}

export interface DocumentChangeInput {
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64: string;
  reason: string;
}

class DocumentChangeRequestService {
  /** Anyone of the company asks about an approved document: the request goes to the managers. */
  async ask(actor: Actor, shipmentId: string, attachmentId: string, input: DocumentChangeInput): Promise<DocumentChangeRequestItem> {
    const reason = input.reason.trim();
    if (reason.length < MIN_REASON) throw APIError.invalidArgument("Say why the document has to change");
    if (reason.length > MAX_TEXT) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_TEXT} characters)`);
    if (!input.contentBase64) throw APIError.invalidArgument("Attach the new file");
    const document = isUuid(attachmentId) ? await attachments.getForShipment(attachmentId, shipmentId, actor.companyID) : null;
    if (!document) throw APIError.notFound("Document not found");
    if (document.customsStatus !== "approved") throw APIError.failedPrecondition("Only a document customs has approved needs a request");
    const waiting = "A request to change this document is already waiting";
    if (await requests.isWaiting(attachmentId, actor.companyID)) throw APIError.alreadyExists(waiting);

    const newStorageKey = `${shipmentId}/${randomUUID()}`;
    await attachmentBucket.upload(newStorageKey, Buffer.from(input.contentBase64, "base64"), {
      contentType: input.fileType || "application/octet-stream",
    });
    // The file goes up first; a request that then can't be stored takes it away again.
    const created = await requests.create({
      companyId: actor.companyID,
      shipmentId,
      attachmentId,
      fileName: document.fileName,
      documentType: document.documentType,
      newFileName: input.fileName,
      newFileType: input.fileType,
      newFileSize: input.fileSize,
      newStorageKey,
      reason,
      requestedById: actor.userID,
      requestedByName: await nameOf(actor.userID),
    }).catch(async (err: unknown) => {
      await discard(newStorageKey, attachmentId);
      throw err;
    });
    if (!created) {
      await discard(newStorageKey, attachmentId);
      throw APIError.alreadyExists(waiting);
    }
    // The shipment's chat and the managers' notifications are told. The request itself is what
    // counts, and it is on the Approvals tab either way, so a message that can't be posted doesn't undo it.
    try {
      await commentService.postDocumentChangeNotice(shipmentId, actor.companyID, actor.userID, created);
    } catch (err) {
      log.warn(err, "document change request: the message to the shipment's chat could not be posted", { shipmentId });
    }
    return toItem({ ...created, jobNumber: null, customer: "" });
  }

  /** The shipment's requests, newest first, for its documents' rows. */
  async forShipment(actor: Actor, shipmentId: string): Promise<DocumentChangeRequestItem[]> {
    if (!isUuid(shipmentId)) return [];
    return (await requests.listForShipment(shipmentId, actor.companyID)).map(toItem);
  }

  /** The Approvals tab: what waits, and what was answered in the last 30 days. */
  async listForManagers(actor: Actor): Promise<DocumentChangeRequestItem[]> {
    if (!canManageDocuments(actor.role)) throw APIError.permissionDenied("Only a manager answers these requests");
    const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS);
    return (await requests.listForManagers(actor.companyID, since, LIST_LIMIT)).map(toItem);
  }

  /**
   * A manager answers. Approved, the new file becomes the document, at pending for customs; the
   * approved one leaves the lists but its file is kept. Only while it still is what was asked
   * about: the answer and the swap are one transaction, so two managers can't both answer and a
   * failed swap leaves the request waiting. Rejected, a reason is required and the new file goes,
   * once the answer is stored.
   */
  async decide(actor: Actor, id: string, input: { approve: boolean; comment?: string }): Promise<DocumentChangeRequestItem> {
    if (!canManageDocuments(actor.role)) throw APIError.permissionDenied("Only a manager answers these requests");
    const comment = (input.comment ?? "").trim();
    if (comment.length > MAX_TEXT) throw APIError.invalidArgument(`The comment is too long (at most ${MAX_TEXT} characters)`);
    if (!input.approve && comment.length < MIN_REASON) throw APIError.invalidArgument("Say why the request is rejected");

    const request = isUuid(id) ? await requests.get(id, actor.companyID) : null;
    if (!request) throw APIError.notFound("Request not found");
    if (request.status !== "pending") throw APIError.failedPrecondition("This request has already been answered");
    if (input.approve) {
      const document = await attachments.getForShipment(request.attachmentId, request.shipmentId, actor.companyID);
      if (document?.customsStatus !== "approved") throw APIError.failedPrecondition(DOCUMENT_CHANGED);
    }

    const decision = { decidedById: actor.userID, decidedByName: await nameOf(actor.userID), decidedAt: new Date(), comment };
    let answered;
    if (input.approve) {
      try {
        answered = await requests.approveWithSwap(
          id,
          actor.companyID,
          decision,
          { attachmentId: request.attachmentId, shipmentId: request.shipmentId },
          {
            fileName: request.newFileName,
            fileSize: request.newFileSize,
            fileType: request.newFileType,
            storageKey: request.newStorageKey,
            documentType: request.documentType,
            uploadedById: request.requestedById,
          },
        );
      } catch (err) {
        if (err instanceof DocumentNoLongerApproved) throw APIError.failedPrecondition(DOCUMENT_CHANGED);
        throw err;
      }
    } else {
      answered = await requests.answer(id, actor.companyID, { status: "rejected", ...decision });
    }
    if (!answered) throw APIError.failedPrecondition("This request has already been answered");
    if (!input.approve) await discard(request.newStorageKey, id);
    return toItem({ ...answered, jobNumber: request.jobNumber, customer: request.customer });
  }

  /** The bytes of a waiting new file, for the link a manager previews it by. */
  async getContent(id: string, token: string | null): Promise<FileContent | null> {
    const companyId = companyOfDocumentChangeToken(token, id);
    if (!companyId || !isUuid(id)) return null;
    const request = await requests.get(id, companyId);
    if (!request || request.status !== "pending") return null;
    try {
      const buffer = await attachmentBucket.download(request.newStorageKey);
      return { fileName: request.newFileName, fileType: request.newFileType, buffer };
    } catch (err) {
      log.warn(err, "document change request: the new file is missing from storage", { id });
      return null;
    }
  }

  /** The bell: answers to the user's own requests, not opened yet or opened in the last 7 days. */
  async myAnswers(actor: Actor): Promise<DocumentChangeRequestItem[]> {
    const seenSince = new Date(Date.now() - SEEN_KEEP_DAYS * DAY_MS);
    return (await requests.answersFor(actor.companyID, actor.userID, seenSince, LIST_LIMIT)).map(toItem);
  }

  async markSeen(actor: Actor, id: string): Promise<void> {
    if (isUuid(id)) await requests.markSeen(id, actor.companyID, actor.userID, new Date());
  }
}

export const documentChangeRequestService = new DocumentChangeRequestService();
