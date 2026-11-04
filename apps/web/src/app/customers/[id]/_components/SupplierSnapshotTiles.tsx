"use client";

import { CarOutlined, CommentOutlined, FileTextOutlined, StarOutlined } from "@ant-design/icons";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useHaulier } from "@/hooks/useTrucking";
import { businessToday, formatDate } from "@/lib/date";
import { SUPPLIER_RULES } from "../../_lib/supplierAttention";
import { EMPTY_CELL } from "../../_lib/customerTable";
import { SnapshotTile, lastContactTile, placeholderTile, type TileContent } from "./CustomerSnapshotTiles";
import { useSupplierTariffs } from "./useSupplierTariffs";

interface SupplierSnapshotTilesProps {
  customer: CustomerItem;
  onSelectTab: (key: string) => void;
}

const HAULIER_STATUS: Record<string, TileContent> = {
  ok: { value: "OK", tone: "green" },
  warning: { value: "Warning", tone: "amber" },
  blocked: { value: "Blocked", tone: "red" },
};

// Where a supplier stands, in the shape of a customer's tiles: its rating, whether its tariffs price today
// (or, for a haulier, Trucking's check), and the last contact.
export function SupplierSnapshotTiles({ customer, onSelectTab }: SupplierSnapshotTilesProps) {
  const { notes, isLoading: notesLoading, isError: notesError } = useCustomerNotes(customer.id);
  const tariffs = useSupplierTariffs(customer);
  const isHaulier = customer.roles.includes("haulier");
  const { haulier, isLoading: haulierLoading } = useHaulier(customer.id, { enabled: isHaulier });

  const rating = customer.supplierRating;
  const ratingTile: TileContent =
    rating === null ? { value: "Not rated", tone: "amber" } : { value: `${rating} / 5`, tone: rating <= 2 ? "red" : rating >= 4 ? "green" : undefined };

  const active = tariffs.summaries.reduce((sum, t) => sum + t.activeCount, 0);
  const ends = tariffs.summaries.map((t) => t.activeUntil).filter((d): d is string => !!d).sort()[0];
  const soon = ends && ends <= new Date(Date.parse(`${businessToday()}T00:00:00Z`) + SUPPLIER_RULES.endingWithinDays * 86_400_000).toISOString().slice(0, 10);
  const tariffTile =
    placeholderTile(tariffs.isLoading, tariffs.isError) ??
    (active === 0 ? { value: "None valid", tone: "red" as const } : { value: ends ? `${active} · to ${formatDate(ends).slice(0, 5)}` : String(active), tone: soon ? ("amber" as const) : ("green" as const) });
  const haulierTile = placeholderTile(haulierLoading, !haulier) ?? HAULIER_STATUS[haulier!.status] ?? { value: EMPTY_CELL };
  const contactTile = placeholderTile(notesLoading, notesError) ?? lastContactTile(notes);

  return (
    <div className="@container">
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
        <SnapshotTile label="Rating" icon={<StarOutlined />} {...ratingTile} />
        {tariffs.hasTariffRole && <SnapshotTile label="Tariffs valid today" icon={<FileTextOutlined />} {...tariffTile} />}
        {isHaulier && <SnapshotTile label="Trucking check" icon={<CarOutlined />} {...haulierTile} />}
        <SnapshotTile label="Last contact" icon={<CommentOutlined />} {...contactTile} onClick={() => onSelectTab("communication")} />
      </div>
    </div>
  );
}
