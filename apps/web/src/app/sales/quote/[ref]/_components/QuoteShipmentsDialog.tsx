"use client";

import Link from "next/link";
import { Button, Tag, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { LINK_CLASS } from "@/components/linkClass";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";
import type { QuoteShipment } from "@/hooks/useQuoteShipments";
import { SalesDialog } from "../../../_components/SalesDialog";

interface QuoteShipmentsDialogProps {
  quoteNumber: string;
  // The live shipments booked under the quote, the oldest first; undefined while they are read.
  shipments: QuoteShipment[] | undefined;
  // Why no other shipment can be made from the quote (it is not Won), else null.
  createBlocked: string | null;
  onCreateAnother: () => void;
  onClose: () => void;
}

// Every shipment booked under one quote, each opening its shipment, and the way to book another.
export const QuoteShipmentsDialog = ({ quoteNumber, shipments, createBlocked, onCreateAnother, onClose }: QuoteShipmentsDialogProps) => (
  <SalesDialog
    open
    onClose={onClose}
    title={`Shipments of ${quoteNumber}`}
    subtitle={shipments ? `${shipments.length} shipment${shipments.length === 1 ? "" : "s"} booked under this quote, the first one at the top.` : undefined}
    footer={
      <>
        <Button onClick={onClose}>Close</Button>
        <Tooltip title={createBlocked}>
          <span>
            <Button type="primary" icon={<PlusOutlined />} disabled={!!createBlocked} onClick={onCreateAnother}>
              Create another shipment
            </Button>
          </span>
        </Tooltip>
      </>
    }
  >
    {!shipments ? (
      <p className="m-0 text-sm text-slate-400">Loading the shipments…</p>
    ) : shipments.length === 0 ? (
      <p className="m-0 text-sm text-slate-500">No shipment is booked under this quote any more.</p>
    ) : (
      <ul className="m-0 p-0 list-none divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {shipments.map((shipment, index) => (
          <li key={shipment.id} className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-5 text-right text-xs text-slate-400 tabular-nums">{index + 1}.</span>
              <Link href={`/shipments/${shipment.id}`} className={`font-mono text-sm font-semibold ${LINK_CLASS}`}>
                {shipment.jobNumber || "Shipment"}
              </Link>
            </span>
            {shipment.status && <Tag color={statusTagColor(shipment.status)} className="m-0">{statusLabel(shipment.status)}</Tag>}
          </li>
        ))}
      </ul>
    )}
  </SalesDialog>
);
