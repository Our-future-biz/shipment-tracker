import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth, shipments } from "~encore/clients";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { reweighRepository } from "../repositories/reweigh.repository";
import { gateExceptionRepository } from "../repositories/gateException.repository";
import { gateFileRepository } from "../repositories/gateFile.repository";
import { settingsRepository } from "../repositories/settings.repository";
import { gateFileBucket } from "../storage/gateFileBucket";
import type { GateFileRecord } from "../schemas/gateFile.schema";
import type { SupplierEmailAttachment, WarehouseSupplierEmailRecord } from "../schemas/warehouseSettings.schema";
import type { SupplierEmailItem, SupplierEmailPreview } from "../interfaces/settings.interfaces";
import type { WarehouseSectionRecord } from "../schemas/warehouseSection.schema";
import { warehouseService } from "./warehouse.service";
import { settingsService } from "./settings.service";
import { activeRecipients, SUPPLIER_KIND_LABEL, SUPPLIER_KINDS, type SupplierKind } from "./settingsRules";
import { sendMail, type MailAttachment } from "../../../lib/email";
import { emailSubject, emailText, pickAttachments, type EmailContent, type EmailFiles, type EmailPosition, type EmailRemeasureLine, type EmailTotals } from "./emailCompose";
import { needsReweigh } from "./reweigh";
import { remeasureTotals } from "./remeasure";
import { checkRequestId } from "./offline";
import { inputMessage } from "./inputError";

// "Send VGM" / "Send survey" / "Send remeasurement": e-mails the supplier what the warehouse
// recorded, to the recipients set in Warehouse settings, and only then marks it as sent.
//
//   not set up   the type is off or has no To address → refused ("recorded only"); the screen
//                keeps "Mark as sent" (record only) for it.
//   attempt      written "sending" before the provider is called; set "sent" in the same
//                transaction that marks the section as sent and logs History, or "failed" (and
//                History says why) — a failed send is never marked as sent.
//   once         the client's request id is unique (a double click or a replay sends once) and
//                a second send of the same position + type waits until the first one finished.
//   files        Survey: the position's photos, newest first. VGM: the scale photos of the latest
//                re-weigh. Remeasurement: none. At most 5 files / 10 MB attached; the rest as
//                download links (7 days) or, when no link can be made, named.

const MAX_NOTE = 2_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A "sending" attempt older than this never finished (the provider call times out after 20 s). */
export const SENDING_STALE_MS = 2 * 60_000;
const LINK_DAYS = 7;
const MAX_LINKS = 20;
const SHIPMENT_BUDGET_MS = 3_000;
const NOT_SET_UP = "Not set up — recorded only; set recipients in Warehouse settings to e-mail it";

type Sender = { name: string; email: string };

/** The e-mail went out but marking it as sent failed (the screen offers no Retry then). */
const sentNotRecorded = (label: string) => `${label} was e-mailed, but marking it as sent failed — do not send it again; reload and use "Mark as sent" to record it`;

async function sender(userId: string): Promise<Sender> {
  try {
    const { users } = await auth.usersList();
    const me = users.find((u) => u.id === userId);
    return { name: me?.displayName || me?.email || "", email: me?.email || "" };
  } catch {
    return { name: "", email: "" };
  }
}

const isImage = (f: GateFileRecord) => /^image\//i.test(f.fileType) || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.fileName);

const numOf = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// What the shipment declares: pieces, total weight (t → kg), volume; missing totals from its cargo
// dimension lines. null when it declares nothing or does not answer in time.
async function declaredTotals(shipmentId: string | null): Promise<EmailTotals | null> {
  if (!shipmentId) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const s = await Promise.race([
      shipments.shipmentGet({ shipmentId }).then((r) => r.shipment),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SHIPMENT_BUDGET_MS);
      }),
    ]);
    if (!s) return null;
    const dims = (s.cargoDimensions ?? []).reduce(
      (a, d) => {
        const n = numOf(d.pieces);
        return { pieces: a.pieces + n, kg: a.kg + n * numOf(d.weightPerPcKg), cbm: a.cbm + (n * numOf(d.lengthCm) * numOf(d.widthCm) * numOf(d.heightCm)) / 1_000_000 };
      },
      { pieces: 0, kg: 0, cbm: 0 },
    );
    const pieces = numOf(s.pcs) || dims.pieces;
    const kg = numOf(s.totalWeightTons) ? Math.round(numOf(s.totalWeightTons) * 1000 * 10) / 10 : Math.round(dims.kg * 10) / 10;
    const cbm = numOf(s.totalVolumeCbm) || Math.round(dims.cbm * 1000) / 1000;
    return pieces || kg || cbm ? { pieces, kg, cbm } : null;
  } catch (err) {
    log.warn("warehouse: declared figures for the remeasurement e-mail not read from the shipment", { shipmentId, error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sectionData = (row: WarehouseSectionRecord | null): Record<string, unknown> =>
  row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};

function remeasureLines(raw: unknown): EmailRemeasureLine[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw || "[]");
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) => ({ pieces: numOf(r.pieces), lengthCm: numOf(r.lengthCm), widthCm: numOf(r.widthCm), heightCm: numOf(r.heightCm), weightPerPcKg: numOf(r.weightPerPcKg) }));
}

function positionOf(ref: string, m: GateMovementRow | null): EmailPosition {
  return {
    wczRef: ref,
    jobNumber: m?.jobNumber ?? "",
    customer: m?.customer ?? "",
    containerNumber: m?.containerNumber ?? "",
    sealNumber: m?.sealNumber ?? "",
    bookingNumber: m?.bookingNumber ?? "",
    hblNumber: m?.hblNumber ?? "",
    colli: m?.colli ?? 0,
    packing: m?.packing ?? "",
    weightKg: m?.weightKg ?? 0,
    measureCbm: m?.measureCbm ?? 0,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function attemptItem(r: WarehouseSupplierEmailRecord, now = Date.now()): SupplierEmailItem {
  const stale = r.status === "sending" && now - r.createdAt.getTime() > SENDING_STALE_MS;
  return {
    id: r.id,
    kind: r.kind,
    to: r.toAddresses,
    cc: r.ccAddresses,
    subject: r.subject,
    attachments: r.attachments,
    note: r.note,
    status: stale ? "unknown" : r.status,
    error: stale ? "The send never finished — check the mailbox before sending again" : r.error,
    requestedBy: r.requestedByName,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
  };
}

interface Prepared {
  kind: SupplierKind;
  task: { id: string; ref: string; shipmentId: string | null };
  movement: GateMovementRow | null;
  to: string[];
  cc: string[];
  subject: string;
  content: EmailContent;
  position: EmailPosition;
  attach: GateFileRecord[];
  rest: GateFileRecord[];
  photoCount: number;
}

class EmailSupplierService {
  // Everything a send of `kind` needs, read now; refused when the type is not set up.
  private async prepare(taskId: string, what: string, companyId: string): Promise<Prepared> {
    if (!(SUPPLIER_KINDS as readonly string[]).includes(what)) throw APIError.invalidArgument(`What to send must be one of: ${SUPPLIER_KINDS.join(", ")}`);
    const kind = what as SupplierKind;
    if (!UUID.test(taskId)) throw APIError.notFound("Warehouse position not found");
    const task = await warehouseTaskRepository.findAny(taskId, companyId);
    if (!task || task.deletedAt) throw APIError.notFound("Warehouse position not found");
    const settings = await settingsService.effective(companyId);
    const rcpt = activeRecipients(settings.supplierEmail, kind);
    if (!rcpt) throw APIError.failedPrecondition(NOT_SET_UP);

    const movementId = await gateMovementRepository.liveIdForTask(task.id, companyId);
    const m = movementId ? await gateMovementRepository.findById(movementId, companyId) : null;
    const files = m ? await gateFileRepository.listForMovement(m.id, companyId) : [];
    const newestFirst = [...files].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const position = positionOf(task.taskId, m);

    let content: EmailContent;
    let candidates: GateFileRecord[] = [];
    let photoCount = 0;
    if (kind === "vgm") {
      const rw = m ? await reweighRepository.latestForMovement(m.id, companyId) : null;
      content = {
        kind,
        needsReweigh: !!m && needsReweigh(m),
        reweigh: rw
          ? {
              weighedKg: rw.weighedKg,
              weighedAt: rw.weighedAt.toISOString(),
              weighedBy: rw.weighedBy,
              declaredKg: rw.declaredKg,
              declaredSource: rw.declaredSource,
              variancePct: rw.variancePct,
              flagged: rw.flagged,
              note: rw.note,
            }
          : null,
      };
      const ids = new Set(rw?.fileIds ?? []);
      candidates = newestFirst.filter((f) => ids.has(f.id));
      photoCount = candidates.length;
    } else if (kind === "survey") {
      const exceptions = m ? await gateExceptionRepository.listForMovements([m.id], companyId) : [];
      content = {
        kind,
        surveys: (m?.surveys ?? []).map((s) => ({
          container: s.container ?? "",
          phase: s.phase ?? "",
          damaged: s.damaged ?? 0,
          lost: s.lost ?? 0,
          lines: (s.lines ?? []).map((l) => ({ qty: l.qty ?? null, outerPacking: l.outerPacking ?? "", visual: l.visual ?? [], inner: l.inner ?? [] })),
          driverNote: s.driverNote ?? "",
          warehouseNote: s.warehouseNote ?? "",
          surveyedAt: s.surveyedAt ?? "",
          surveyedBy: s.surveyedBy ?? "",
        })),
        exceptions: exceptions.map((e) => ({ type: e.type, pieces: e.pieces, status: e.status, container: e.container, note: e.note, resolutionNote: e.resolutionNote })),
      };
      candidates = newestFirst.filter(isImage);
      photoCount = candidates.length;
    } else {
      const section = await warehouseService.getSectionByTask(task.id, "job", companyId);
      const data = sectionData(section);
      const lines = remeasureLines(data.remeasure_rows);
      let totals: EmailTotals = { pieces: 0, kg: 0, cbm: 0 };
      try {
        const t = remeasureTotals(data.remeasure_rows ?? "[]");
        totals = { pieces: t.pieces, kg: t.weightKg, cbm: t.cbm };
      } catch (err) {
        throw APIError.failedPrecondition(`The remeasured lines cannot be e-mailed: ${inputMessage(err, "they cannot be read")} — correct them first`);
      }
      if (!lines.length) throw APIError.failedPrecondition("No remeasured lines are saved for this position — save the lines first");
      content = {
        kind,
        lines,
        totals,
        declared: await declaredTotals(task.shipmentId),
        savedAt: typeof data.remeasure_rows_saved_at === "string" ? data.remeasure_rows_saved_at : "",
      };
    }
    const { attach, rest } = pickAttachments(candidates.map((f) => ({ ...f, name: f.fileName, size: f.fileSize })));
    return {
      kind,
      task: { id: task.id, ref: task.taskId, shipmentId: task.shipmentId },
      movement: m,
      to: rcpt.to,
      cc: rcpt.cc,
      subject: emailSubject(kind, position),
      content,
      position,
      attach,
      rest,
      photoCount: kind === "survey" ? photoCount : attach.length + rest.length,
    };
  }

  private compose(p: Prepared, files: EmailFiles, note: string, from: Sender) {
    return emailText({ position: p.position, content: p.content, files, note, senderName: from.name, signature: process.env.WAREHOUSE_EMAIL_SIGNATURE || "" });
  }

  /** What "Send" would e-mail now (nothing is sent or recorded). */
  async preview(taskId: string, what: string, note: string, companyId: string, userId: string): Promise<SupplierEmailPreview> {
    const p = await this.prepare(taskId, what, companyId);
    const from = await sender(userId);
    const linked = p.rest.slice(0, MAX_LINKS);
    const files: EmailFiles = {
      attached: p.attach.map((f) => f.fileName),
      linked: linked.map((f) => ({ name: f.fileName, url: "(download link made when sent)" })),
      listed: p.rest.slice(MAX_LINKS).map((f) => f.fileName),
      linkDays: LINK_DAYS,
      photoCount: p.photoCount,
    };
    return {
      kind: p.kind,
      to: p.to,
      cc: p.cc,
      subject: p.subject,
      text: this.compose(p, files, (note ?? "").trim(), from),
      attachments: [
        ...p.attach.map((f) => ({ fileId: f.id, fileName: f.fileName, size: f.fileSize, how: "attached" })),
        ...linked.map((f) => ({ fileId: f.id, fileName: f.fileName, size: f.fileSize, how: "linked" })),
        ...p.rest.slice(MAX_LINKS).map((f) => ({ fileId: f.id, fileName: f.fileName, size: f.fileSize, how: "listed" })),
      ],
    };
  }

  /**
   * E-mails it and, only when the provider took it, marks it as sent (the history entry carries
   * the recipients, the attachments and the e-mail id). Returns the saved section and the attempt.
   */
  async send(
    taskId: string,
    what: string,
    rawNote: string,
    rawRequestId: string,
    companyId: string,
    userId: string,
  ): Promise<{ section: WarehouseSectionRecord; email: SupplierEmailItem }> {
    const note = (rawNote ?? "").trim();
    if (note.length > MAX_NOTE) throw APIError.invalidArgument(`The note is too long (at most ${MAX_NOTE} characters)`);
    const requestId = checkRequestId(rawRequestId);
    if (!requestId) throw APIError.invalidArgument("clientRequestId is required (a UUID made once per send)");
    const p = await this.prepare(taskId, what, companyId);
    const label = SUPPLIER_KIND_LABEL[p.kind];
    const from = await sender(userId);

    // Files: attach what fits (a file that cannot be read is linked instead), link the rest.
    const attachments: MailAttachment[] = [];
    const meta: SupplierEmailAttachment[] = [];
    const linkable: GateFileRecord[] = [];
    for (const f of p.attach) {
      try {
        const buf = await gateFileBucket.download(f.storageKey);
        attachments.push({ filename: f.fileName, content: buf.toString("base64") });
        meta.push({ fileId: f.id, fileName: f.fileName, size: f.fileSize, how: "attached" });
      } catch (err) {
        log.warn("warehouse supplier e-mail: file not attached", { fileId: f.id, error: err instanceof Error ? err.message : String(err) });
        linkable.push(f);
      }
    }
    linkable.push(...p.rest);
    const linked: EmailFiles["linked"] = [];
    const listed: string[] = [];
    for (const [i, f] of linkable.entries()) {
      let url = "";
      if (i < MAX_LINKS) {
        try {
          url = (await gateFileBucket.signedDownloadUrl(f.storageKey, { ttl: LINK_DAYS * 24 * 3600 })).url;
        } catch {
          url = "";
        }
      }
      if (url) {
        linked.push({ name: f.fileName, url });
        meta.push({ fileId: f.id, fileName: f.fileName, size: f.fileSize, how: "linked" });
      } else {
        listed.push(f.fileName);
        meta.push({ fileId: f.id, fileName: f.fileName, size: f.fileSize, how: "listed" });
      }
    }
    const text = this.compose(p, { attached: meta.filter((x) => x.how === "attached").map((x) => x.fileName), linked, listed, linkDays: LINK_DAYS, photoCount: p.photoCount }, note, from);

    const { attempt, fresh } = await settingsRepository.startAttempt(
      {
        companyId,
        taskId: p.task.id,
        movementId: p.movement?.id ?? null,
        kind: p.kind,
        toAddresses: p.to,
        ccAddresses: p.cc,
        subject: p.subject,
        attachments: meta,
        note,
        status: "sending",
        requestedBy: userId,
        requestedByName: from.name,
        clientRequestId: requestId,
      },
      SENDING_STALE_MS,
    );
    if (!fresh) {
      if (attempt.clientRequestId !== requestId) {
        throw APIError.aborted(`A ${label} e-mail of this position is being sent right now — wait a moment and reload`);
      }
      // A replay of this very request: answer what it did.
      if (attempt.status === "sent" && attempt.error) throw APIError.internal(sentNotRecorded(label));
      if (attempt.status === "sent") {
        const section = await warehouseService.getSectionByTask(p.task.id, "job", companyId);
        if (section) return { section, email: attemptItem(attempt) };
      }
      if (attempt.status === "failed") throw APIError.unavailable(`${label} not e-mailed: ${attempt.error} — nothing was marked as sent`);
      throw APIError.aborted(`This ${label} e-mail is still being sent — wait a moment and reload`);
    }

    const res = await sendMail({
      to: p.to,
      cc: p.cc,
      replyTo: from.email || undefined,
      subject: p.subject,
      text,
      attachments,
      idempotencyKey: `warehouse-supplier-${attempt.id}`,
    });
    const at = new Date();

    if (!res.sent) {
      await settingsRepository.settle(attempt.id, companyId, { status: "failed", error: res.error });
      await gateMovementRepository
        .appendEventsForTask(p.task.id, companyId, [
          { kind: "supplierEmailFailed", label: `Shipment Details: ${label} e-mail failed — ${res.error}`, at: at.toISOString(), by: from.name },
        ])
        .catch((err) => log.error(err, "warehouse supplier e-mail: failure not logged"));
      // No answer in time: it may have gone out. A distinct code, so the screen asks to check with
      // the supplier before sending again instead of offering a plain Retry.
      if (res.timedOut) throw APIError.deadlineExceeded(`${label}: ${res.error} — nothing was marked as sent; check with the supplier before sending it again`);
      throw APIError.unavailable(`${label} not e-mailed: ${res.error} — nothing was marked as sent`);
    }

    const attachedCount = meta.filter((x) => x.how === "attached").length;
    const filesText = attachedCount ? ` (${plural(attachedCount, p.kind === "survey" || p.kind === "vgm" ? "photo" : "file")})` : "";
    try {
      const section = await warehouseService.markSent(p.task.id, p.kind, note, companyId, userId, {
        entry: {
          emailedTo: p.to.join("; "),
          ...(p.cc.length ? { cc: p.cc.join("; ") } : {}),
          attachments: String(attachedCount),
          ...(res.providerId ? { emailId: res.providerId } : {}),
          emailAttemptId: attempt.id,
        },
        logLabel: `${label} e-mailed to ${p.to.join(", ")}${p.cc.length ? ` (Cc ${p.cc.join(", ")})` : ""}${filesText}`,
        after: async (tx) => {
          await settingsRepository.settle(attempt.id, companyId, { status: "sent", providerId: res.providerId, sentAt: at }, tx);
        },
      });
      return { section, email: attemptItem({ ...attempt, status: "sent", providerId: res.providerId, sentAt: at }) };
    } catch (err) {
      // The e-mail went out but recording it failed: keep that on the attempt so nobody resends blindly.
      log.error(err, "warehouse supplier e-mail sent but not recorded", { attemptId: attempt.id });
      await settingsRepository
        .settle(attempt.id, companyId, {
          status: "sent",
          providerId: res.providerId,
          sentAt: at,
          error: "E-mailed, but not marked as sent",
        })
        .catch(() => undefined);
      throw APIError.internal(sentNotRecorded(label));
    }
  }

  /** The latest e-mail attempts of a position, newest first (for the retry state). */
  async list(taskId: string, companyId: string): Promise<SupplierEmailItem[]> {
    if (!UUID.test(taskId)) throw APIError.notFound("Warehouse position not found");
    const task = await warehouseTaskRepository.findAny(taskId, companyId);
    if (!task) throw APIError.notFound("Warehouse position not found");
    const now = Date.now();
    return (await settingsRepository.listForTask(task.id, companyId)).map((r) => attemptItem(r, now));
  }
}

export const emailSupplierService = new EmailSupplierService();
