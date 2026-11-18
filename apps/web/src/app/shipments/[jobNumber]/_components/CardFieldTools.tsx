"use client";

import React, { useState } from "react";
import { Modal, Tooltip } from "antd";
import { ControlOutlined } from "@ant-design/icons";
import { BTN, BTN_GHOST, BTN_PRIMARY, BTN_SM, HINT, ICON_BTN_GHOST, MODAL_TITLE } from "@/styles/ui";
import { COLS2 } from "./detailStyles";
import { useCardFields } from "../useCardFields";

/** A field a card can show: its key (what the choice stores) and its label. */
export type CardField = { key: string; label: string };

interface FieldColumnsProps<F extends CardField> {
  fields: F[];
  renderRow: (field: F) => React.ReactNode;
}

/**
 * The two-column field grid shared by "Show all" and the field picker, so the
 * two modals lay out identically and only differ in how a row is rendered.
 */
function FieldColumns<F extends CardField>({ fields, renderRow }: FieldColumnsProps<F>) {
  const half = Math.ceil(fields.length / 2);
  return (
    <div className={`${COLS2} max-h-[65vh] overflow-y-auto px-2`}>
      {[fields.slice(0, half), fields.slice(half)].map((col, i) => (
        <div key={i}>
          {col.map((f) => (
            <React.Fragment key={f.key}>{renderRow(f)}</React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

interface CardFieldToolsProps<F extends CardField> {
  /** The card's id in the user's stored choice (useCardFields). */
  cardId: string;
  icon: React.ReactNode;
  title: string;
  /** Every field the card has, in its order. */
  fields: F[];
  /** One field row, as the card draws it; both modals use it, so they show the same rows. */
  renderRow: (field: F) => React.ReactNode;
}

/**
 * A card header's "Show all (N)" and the picker of the fields the card shows, with their two
 * modals: "Show all" lists every field of the card (still editable), the picker the same rows
 * with a checkbox in front. Used by the Shipment Details cards and the Master Job's MBL Details
 * cards; the choice is the user's (useCardFields).
 */
export function CardFieldTools<F extends CardField>({ cardId, icon, title, fields, renderRow }: CardFieldToolsProps<F>) {
  const [showAll, setShowAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const { visibleKeys, toggleField, resetCard, isCustomised } = useCardFields();

  const allKeys = fields.map((f) => f.key);
  const shownKeys = visibleKeys(cardId, allKeys);

  return (
    <>
      <span className="ml-auto flex items-center gap-0.5 shrink-0">
        <button onClick={() => setShowAll(true)} className={`${BTN_GHOST} ${BTN_SM} tabular-nums`}>
          Show all ({allKeys.length})
        </button>
        <Tooltip title="Choose which fields appear in this card">
          <button
            onClick={() => setPicking(true)}
            aria-label="Choose which fields appear in this card"
            className={`${ICON_BTN_GHOST} ${
              isCustomised(cardId) ? "!bg-white !text-indigo-600 ring-1 ring-inset ring-indigo-200" : ""
            }`}
          >
            <ControlOutlined className="text-[13px]" />
          </button>
        </Tooltip>
      </span>

      {/* Okno "Show all" - vsechna pole karty, stale editovatelna */}
      <Modal
        open={showAll}
        onCancel={() => setShowAll(false)}
        footer={null}
        width={860}
        title={
          <span className="flex items-center gap-2">
            <span className="text-slate-400">{icon}</span>
            <span className={MODAL_TITLE}>{title}</span>
            <span className={`ml-2 ${HINT} font-normal`}>{allKeys.length} fields</span>
          </span>
        }
      >
        <FieldColumns fields={fields} renderRow={renderRow} />
      </Modal>

      {/* Okno vyberu poli - stejny seznam, jen se zaskrtavatky */}
      <Modal
        open={picking}
        onCancel={() => setPicking(false)}
        width={860}
        title={
          <span className="flex items-center gap-2">
            <span className="text-slate-400">{icon}</span>
            <span className={MODAL_TITLE}>{title} — choose fields</span>
            <span className={`ml-2 ${HINT} font-normal`}>
              {shownKeys.length} of {allKeys.length} in card
            </span>
          </span>
        }
        footer={
          <div className="flex items-center gap-3">
            <span className={`${HINT} mr-auto text-left`}>Unchecked fields stay available under “Show all”.</span>
            <button onClick={() => resetCard(cardId)} className={BTN}>
              Show all fields
            </button>
            <button onClick={() => setPicking(false)} className={BTN_PRIMARY}>
              Done
            </button>
          </div>
        }
      >
        {/* Exactly the rows "Show all" renders — same component, same values,
            same custom fields — with only a checkbox added in front. */}
        <FieldColumns
          fields={fields}
          renderRow={(f) => {
            const on = shownKeys.includes(f.key);
            // The separator belongs to the wrapper, not the row, so the rule
            // runs the full width under the checkbox too — otherwise the
            // indented lines break the table look "Show all" has.
            return (
              <div className={`flex items-center gap-2.5 border-b border-slate-100 last:border-b-0 ${on ? "" : "opacity-45"}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleField(cardId, f.key, allKeys)}
                  aria-label={`Show ${f.label} in this card`}
                  className="shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0 [&>div]:border-b-0 [&>div]:mx-0">{renderRow(f)}</div>
              </div>
            );
          }}
        />
      </Modal>
    </>
  );
}
