"use client";

import { WarehouseSectionGrid } from "../_components/WarehouseSectionGrid";

export default function OutWarehousePage() {
  return <WarehouseSectionGrid title="Out Warehouse" storageKey="warehouse:out" emptyText="Nothing is going out of the warehouse yet." />;
}
