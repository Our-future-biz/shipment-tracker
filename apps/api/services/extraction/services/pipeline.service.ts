import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { shipments as shipmentsService } from "~encore/clients";
import { classifyPages, extractFromPages } from "./extraction.service";
import { splitPdfToPages, detectMediaType, mergePagesToPdf, TooManyPagesError } from "../lib/pdf";
import { MBL_FIELDS, SHIPMENT_FIELDS } from "../lib/fields";
import { MASTER_JOB_PROMPT, MBL_PROMPT } from "../lib/prompts";
import { applyTradeDirection } from "../lib/tradeDirection";
import { groupHblPages } from "../lib/hblGroups";
import { canonicalizeRecords } from "./places.service";
import { chargeReading } from "../lib/readingBudget";
import type { PrepareResult, ExtractMblResult, ExtractHblResult, HblDocument, PipelineFile, ReadingMadeAlready } from "../interfaces/interfaces";
import type { ReadingMatches } from "../../shipments/interfaces/interfaces";
import { billOfLadingKey } from "../../../lib/billOfLading";

interface PipelinePage {
  pageNum: number;
  /** The uploaded file the page came from, and the page's number in it. */
  fileName: string;
  filePageNum: number;
  type: string;
  /** House B/L number read on an HBL page; "" when none. */
  ref: string;
  base64: string;
  mediaType: string;
}

/** Who started a session; only they can continue it. */
export interface SessionOwner {
  companyId: string;
  userId: string;
}

interface PipelineSession {
  owner: SessionOwner;
  pages: PipelinePage[];
  mblInfo: Record<string, string> | null;
  // The pages were charged once, when the pre-alert was prepared: each part is read once too. Asked
  // again (a retried request, a second click), the part answers what it read, without another call.
  mblRead: boolean;
  hblBatches: Map<number, ExtractHblResult>;
  shipments: Record<string, string>[];
  fileName: string;
  createdAt: number;
}

// Sessions live in this process's memory: they are lost on a restart and not shared between
// instances, so the pipeline assumes one API instance (and a restart means uploading again).
const sessions = new Map<string, PipelineSession>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const BATCH_SIZE = 3;
// Classify at most this many pages per vision call to keep requests bounded.
const CLASSIFY_CHUNK = 8;
// Bounds on what one upload may cost and what the sessions may hold in memory: pages per
// pre-alert, live sessions per user (a new one drops the user's oldest), pages held in all.
export const MAX_PAGES = 200;
const MAX_SESSIONS_PER_USER = 3;
const MAX_PAGES_HELD = 2000;

// Makes room for a new session of `newPages` pages: the owner keeps at most 2 older sessions,
// and the oldest sessions of anyone go while all would hold more than MAX_PAGES_HELD pages.
function makeRoom(owner: SessionOwner, newPages: number) {
  // A Map iterates in insertion order: oldest first.
  const mine = [...sessions].filter(([, session]) => ownsSession(session, owner));
  for (const [id] of mine.slice(0, Math.max(0, mine.length - (MAX_SESSIONS_PER_USER - 1)))) sessions.delete(id);
  let held = [...sessions.values()].reduce((n, session) => n + session.pages.length, 0);
  for (const [id, session] of sessions) {
    if (held + newPages <= MAX_PAGES_HELD) break;
    sessions.delete(id);
    held -= session.pages.length;
  }
}

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export const ownsSession = (session: { owner: SessionOwner }, who: SessionOwner): boolean =>
  session.owner.companyId === who.companyId && session.owner.userId === who.userId;

// Another user's (or company's) session is reported exactly like a missing one.
function getSessionOrThrow(sessionId: string, who: SessionOwner): PipelineSession {
  cleanup();
  const session = sessions.get(sessionId);
  if (!session || !ownsSession(session, who)) throw APIError.notFound("Pipeline session not found or expired");
  return session;
}

function getPagesByType(session: PipelineSession, type: string): PipelinePage[] {
  return session.pages.filter((p) => p.type === type);
}

// All files of one pre-alert go into a single session, so their pages are
// classified and extracted together and end up under one master job.
export async function prepare(files: PipelineFile[], owner: SessionOwner): Promise<PrepareResult> {
  const rawPages: { base64: string; mediaType: string; fileName: string; filePageNum: number }[] = [];
  const fileSummary: { fileName: string; pageCount: number }[] = [];
  for (const { fileBase64, fileName } of files) {
    const mediaType = detectMediaType(fileName);
    // Split a multi-page PDF into one standalone PDF per page. Images stay as a
    // single page. This is what lets the pipeline traverse the WHOLE document.
    let filePages: { base64: string; mediaType: string }[] = [{ base64: fileBase64, mediaType }];
    if (mediaType === "application/pdf") {
      let pageB64s: string[];
      try {
        // Counted before it is split: the pages left of the pre-alert's limit.
        pageB64s = await splitPdfToPages(fileBase64, MAX_PAGES - rawPages.length);
      } catch (err) {
        if (err instanceof TooManyPagesError) throw APIError.invalidArgument(`A pre-alert can have at most ${MAX_PAGES} pages - please read it in smaller batches`);
        throw err;
      }
      if (pageB64s.length > 0) filePages = pageB64s.map((b) => ({ base64: b, mediaType: "application/pdf" }));
    }
    rawPages.push(...filePages.map((p, i) => ({ ...p, fileName, filePageNum: i + 1 })));
    fileSummary.push({ fileName, pageCount: filePages.length });
    if (rawPages.length > MAX_PAGES) {
      throw APIError.invalidArgument(`A pre-alert can have at most ${MAX_PAGES} pages - please read it in smaller batches`);
    }
  }
  // Every page is read by Claude: counted against the user's hourly reading budget.
  chargeReading(owner.userId, rawPages.length);

  // Classify pages in chunks so we never send an unbounded request, each page's class taken by its
  // number (a reply that skips a page shifts no other). A chunk the AI does not answer ends the
  // reading as unavailable: its pages would be filed under guessed types, and every chunk after it
  // would wait out the same timeout before failing too.
  const types: string[] = [];
  const refs: string[] = [];
  for (let i = 0; i < rawPages.length; i += CLASSIFY_CHUNK) {
    const chunk = rawPages
      .slice(i, i + CLASSIFY_CHUNK)
      .map((p, j) => ({ pageNum: i + j + 1, base64: p.base64, mediaType: p.mediaType, fileName: p.fileName }));
    const classified = new Map((await classifyPages(chunk)).map((c) => [c.page, c]));
    for (const page of chunk) {
      // A page the classifier gave no class is read as a House B/L, the most common kind.
      const found = classified.get(page.pageNum);
      types.push(found?.type || "HBL");
      refs.push(found?.ref ?? "");
    }
  }

  const sessionPages: PipelinePage[] = rawPages.map((p, i) => ({
    pageNum: i + 1,
    fileName: p.fileName,
    filePageNum: p.filePageNum,
    type: types[i] || "HBL",
    ref: refs[i] || "",
    base64: p.base64,
    mediaType: p.mediaType,
  }));

  cleanup();
  makeRoom(owner, sessionPages.length);
  const sessionId = `pipe-${randomUUID()}`;
  sessions.set(sessionId, {
    owner,
    pages: sessionPages,
    mblInfo: null,
    mblRead: false,
    hblBatches: new Map(),
    shipments: [],
    fileName: files.map((f) => f.fileName).join(", "),
    createdAt: Date.now(),
  });

  const classification: Record<string, number> = { MANIFEST: 0, HBL: 0, MBL: 0, INVOICE: 0, PACKING_LIST: 0, SKIP: 0 };
  for (const page of sessionPages) {
    classification[page.type] = (classification[page.type] || 0) + 1;
  }

  return {
    sessionId,
    pageCount: sessionPages.length,
    classification,
    pages: sessionPages.map((p) => ({ pageNum: p.pageNum, fileName: p.fileName, type: p.type })),
    files: fileSummary,
    // Shipments to expect: HBL pages grouped by House B/L number.
    hblCount: groupHblPages(sessionPages).length,
    fileName: files.map((f) => f.fileName).join(", "),
  };
}

// What the company made from this pre-alert already (read and created before): asked of Shipments
// on every answer, as the user who reads, so a house created since shows too. When Shipments can't
// be asked the reading goes on without it (logged): a house is still never created twice, as
// Shipments refuses a second shipment of a House B/L (shipmentCreate's fromHouseBol).
async function madeAlready(houseBols: string[], masterBol: string): Promise<ReadingMatches | null> {
  if (!houseBols.some((h) => billOfLadingKey(h)) && !billOfLadingKey(masterBol)) return { shipments: [], masterJob: null };
  try {
    return await shipmentsService._internalReadingMatches({ houseBols: houseBols.filter((h) => billOfLadingKey(h)), masterBol });
  } catch (err) {
    log.warn("pipeline: what the pre-alert made already could not be read", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

const HOUSE_BOL = "House BoL Number";
const MASTER_BOL = "Master BoL Number";

/** The live master job that has the Master B/L already, or null. */
async function existingMasterJob(mblInfo: Record<string, string> | null): Promise<ReadingMadeAlready | null> {
  const masterJob = mblInfo ? (await madeAlready([], mblInfo[MASTER_BOL] ?? ""))?.masterJob : null;
  return masterJob ? { id: masterJob.id, number: masterJob.mczNumber } : null;
}

/**
 * The Master B/L the houses read name, when they agree on one: every house that names one names the
 * same B/L. "" when none names one or two differ. Mock test run F3: a pre-alert of a manifest and
 * House B/Ls, with no Master B/L page, made its master job without the B/L, so a second read found none.
 */
export function housesMasterBol(shipments: Record<string, string>[]): string {
  const named = shipments.map((s) => (s[MASTER_BOL] ?? "").trim()).filter((b) => billOfLadingKey(b));
  return named.length > 0 && new Set(named.map(billOfLadingKey)).size === 1 ? named[0] : "";
}

/** The live master job of the houses' common Master B/L, when no Master B/L number was read (else extractMbl answers it). */
async function housesMasterJob(session: PipelineSession): Promise<ReadingMadeAlready | null> {
  if (billOfLadingKey(session.mblInfo?.[MASTER_BOL])) return null;
  const masterBol = housesMasterBol(session.shipments);
  return masterBol ? existingMasterJob({ [MASTER_BOL]: masterBol }) : null;
}

/** For each shipment read: the live shipment that has its House B/L already, or null. */
export async function existingHouses(shipments: Record<string, string>[]): Promise<(ReadingMadeAlready | null)[]> {
  const houseBols = shipments.map((s) => s[HOUSE_BOL] ?? "");
  const found = (await madeAlready(houseBols, ""))?.shipments ?? [];
  const byKey = new Map(found.map((m) => [billOfLadingKey(m.houseBol), m]));
  return houseBols.map((h) => {
    const m = billOfLadingKey(h) ? byKey.get(billOfLadingKey(h)) : undefined;
    return m ? { id: m.shipmentId, number: m.jobNumber } : null;
  });
}

export async function extractMbl(sessionId: string, who: SessionOwner): Promise<ExtractMblResult> {
  const session = getSessionOrThrow(sessionId, who);
  if (session.mblRead) return { mblInfo: session.mblInfo, existingMasterJob: await existingMasterJob(session.mblInfo) };
  const mblPages = getPagesByType(session, "MBL");

  if (mblPages.length === 0) {
    return { mblInfo: null, message: "No MBL pages found" };
  }

  // The first pages carry the B/L's head, containers and seals; the rest are mostly its cargo
  // lines continued and copies of the same B/L.
  const pages = mblPages.slice(0, MBL_PAGES_READ).map((p) => ({ base64: p.base64, mediaType: p.mediaType }));
  // Null when nothing was read from them: no Master B/L details to share with the House B/Ls.
  const mblInfo = await extractFromPages(
    pages,
    MBL_PROMPT,
    `These ${pages.length} page(s) are one Master Bill of Lading. Return a single JSON object with the fields that are on it.`,
    MBL_FIELDS,
    2048,
  );
  if (mblInfo) {
    await canonicalizeRecords([mblInfo]);
    applyTradeDirection(mblInfo);
  }
  session.mblInfo = mblInfo;
  session.mblRead = true;

  return { mblInfo, existingMasterJob: await existingMasterJob(mblInfo) };
}

const MBL_PAGES_READ = 4;

const MBL_SHARED_KEYS = [
  "POL", "POD", "Vessel", "Voyage", "Estimated Departure", "Estimated Arrival",
  "Shipping line / Coloader", "Booking Number", "Load Type",
];

export async function extractHblBatch(sessionId: string, batchIndex: number, who: SessionOwner): Promise<ExtractHblResult> {
  const session = getSessionOrThrow(sessionId, who);
  // One entry per House B/L: all its pages (continuation pages, other copies) together.
  const hbls = groupHblPages(getPagesByType(session, "HBL"));
  const totalBatches = Math.ceil(hbls.length / BATCH_SIZE);

  if (batchIndex >= totalBatches) {
    return {
      shipments: [],
      documents: [],
      batchIndex,
      totalBatches,
      totalExtracted: session.shipments.length,
      done: true,
    };
  }

  // Read once: a batch asked for again answers what it read (no second paid call, no shipments twice).
  const earlier = session.hblBatches.get(batchIndex);
  if (earlier) {
    return {
      ...earlier,
      totalExtracted: session.shipments.length,
      existing: await existingHouses(earlier.shipments),
      existingMasterJob: await housesMasterJob(session),
    };
  }

  const batch = hbls.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
  const perHbl = await Promise.all(
    batch.map((pages) =>
      extractFromPages(
        pages.map((p) => ({ base64: p.base64, mediaType: p.mediaType })),
        MASTER_JOB_PROMPT,
        pages.length === 1
          ? `This is one House Bill of Lading page = 1 shipment. Extract a single shipment object with fields: ${SHIPMENT_FIELDS.join(", ")}, and 'Personal Reference' (the House B/L number). Return one JSON object.`
          : `These ${pages.length} pages are ONE House Bill of Lading (continuation pages or copies of the same B/L) = 1 shipment. Combine them into a single shipment object with fields: ${SHIPMENT_FIELDS.join(", ")}, and 'Personal Reference' (the House B/L number). Return one JSON object.`,
        SHIPMENT_FIELDS,
        4096,
      ),
    ),
  );
  // At most one shipment per House B/L (extractFromPages reads one object), each with its own pages;
  // a House B/L nothing was read from makes none.
  const read = await Promise.all(
    perHbl.map(async (shipment, i) => ({ shipment, document: shipment ? await hblDocument(batch[i]) : null })),
  );
  const found = read.filter((r): r is { shipment: Record<string, string>; document: HblDocument | null } => r.shipment !== null);
  const shipments = found.map((r) => r.shipment);

  await canonicalizeRecords(shipments);

  // Enrich with MBL shared info (already in the database's form)
  if (session.mblInfo) {
    for (const shipment of shipments) {
      for (const key of MBL_SHARED_KEYS) {
        if (!shipment[key] && session.mblInfo[key]) {
          shipment[key] = session.mblInfo[key];
        }
      }
    }
  }

  // After the MBL's details: a House B/L may have its POD only from there.
  shipments.forEach((shipment) => applyTradeDirection(shipment));

  session.shipments.push(...shipments);
  const done = batchIndex + 1 >= totalBatches;

  const result: ExtractHblResult = {
    shipments,
    documents: found.map((r) => r.document),
    batchIndex,
    totalBatches,
    totalExtracted: session.shipments.length,
    done,
  };
  session.hblBatches.set(batchIndex, result);
  return { ...result, existing: await existingHouses(shipments), existingMasterJob: await housesMasterJob(session) };
}

/**
 * The pages of one House B/L as a file of its own, to be saved to the shipment made from it:
 * named after the B/L number as printed on it. Copies of the B/L sent in other uploaded files
 * go into the same file. A page that can't be put into a PDF leaves the shipment without one.
 */
async function hblDocument(pages: PipelinePage[]): Promise<HblDocument | null> {
  const source = pages[0];
  if (!source) return null;
  try {
    const single = pages.length === 1;
    const fileBase64 = single ? source.base64 : await mergePagesToPdf(pages);
    const fileType = single ? source.mediaType : "application/pdf";
    const extension = fileType === "image/jpeg" ? ".jpg" : fileType === "image/png" ? ".png" : ".pdf";
    const number = (pages.find((p) => p.ref)?.ref ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-");
    const stem = source.fileName.replace(/\.[a-z0-9]+$/i, "");
    return {
      fileName: `${number || `${stem} p${pages.map((p) => p.filePageNum).join("-")}`}${extension}`,
      fileType,
      fileSize: Buffer.byteLength(fileBase64, "base64"),
      fileBase64,
      sourceFileName: [...new Set(pages.map((p) => p.fileName))].join(", "),
      pages: pages.map((p) => p.filePageNum),
    };
  } catch (err) {
    log.warn("pipeline: House B/L pages could not be cut out", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
