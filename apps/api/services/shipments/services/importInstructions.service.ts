import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { appUrl } from "../../../lib/appUrl";
import { userEmailOf } from "../../../lib/companyUsers";
import { isUuid } from "../../../lib/uuid";
import type { ImportInstructionAnswers, ImportInstructionState, ImportInstructionWaiting, PublicImportInstructionForm } from "../interfaces/importInstructions";
import { hashLinkToken, looksLikeLinkToken, newLinkToken } from "../lib/customerLink";
import { isListedCustomsOffice } from "../lib/customsOffice";
import { IMPORT_DOCUMENT_TYPE, IMPORT_LINK_DAYS, IMPORT_LINK_INVALID, answersProblem, changedAnswers, fieldsToFill, importInstructionsUrl, mayAskImportInstructions, normalizeAnswers } from "../lib/importInstructions";
import { importInstructionsPdf } from "../lib/importInstructionsPdf";
import { DETAILS_REFUSAL, isDetailsManager, isOpenToPerson } from "../lib/shipmentEditRule";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentImportInstructionRepository as repository } from "../repositories/shipmentImportInstruction.repository";
import type { ShipmentImportInstructionRecord } from "../schemas/shipmentImportInstruction.schema";
import { attachmentService } from "./attachment.service";
import { shipmentService } from "./shipment.service";

// A customer fills in the Import Instructions through a link created in Shipments → Warehouse: one use,
// 14 days, sent by the colleague themself. Approving fills the shipment's details, so the link is created,
// cancelled and answered by whoever may change them (lib/shipmentEditRule: its Person in Charge, its Holiday
// Cover or a manager). The completed form waits for them; they may edit it, and approve or reject it. Only
// an approved form reaches the shipment: it fills fields still empty, and its PDF goes to the shipment's
// Documents. What the customer sent is kept as sent; what was approved is kept beside it.

interface Actor {
  companyID: string;
  userID: string;
  role: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REASON = 3;
const invalid = () => APIError.notFound(IMPORT_LINK_INVALID);

const iso = (at: Date | null) => at?.toISOString() ?? null;
const addressText = (a: { street: string; postalCode: string; city: string; country: string }) => [a.street, [a.postalCode, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");

class ImportInstructionsService {
  private async requireShipment(shipmentId: string, companyId: string) {
    if (!isUuid(shipmentId)) throw APIError.notFound("Shipment not found");
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound("Shipment not found");
    return shipment;
  }

  /** Whoever may change the shipment's details; whether they created the link doesn't matter. */
  private canAnswer(shipment: { personInCharge: string; holidayCover: string }, actor: Actor): Promise<boolean> {
    return shipmentService.mayChangeDetails(shipment, actor.userID, actor.role);
  }

  /**
   * The shipment's latest form; whether the shipment is one to ask (an import), and whether this user may
   * create, cancel and answer its links (whoever may change its details).
   */
  async get(shipmentId: string, actor: Actor, now = new Date()): Promise<{ state: ImportInstructionState | null; askable: boolean; canAsk: boolean }> {
    const shipment = await this.requireShipment(shipmentId, actor.companyID);
    const row = await repository.latest(shipmentId, actor.companyID);
    const askable = mayAskImportInstructions(shipment.tradeDirection);
    const canAsk = await this.canAnswer(shipment, actor);
    if (!row || row.status === "cancelled") return { state: null, askable, canAsk };
    return {
      askable,
      canAsk,
      state: {
        status: row.status,
        expired: row.status === "open" && row.expiresAt.getTime() <= now.getTime(),
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        submittedAt: iso(row.submittedAt),
        answers: row.answers,
        approvedAnswers: row.approvedAnswers,
        changes: row.answers && row.approvedAnswers ? changedAnswers(normalizeAnswers(row.answers), normalizeAnswers(row.approvedAnswers)) : [],
        decidedBy: row.decidedBy,
        decidedAt: iso(row.decidedAt),
        reason: row.reason,
        canAnswer: canAsk,
        onShipment: { customsProcedure: shipment.customsProcedure, customsOffice: shipment.customsOffice, hsCode: shipment.hsCode, deliveryAddress: shipment.deliveryAddress },
      },
    };
  }

  // What we know already. Not knowing the customer's details isn't worth failing the link for.
  private async prefillOf(shipment: { cargoDescription: string; deliveryAddress: string; customerId: string | null }): Promise<Partial<ImportInstructionAnswers>> {
    const known: Partial<ImportInstructionAnswers> = { description: shipment.cargoDescription, deliveryAddress: shipment.deliveryAddress };
    if (!shipment.customerId) return known;
    try {
      const [detail, addresses] = await Promise.all([customers.customerGet({ id: shipment.customerId }), customers.addressList({ customerId: shipment.customerId })]);
      const { customer } = detail;
      const billing = addresses.data.find((a) => a.types.includes("Billing")) ?? addresses.data.find((a) => a.types.includes("Registered"));
      return { ...known, companyId: customer.ico, vatId: customer.dic, billingAddress: billing ? addressText(billing) : customer.registeredAddress };
    } catch (err) {
      log.warn(err, "import instructions: the customer's details could not be read");
      return known;
    }
  }

  /** A new link, in place of one not filled in yet. The answer is the only time the URL is known. */
  async createLink(shipmentId: string, actor: Actor, now = new Date()): Promise<{ url: string }> {
    const shipment = await this.requireShipment(shipmentId, actor.companyID);
    await shipmentService.requireDetailsEditor(shipmentId, actor);
    if (!mayAskImportInstructions(shipment.tradeDirection)) throw APIError.failedPrecondition("Import Instructions are for import shipments");
    const latest = await repository.latest(shipmentId, actor.companyID);
    if (latest?.status === "submitted") throw APIError.failedPrecondition("The customer's Import Instructions wait for an answer: approve or reject them first");
    if (latest?.status === "approved") throw APIError.failedPrecondition("The Import Instructions of this shipment are already approved");
    const { token, hash } = newLinkToken();
    const created = await repository.replaceOpen({
      companyId: actor.companyID,
      shipmentId,
      tokenHash: hash,
      prefill: await this.prefillOf(shipment),
      createdBy: await userEmailOf(actor.userID),
      createdByUserId: actor.userID,
      expiresAt: new Date(now.getTime() + IMPORT_LINK_DAYS * DAY_MS),
    });
    if (!created) throw APIError.failedPrecondition("The Import Instructions of this shipment changed meanwhile: reload to see them");
    return { url: importInstructionsUrl(appUrl(), token) };
  }

  async cancelLink(shipmentId: string, actor: Actor): Promise<void> {
    const shipment = await this.requireShipment(shipmentId, actor.companyID);
    if (!(await this.canAnswer(shipment, actor))) throw APIError.permissionDenied(DETAILS_REFUSAL);
    if (!(await repository.cancelOpen(shipmentId, actor.companyID))) throw APIError.failedPrecondition("There is no open link to cancel");
  }

  private async waiting(shipmentId: string, actor: Actor) {
    const shipment = await this.requireShipment(shipmentId, actor.companyID);
    const row = await repository.latest(shipmentId, actor.companyID);
    if (!row || row.status !== "submitted") throw APIError.failedPrecondition("These Import Instructions no longer wait for an answer");
    if (!(await this.canAnswer(shipment, actor))) throw APIError.permissionDenied(DETAILS_REFUSAL);
    return { row, shipment };
  }

  /**
   * The answers as edited here reach the shipment: empty fields are filled, and the PDF goes to Documents.
   * What the customer sent stays as sent; the PDF shows it, and what was changed before approving.
   */
  async approve(shipmentId: string, actor: Actor, edited: Partial<ImportInstructionAnswers>, now = new Date()): Promise<void> {
    const { row, shipment } = await this.waiting(shipmentId, actor);
    const answers = normalizeAnswers(edited);
    const problem = answersProblem(answers, isListedCustomsOffice);
    if (problem) throw APIError.invalidArgument(problem);
    const sent = normalizeAnswers(row.answers ?? answers);
    const by = await userEmailOf(actor.userID);
    const pdf = await importInstructionsPdf(sent, {
      reference: shipment.jobNumber,
      confirmedAt: (row.submittedAt ?? now).toISOString().slice(0, 16).replace("T", " "),
      approvedBy: by,
      changes: changedAnswers(sent, answers),
    });
    if (!(await repository.decide(row.id, { status: "approved", by, reason: "", approvedAnswers: answers }, now))) throw APIError.failedPrecondition("These Import Instructions no longer wait for an answer");
    try {
      // Read again just before the write: a field filled in meanwhile stays as it was filled.
      const fill = fieldsToFill(await this.requireShipment(shipmentId, actor.companyID), answers);
      if (Object.keys(fill).length) await shipmentService.update(shipmentId, actor.companyID, fill, actor.userID, actor.role);
      await attachmentService.addFromModule(
        shipmentId,
        actor.companyID,
        { fileName: `Import Instructions ${shipment.jobNumber}.pdf`, fileType: "application/pdf", contentBase64: Buffer.from(pdf).toString("base64"), documentType: IMPORT_DOCUMENT_TYPE, sourceRef: `import-instructions:${row.id}` },
        actor.userID,
      );
    } catch (err) {
      await repository.reopen(row.id);
      throw err;
    }
  }

  /** Nothing reaches the shipment; a new link can be created. */
  async reject(shipmentId: string, actor: Actor, reason: string, now = new Date()): Promise<void> {
    const why = reason.trim();
    if (why.length < MIN_REASON) throw APIError.invalidArgument("Say why they are rejected");
    const { row } = await this.waiting(shipmentId, actor);
    if (!(await repository.decide(row.id, { status: "rejected", by: await userEmailOf(actor.userID), reason: why }, now))) throw APIError.failedPrecondition("These Import Instructions no longer wait for an answer");
  }

  /**
   * The bell: completed forms the user created, or whose shipment names them as Person in Charge or
   * Holiday Cover; only those they may answer (a creator who is no longer named doesn't get theirs).
   */
  async waitingFor(actor: Actor): Promise<ImportInstructionWaiting[]> {
    const email = await userEmailOf(actor.userID);
    const rows = await repository.waitingFor(actor.companyID, actor.userID, email);
    return rows
      .filter((r) => isDetailsManager(actor.role) || isOpenToPerson(r, email))
      .map((r) => ({ shipmentId: r.shipmentId, jobNumber: r.jobNumber, submittedAt: iso(r.submittedAt) ?? "", filledBy: r.answers?.name ?? "" }));
  }

  // ─── The public side: the token is the only key, and every link that doesn't open answers alike ───

  private async openRow(token: string, now: Date): Promise<ShipmentImportInstructionRecord> {
    if (!looksLikeLinkToken(token)) throw invalid();
    const row = await repository.byHash(hashLinkToken(token));
    if (!row || row.status !== "open" || row.expiresAt.getTime() <= now.getTime()) throw invalid();
    return row;
  }

  async publicForm(token: string, now = new Date()): Promise<PublicImportInstructionForm> {
    const row = await this.openRow(token, now);
    const shipment = await shipmentRepository.getByIdForCompany(row.shipmentId, row.companyId);
    if (!shipment) throw invalid();
    return { reference: shipment.jobNumber, prefill: row.prefill };
  }

  async submit(token: string, input: { confirmed: boolean; answers: Partial<ImportInstructionAnswers> }, now = new Date()): Promise<void> {
    if (input.confirmed !== true) throw APIError.invalidArgument("Confirm that the instructions are correct");
    const row = await this.openRow(token, now);
    // A shipment deleted meanwhile has nobody to read it.
    if (!(await shipmentRepository.getByIdForCompany(row.shipmentId, row.companyId))) throw invalid();
    const answers = normalizeAnswers(input.answers);
    const problem = answersProblem(answers, isListedCustomsOffice);
    if (problem) throw APIError.invalidArgument(problem);
    if (!(await repository.submit(row.id, answers, now))) throw invalid();
  }
}

export const importInstructionsService = new ImportInstructionsService();
