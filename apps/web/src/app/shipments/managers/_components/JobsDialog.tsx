"use client";

import { useEffect, type Key, type ReactNode } from "react";
import { Modal } from "antd";
import { Table } from "@/components/Table";
import type { ColumnsType, TableProps } from "antd/es/table";
import { plural, type CockpitCardDef, type CockpitList } from "@/components/cockpit/CockpitCard";
import { HINT, MODAL_TITLE } from "@/styles/ui";
import { ticksStillListed } from "../_lib/cockpitActions";

interface JobsDialogProps<R> {
  /** The card whose rows are listed; null keeps the dialog closed. */
  card: CockpitCardDef | null;
  list: CockpitList<R> | undefined;
  onClose: () => void;
  columns: ColumnsType<R>;
  rowKey: (row: R) => string;
  onRow?: TableProps<R>["onRow"];
  rowClassName?: string;
  /** The keys of the rows ticked. */
  selected: string[];
  onSelect: (keys: string[]) => void;
  /** Why a row cannot be ticked; null for one that can. */
  notSelectable: (row: R) => string | null;
  /** What is done with the ticked rows: drawn above the table. */
  toolbar: ReactNode;
}

// Every row of one card of Shipments → Managers. The cockpits' shared dialog
// (components/cockpit CockpitDialog) drawn again here - the same title, width, table and paging -
// because this page's rows can be ticked and handed over together, and the shared dialog has no
// place for a tick column or a button of the page's own. A change to that dialog's look should be
// made here too.
export function JobsDialog<R extends object>({ card, list, onClose, columns, rowKey, onRow, rowClassName, selected, onSelect, notSelectable, toolbar }: JobsDialogProps<R>) {
  // The card is read again every minute and after every action. A tick goes with its row: a job
  // that left the list is not ticked any more, so it is not ticked again should it come back. A
  // list that is not there (still loading) says nothing about which rows are left: no tick is dropped.
  const rows = list?.rows;
  useEffect(() => {
    if (!rows) return;
    const kept = ticksStillListed(selected, rows.map(rowKey));
    // The same array when nothing left: then nothing is set, and this does not run in circles.
    if (kept !== selected) onSelect([...kept]);
  }, [rows, selected, rowKey, onSelect]);

  return (
    <Modal
      open={!!card}
      onCancel={onClose}
      title={
        card && (
          <div>
            <div className={MODAL_TITLE}>{card.dialog}</div>
            <div className={`${HINT} font-normal mt-0.5`}>
              {plural(list?.total ?? 0, "item")} — {card.window}
              {list && list.total > list.rows.length ? ` · the first ${list.rows.length} are listed` : ""}
            </div>
          </div>
        )
      }
      width="min(1200px, calc(100vw - 48px))"
      footer={null}
      destroyOnHidden
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">{toolbar}</div>
      <Table<R>
        size="small"
        rowKey={rowKey}
        scroll={{ x: "max-content" }}
        dataSource={list?.rows ?? []}
        columns={columns}
        pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
        rowClassName={rowClassName}
        onRow={onRow}
        rowSelection={{
          selectedRowKeys: selected,
          // A tick stays while the other pages are looked through.
          preserveSelectedRowKeys: true,
          onChange: (keys: Key[]) => onSelect(keys.map(String)),
          getCheckboxProps: (row) => {
            const why = notSelectable(row);
            return { disabled: why !== null, title: why ?? undefined };
          },
        }}
      />
    </Modal>
  );
}
