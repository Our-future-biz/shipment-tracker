import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import type { ManagersAuditList, OpsCockpitAudit } from "../interfaces/interfaces";
import { AUDIT_DAYS, AUDIT_LINE_KEPT_MINUTES, AUDIT_READ_LIMIT } from "../lib/cockpitThresholds";
import {
  HISTORY_KEYS,
  auditLine,
  auditList,
  decidedEntries,
  historyAsk,
  historyEntries,
  isHistoryKey,
  overrideEntries,
  ownApprovalEntries,
  type AuditEntry,
  type AuditKey,
  type DecidedRow,
} from "../lib/managersCockpitAudit";
import { unlimited, type Limit } from "../lib/readLimiter";
import { customsOfficeRequestRepository } from "../repositories/customsOfficeRequest.repository";
import { documentChangeRequestRepository } from "../repositories/documentChangeRequest.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentReleaseOverrideRepository } from "../repositories/shipmentReleaseOverride.repository";
import { shipmentReleaseRequestRepository } from "../repositories/shipmentReleaseRequest.repository";

// The audit line of Shipments → Managers and the rows behind each of its counts: the company's
// last AUDIT_DAYS days, read from the jobs' history and four tables beside it and worded by the
// pure rules of lib/managersCockpitAudit. It only reads.
//
// Five parts, each read on its own: one that fails takes only its own kinds with it, and the
// answer names it - the line then shows no figure for them, which is not a zero (D29). Read, that
// is six statements (the requests are two tables), each bounded by the seven days:
//   the history       one read of shipment_audit by (company_id, changed_at), narrowed to the
//                     fields asked for, the job joined by its key
//   releases          shipment_release_override by (company_id, created_at)
//   own approvals     shipment_attachment by (company_id, customs_reviewed_at) of the approved ones
//   requests          the two request tables: small, read by company
//   release requests  the same, of the table the prepayment stop's requests are kept in
//
// The line is the company's - the same for every manager, whatever their page is narrowed to -
// and counts a week, so it is not read on every poll of every open page: a line read whole is
// kept in memory for AUDIT_LINE_KEPT_MINUTES and handed to whoever asks meanwhile (auditLines
// below). The rows behind a count are never kept: whoever opens them reads them now.

/** The parts, as the page names one that could not be read. */
export const AUDIT_PARTS = {
  history: "audit: changes on the jobs (deleted, cancelled, dates changed, Handled By, hand-overs, dismissed cut-offs, ticks taken back)",
  ownCreditCheck: "audit: credit checks approved by the job's own Handled By",
  overrides: "audit: releases of unpaid prepayment jobs",
  ownApprovals: "audit: documents approved by their uploader",
  requests: "audit: document and Customs Office requests decided",
  releaseRequests: "audit: release requests decided",
  /** When none of it could be read. */
  all: "the audit line",
  /** When a part had more rows than are read at once. */
  cut: `audit: more than ${AUDIT_READ_LIMIT.toLocaleString("en-US")} rows in ${AUDIT_DAYS} days - the newest are counted`,
} as const;

/** The start of the line's window: AUDIT_DAYS days before `now`, to the minute. */
const auditSince = (now: Date) => new Date(now.getTime() - AUDIT_DAYS * 86_400_000);

/** The read of one part: null when it failed, which the caller names. */
async function part<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    log.warn(err, "a part of Shipments → Managers could not be read", { part: name });
    return null;
  }
}

/** What a part read: its entries, and whether there were more rows than it takes at once. */
interface PartRead {
  entries: AuditEntry[];
  cut: boolean;
}
/** One more row than counted is asked for, so "cut" means some were left out. */
const taken = <R>(rows: R[]): { rows: R[]; cut: boolean } => ({ rows: rows.slice(0, AUDIT_READ_LIMIT), cut: rows.length > AUDIT_READ_LIMIT });

type Users = ReadonlyMap<string, string> | null;

/** The most ids one look-up of auth takes (its userLookup's own limit). */
const LOOKUP_AT_ONCE = 200;
/** The domain of the app's own service identities ("Trucking (system)"): named by their name, as they have no real e-mail. */
const SYSTEM_EMAIL = "@system.invalid";

/**
 * The company's users (`emailOf`, from the company the request works in) with whoever else made a
 * change of `ids`: a superadmin working as this company is a user of their own company, and would be
 * "—" (m18), and the app's service identity is no listed user. They are looked up by id - auth's
 * look-up of the company's users and of live superadmins, as the job's History tab names them. A
 * look-up that fails leaves them unnamed, as before: a line that only shows who did it is not
 * refused for that. Null stays null: without the company's users nobody is named.
 */
async function withOthers(emailOf: Users, ids: readonly string[]): Promise<Users> {
  if (emailOf === null) return null;
  const missing = [...new Set(ids)].filter((id) => !!id && !emailOf.has(id));
  if (missing.length === 0) return emailOf;
  const found = new Map(emailOf);
  try {
    for (let i = 0; i < missing.length; i += LOOKUP_AT_ONCE) {
      const { users } = await auth.userLookup({ ids: missing.slice(i, i + LOOKUP_AT_ONCE), orSuperadmin: true });
      for (const u of users) found.set(u.id, u.email.trim().toLowerCase().endsWith(SYSTEM_EMAIL) ? u.name : u.email.trim().toLowerCase());
    }
  } catch (err) {
    log.warn(err, "the people of Shipments → Managers' audit line could not be looked up");
  }
  return found;
}

// ─── The parts ──────────────────────────────────────────────────
// `run`: the limiter of the answer the read is part of (lib/readLimiter); every statement goes through it.

async function readHistory(companyId: string, since: Date, emailOf: Users, run: Limit, keys: readonly (typeof HISTORY_KEYS)[number][] = HISTORY_KEYS): Promise<PartRead> {
  const { rows, cut } = taken(await run(() => shipmentAuditRepository.changesSince(companyId, since, historyAsk(keys), AUDIT_READ_LIMIT + 1)));
  return { entries: historyEntries(rows, await withOthers(emailOf, rows.map((r) => r.userId))), cut };
}

async function readOverrides(companyId: string, since: Date, run: Limit): Promise<PartRead> {
  const { rows, cut } = taken(await run(() => shipmentReleaseOverrideRepository.listSince(companyId, since, AUDIT_READ_LIMIT + 1)));
  return { entries: overrideEntries(rows), cut };
}

async function readOwnApprovals(companyId: string, since: Date, emailOf: Users, run: Limit): Promise<PartRead> {
  const { rows, cut } = taken(await run(() => shipmentAttachmentRepository.ownApprovalsSince(companyId, since, AUDIT_READ_LIMIT + 1)));
  return { entries: ownApprovalEntries(rows, await withOthers(emailOf, rows.map((r) => r.reviewedById))), cut };
}

async function readRequests(companyId: string, since: Date, run: Limit): Promise<PartRead> {
  const [documents, offices] = await Promise.all([
    run(() => documentChangeRequestRepository.decidedSince(companyId, since, AUDIT_READ_LIMIT + 1)),
    run(() => customsOfficeRequestRepository.decidedSince(companyId, since, AUDIT_READ_LIMIT + 1)),
  ]);
  const document = taken(documents);
  const office = taken(offices);
  const rows: DecidedRow[] = [
    ...document.rows.flatMap((r) => (r.decidedAt ? [{ shipmentId: r.shipmentId, jobNumber: r.jobNumber ?? "", status: r.status, decidedByName: r.decidedByName, decidedAt: r.decidedAt, asked: `Change of an approved document (${r.documentType || r.fileName})`, comment: r.comment }] : [])),
    ...office.rows.flatMap((r) => (r.decidedAt ? [{ shipmentId: r.shipmentId, jobNumber: r.jobNumber ?? "", status: r.status, decidedByName: r.decidedByName, decidedAt: r.decidedAt, asked: `Customs Office ${r.fromOffice} → ${r.toOffice}`, comment: r.comment }] : [])),
  ];
  return { entries: decidedEntries("requests_decided", rows), cut: document.cut || office.cut };
}

/**
 * The prepayment stop's requests a manager answered: approved or rejected. One that was closed -
 * the job was released another way while it waited - was answered by nobody and is none of them,
 * so the approval rate is approved of approved and rejected. (An approval is a pass the asker
 * then uses; which passes were used is not counted here - the repository has no read of them.)
 * `withJobs`: the job numbers are looked up too - the drill-down shows them; the line only counts.
 */
async function readReleaseRequests(companyId: string, since: Date, withJobs: boolean, run: Limit): Promise<PartRead> {
  const { rows: read, cut } = taken(await run(() => shipmentReleaseRequestRepository.decidedSince(companyId, since, AUDIT_READ_LIMIT + 1)));
  const decided = read.filter((r) => r.status === "approved" || r.status === "rejected");
  const jobNumbers = withJobs ? await run(() => shipmentRepository.jobNumbersByIds(companyId, [...new Set(decided.map((r) => r.shipmentId))])) : new Map<string, string>();
  const rows: DecidedRow[] = decided.flatMap((r) =>
    r.decidedAt
      ? [{ shipmentId: r.shipmentId, jobNumber: jobNumbers.get(r.shipmentId) ?? "", status: r.status, decidedByName: r.decidedByName, decidedAt: r.decidedAt, asked: r.what === "house_bol" ? "Release of the House BoL on prepayment" : "Warehouse Released on prepayment", comment: r.comment }]
      : [],
  );
  return { entries: decidedEntries("release_requests_decided", rows), cut };
}

// ─── The line ───────────────────────────────────────────────────

/** What the cockpit's answer takes of the line. */
export interface AuditLineRead {
  /** Null when none of it could be read. */
  audit: OpsCockpitAudit | null;
  /** What of it could not be read, in AUDIT_PARTS' words. */
  notKnown: string[];
}

/** The line read now, and whether all of it was: only a whole line is worth keeping. */
async function readLine(companyId: string, now: Date, emailOf: Users, run: Limit): Promise<AuditLineRead & { whole: boolean }> {
  const since = auditSince(now);
  const [history, overrides, ownApprovals, requests, releaseRequests] = await Promise.all([
    part(AUDIT_PARTS.history, () => readHistory(companyId, since, emailOf, run)),
    part(AUDIT_PARTS.overrides, () => readOverrides(companyId, since, run)),
    part(AUDIT_PARTS.ownApprovals, () => readOwnApprovals(companyId, since, emailOf, run)),
    part(AUDIT_PARTS.requests, () => readRequests(companyId, since, run)),
    part(AUDIT_PARTS.releaseRequests, () => readReleaseRequests(companyId, since, false, run)),
  ]);
  const parts: [string, PartRead | null, readonly AuditKey[]][] = [
    [AUDIT_PARTS.history, history, HISTORY_KEYS.filter((key) => key !== "own_credit_check" || emailOf !== null)],
    [AUDIT_PARTS.overrides, overrides, ["prepayment_release"]],
    [AUDIT_PARTS.ownApprovals, ownApprovals, ["own_document_approval"]],
    [AUDIT_PARTS.requests, requests, ["requests_decided"]],
    [AUDIT_PARTS.releaseRequests, releaseRequests, ["release_requests_decided"]],
  ];
  const read = parts.filter(([, rows]) => rows !== null);
  if (read.length === 0) return { audit: null, notKnown: [AUDIT_PARTS.all], whole: false };
  return {
    audit: auditLine(read.flatMap(([, rows]) => rows!.entries), read.flatMap(([, , keys]) => keys)),
    notKnown: [
      ...parts.filter(([, rows]) => rows === null).map(([name]) => name),
      ...(history && emailOf === null ? [AUDIT_PARTS.ownCreditCheck] : []),
      ...(read.some(([, rows]) => rows!.cut) ? [AUDIT_PARTS.cut] : []),
    ],
    // Every part read, and with the users: nothing a second try could add.
    whole: read.length === parts.length && emailOf !== null,
  };
}

// A company's line as last read whole, and when (the `now` it was read on). Kept per process: two
// instances of the API each keep their own, which costs a read each and nothing else. One entry
// per company that has a manager's page open, never more.
const auditLines = new Map<string, { at: number; line: Promise<AuditLineRead & { whole: boolean }> }>();
const KEPT_MS = AUDIT_LINE_KEPT_MINUTES * 60_000;

/** Forgets every line kept: the next ask reads. For the tests, which read one company many ways. */
export const forgetAuditLines = (): void => auditLines.clear();

/**
 * The audit line for the cockpit's answer, and what of it could not be read. `emailOf`: the
 * company's users, id to e-mail; null when they could not be read - then nobody can say that a
 * credit check was approved by the job's own Handled By, and that one kind is named as not known.
 *
 * A line read whole within the last AUDIT_LINE_KEPT_MINUTES is answered from memory: no statement
 * is sent. A line that lacks a part - a read failed, the users were not known - is answered but
 * not kept: the next ask tries again. Two asks at the same moment share one read.
 */
export async function managersAuditLine(companyId: string, now: Date, emailOf: Users, run: Limit = unlimited): Promise<AuditLineRead> {
  const kept = auditLines.get(companyId);
  const age = kept ? now.getTime() - kept.at : -1;
  const line = kept && age >= 0 && age < KEPT_MS ? kept.line : readLine(companyId, now, emailOf, run);
  if (line !== kept?.line) {
    auditLines.set(companyId, { at: now.getTime(), line });
    // Not whole, or not read at all: not kept - unless a newer read has taken its place meanwhile.
    const forget = () => {
      if (auditLines.get(companyId)?.line === line) auditLines.delete(companyId);
    };
    line.then((read) => read.whole || forget(), forget);
  }
  const { audit, notKnown } = await line;
  return { audit, notKnown };
}

// ─── The rows behind a count ──────────────────────────────────────────

const NOT_READ = "The audit rows could not be read just now: try again in a moment";

/**
 * The rows one figure of the line stands for, the newest first (lib/managersCockpitAudit
 * auditList: at most 200). Only that kind's part is read - now, never from memory: at most two
 * statements, so they need no limiter. `emailOf` as above: without the users
 * `who` is "" - and the credit checks, which hang on who is who, are refused rather than listed empty.
 */
export async function managersAuditRows(companyId: string, key: AuditKey, now: Date, emailOf: Users): Promise<ManagersAuditList> {
  if (key === "own_credit_check" && emailOf === null) throw APIError.unavailable(NOT_READ);
  const since = auditSince(now);
  try {
    const read = isHistoryKey(key)
      ? await readHistory(companyId, since, emailOf, unlimited, [key])
      : key === "prepayment_release"
        ? await readOverrides(companyId, since, unlimited)
        : key === "own_document_approval"
          ? await readOwnApprovals(companyId, since, emailOf, unlimited)
          : key === "requests_decided"
            ? await readRequests(companyId, since, unlimited)
            : await readReleaseRequests(companyId, since, true, unlimited);
    return auditList(read.entries, key, read.cut);
  } catch (err) {
    log.warn(err, "the audit rows of Shipments → Managers could not be read", { key });
    throw APIError.unavailable(NOT_READ);
  }
}
