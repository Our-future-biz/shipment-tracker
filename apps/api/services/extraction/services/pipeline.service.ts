import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { classifyPages, extractFromPages } from "./extraction.service";
import { splitPdfToPages, detectMediaType } from "../lib/pdf";
import { SHIPMENT_FIELDS } from "../lib/fields";
import { MASTER_JOB_PROMPT, PLACE_RULES } from "../lib/prompts";
import { groupHblPages } from "../lib/hblGroups";
import { canonicalizeRecords } from "./places.service";
import type { PrepareResult, ExtractMblResult, ExtractHblResult, PipelineFile } from "../interfaces/interfaces";

interface PipelinePage {
  pageNum: number;
  /** The uploaded file the page came from. */
  fileName: string;
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
  const rawPages: { base64: string; mediaType: string; fileName: string }[] = [];
  const fileSummary: { fileName: string; pageCount: number }[] = [];
  for (const { fileBase64, fileName } of files) {
    const mediaType = detectMediaType(fileName);
    // Split a multi-page PDF into one standalone PDF per page. Images stay as a
    // single page. This is what lets the pipeline traverse the WHOLE document.
    let filePages: { base64: string; mediaType: string }[] = [{ base64: fileBase64, mediaType }];
    if (mediaType === "application/pdf") {
      const pageB64s = await splitPdfToPages(fileBase64);
      if (pageB64s.length > 0) filePages = pageB64s.map((b) => ({ base64: b, mediaType: "application/pdf" }));
    }
    rawPages.push(...filePages.map((p) => ({ ...p, fileName })));
    fileSummary.push({ fileName, pageCount: filePages.length });
  }

  // Classify pages in chunks so we never send an unbounded request.
  const types: string[] = [];
  const refs: string[] = [];
  for (let i = 0; i < rawPages.length; i += CLASSIFY_CHUNK) {
    const chunk = rawPages
      .slice(i, i + CLASSIFY_CHUNK)
      .map((p, j) => ({ pageNum: i + j + 1, base64: p.base64, mediaType: p.mediaType }));
    try {
      const classified = await classifyPages(chunk);
      for (let j = 0; j < chunk.length; j++) {
        types.push((classified[j]?.type || "HBL").toUpperCase());
        refs.push(String(classified[j]?.ref ?? ""));
      }
    } catch (err) {
      // Unclassified pages are read as House B/Ls, the most common kind.
      log.warn("pipeline: page classification failed", { error: err instanceof Error ? err.message : String(err), pages: chunk.length });
      for (let j = 0; j < chunk.length; j++) {
        types.push("HBL");
        refs.push("");
      }
    }
  }

  const sessionPages: PipelinePage[] = rawPages.map((p, i) => ({
    pageNum: i + 1,
    fileName: p.fileName,
    type: types[i] || "HBL",
    ref: refs[i] || "",
    base64: p.base64,
    mediaType: p.mediaType,
  }));

  cleanup();
  const sessionId = `pipe-${randomUUID()}`;
  sessions.set(sessionId, {
    owner,
    pages: sessionPages,
    mblInfo: null,
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

export async function extractMbl(sessionId: string, who: SessionOwner): Promise<ExtractMblResult> {
  const session = getSessionOrThrow(sessionId, who);
  const mblPages = getPagesByType(session, "MBL");

  if (mblPages.length === 0) {
    return { mblInfo: null, message: "No MBL pages found" };
  }

  const pages = mblPages.slice(0, 3).map((p) => ({ base64: p.base64, mediaType: p.mediaType }));
  const results = await extractFromPages(
    pages,
    "",
    `This is a Master Bill of Lading (MBL). Extract ONLY the shared shipping info:\n- Vessel / Voyage\n- POL, POD\n- ETD date, ETA date\n- Shipping line / Coloader\n- Booking number\n- FCL/LCL\n- CNTR no. (all container numbers)\n- CNTR count, length, type\nDo NOT extract cargo items. Return a single JSON object.\n\n${PLACE_RULES}`,
    SHIPMENT_FIELDS,
    2048,
  );

  const mblInfo = results[0] || null;
  if (mblInfo) await canonicalizeRecords([mblInfo]);
  session.mblInfo = mblInfo;

  return { mblInfo };
}

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
      batchIndex,
      totalBatches,
      totalExtracted: session.shipments.length,
      done: true,
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
  // Exactly one shipment per House B/L, even if the model split it.
  const shipments = perHbl.map((rows) => rows[0]).filter((s): s is Record<string, string> => !!s);

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

  session.shipments.push(...shipments);
  const done = batchIndex + 1 >= totalBatches;

  return {
    shipments,
    batchIndex,
    totalBatches,
    totalExtracted: session.shipments.length,
    done,
  };
}
