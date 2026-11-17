"use client";

import { Tooltip } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { REQUIRED_DOCUMENT_TYPES, SAFETY_PAPERWORK_TYPES, documentTypeLabel, requiredDocumentTypes } from "@/lib/documentTypes";
import { LABEL_TEXT } from "@/styles/ui";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";

/** What the Customs section's bar leaves out (owner, 17 Nov 2026): customs does not need them. */
export const NOT_FOR_CUSTOMS: readonly string[] = ["Booking confirmation", "CMR / POD"];

/**
 * The required documents as milestones, in the look of the shipment's progress bar: one full-length
 * segment per document, its name above and its state below - green and Received once a file of that
 * type is in, grey and Missing until then. Shown in the shipment's Documents tab, where a missing one
 * is a button that opens the file picker with that type chosen, and in the Customs section's Documents
 * tab, read-only (customs approve and decline; files are added in the shipment's Documents tab).
 */
export function RequiredMilestones({
  byType,
  onPick,
  loading,
  dangerous,
  leaveOut = [],
}: {
  byType: Map<string, { fileName?: string | null }>;
  /** Opens the file picker with this type chosen; left out, a missing document is not a button. */
  onPick?: (type: string) => void;
  /** While the list loads the states are not known yet: grey bars, no Missing. */
  loading: boolean;
  /** Dangerous goods: the safety paperwork is required too. */
  dangerous: boolean;
  /** Documents this bar does not count or show (the Customs section's: NOT_FOR_CUSTOMS). */
  leaveOut?: readonly string[];
}) {
  const kept = (t: string) => !leaveOut.includes(t);
  const required = requiredDocumentTypes(dangerous).filter(kept);
  const main = REQUIRED_DOCUMENT_TYPES.filter(kept);
  const have = required.filter((t) => byType.has(t)).length;
  const left = required.length - have;
  const milestone = (type: string) => {
    const file = byType.get(type);
    const done = !!file;
    const label = documentTypeLabel(type);
    const picks = !done && !loading && !!onPick;
    const body = (
      <>
        <span
          className={`block truncate text-center text-[13px] leading-4 mb-1.5 ${
            done ? "text-slate-700" : `text-slate-900 font-medium ${picks ? "group-hover:text-indigo-700" : ""}`
          }`}
        >
          {label}
        </span>
        <span
          aria-hidden
          className={`block h-1.5 w-full rounded-full transition-colors ${
            loading ? "bg-slate-100 animate-pulse" : done ? "bg-emerald-500" : `bg-slate-200 ${picks ? "group-hover:bg-indigo-300" : ""}`
          }`}
        />
        {!loading && (
          <span
            className={`mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${
              done ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {done && <CheckOutlined aria-hidden className="text-[10px]" />}
            {done ? "Received" : "Missing"}
          </span>
        )}
      </>
    );
    const article = label === "MSDS" ? label : label.toLowerCase();
    return (
      <li key={type} className="min-w-0">
        {picks ? (
          <Tooltip title={`Add the ${article}`}>
            <button
              type="button"
              onClick={() => onPick!(type)}
              className={`group block w-full px-1 py-1 rounded-md border-0 bg-transparent cursor-pointer hover:bg-slate-50 transition-colors ${FOCUS}`}
            >
              {body}
            </button>
          </Tooltip>
        ) : (
          <Tooltip title={done ? file?.fileName : loading ? undefined : `No ${article} yet — it is added in the shipment's Documents tab`}>
            <div className="px-1 py-1">{body}</div>
          </Tooltip>
        )}
      </li>
    );
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <h3 id="req-docs-title" className={`m-0 ${LABEL_TEXT}`}>
          Required documents
        </h3>
        <span className="text-[12px] font-medium text-indigo-600 tabular-nums">
          {have} / {required.length}
        </span>
        {!loading && (
          <span className={`ml-auto text-[13px] font-medium ${left ? "text-amber-700" : "text-emerald-700"}`}>
            {left
              ? left === 1
                ? "1 required document is missing"
                : `${left} required documents are missing`
              : "All required documents are in place"}
          </span>
        )}
      </div>
      <ol
        aria-labelledby="req-docs-title"
        className={`list-none m-0 p-0 grid gap-x-1.5 gap-y-3 ${main.length <= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3 md:grid-cols-6"}`}
      >
        {main.map(milestone)}
      </ol>
      {dangerous && (
        <div className="mt-3">
          <h3 id="safety-docs-title" className={`m-0 mb-2.5 ${LABEL_TEXT}`}>
            Safety Paperwork
          </h3>
          <ol aria-labelledby="safety-docs-title" className="list-none m-0 p-0 grid grid-cols-2 md:grid-cols-3 gap-x-1.5 gap-y-3">
            {SAFETY_PAPERWORK_TYPES.map(milestone)}
          </ol>
        </div>
      )}
    </div>
  );
}
