import { classifyPages, extractFromImages } from "./extraction.service";
import { SHIPMENT_FIELDS } from "../lib/fields";
import { MASTER_JOB_PROMPT } from "../lib/prompts";
import type { PrepareResult, ExtractMblResult, ExtractHblResult } from "../interfaces/interfaces";

interface PipelinePage {
  pageNum: number;
  type: string;
  base64: string;
}

interface PipelineSession {
  pages: PipelinePage[];
  mblInfo: Record<string, string> | null;
  shipments: Record<string, string>[];
  fileName: string;
  createdAt: number;
}

const sessions = new Map<string, PipelineSession>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const BATCH_SIZE = 3;

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function getSessionOrThrow(sessionId: string): PipelineSession {
  cleanup();
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Pipeline session not found or expired");
  return session;
}

function getPagesByType(session: PipelineSession, type: string): PipelinePage[] {
  return session.pages.filter((p) => p.type === type);
}

export async function prepare(fileBase64: string, fileName: string): Promise<PrepareResult> {
  const pages = [{ pageNum: 1, base64: fileBase64 }];

  const classified = await classifyPages(pages);

  const sessionPages = pages.map((p, i) => ({
    pageNum: p.pageNum,
    type: classified[i]?.type || "HBL",
    base64: p.base64,
  }));

  cleanup();
  const sessionId = `pipe-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  sessions.set(sessionId, {
    pages: sessionPages,
    mblInfo: null,
    shipments: [],
    fileName,
    createdAt: Date.now(),
  });

  const classification: Record<string, number> = { MANIFEST: 0, HBL: 0, MBL: 0, SKIP: 0 };
  for (const page of sessionPages) {
    classification[page.type] = (classification[page.type] || 0) + 1;
  }

  return {
    sessionId,
    pageCount: sessionPages.length,
    classification,
    pages: sessionPages.map((p) => ({ pageNum: p.pageNum, type: p.type })),
    fileName,
  };
}

export async function extractMbl(sessionId: string): Promise<ExtractMblResult> {
  const session = getSessionOrThrow(sessionId);
  const mblPages = getPagesByType(session, "MBL");

  if (mblPages.length === 0) {
    return { mblInfo: null, message: "No MBL pages found" };
  }

  const images = mblPages.slice(0, 3).map((p) => ({ base64: p.base64 }));
  const results = await extractFromImages(
    images,
    "",
    `This is a Master Bill of Lading (MBL). Extract ONLY the shared shipping info:\n- Vessel / Voyage\n- POL, POD\n- ETD date, ETA date\n- Shipping line / Coloader\n- Booking number\n- FCL/LCL\n- CNTR no. (all container numbers)\n- CNTR count, length, type\nDo NOT extract cargo items. Return a single JSON object.`,
    SHIPMENT_FIELDS,
    2048,
  );

  const mblInfo = results[0] || null;
  session.mblInfo = mblInfo;

  return { mblInfo };
}

const MBL_SHARED_KEYS = [
  "POL", "POD", "Vessel", "Voyage", "Estimated Departure", "Estimated Arrival",
  "Shipping line / Coloader", "Booking Number", "Load Type",
];

export async function extractHblBatch(sessionId: string, batchIndex: number): Promise<ExtractHblResult> {
  const session = getSessionOrThrow(sessionId);
  const hblPages = getPagesByType(session, "HBL");
  const totalBatches = Math.ceil(hblPages.length / BATCH_SIZE);

  if (batchIndex >= totalBatches) {
    return {
      shipments: [],
      batchIndex,
      totalBatches,
      totalExtracted: session.shipments.length,
      done: true,
    };
  }

  const batch = hblPages.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
  const images = batch.map((p) => ({ base64: p.base64 }));

  const shipments = await extractFromImages(
    images,
    MASTER_JOB_PROMPT,
    `These are ${batch.length} House Bill of Lading pages. Each page = 1 shipment. For EACH page, extract a separate shipment object with fields: ${SHIPMENT_FIELDS.join(", ")}, and 'Personal Reference' (the House B/L number). Return a JSON array with exactly ${batch.length} objects.`,
    SHIPMENT_FIELDS,
    8192,
  );

  // Enrich with MBL shared info
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
