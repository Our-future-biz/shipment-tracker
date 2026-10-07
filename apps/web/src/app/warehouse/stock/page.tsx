"use client";

import { WarehouseSectionGrid } from "../_components/WarehouseSectionGrid";

export default function StockPage() {
  return <WarehouseSectionGrid title="Stock" storageKey="warehouse:stock" emptyText="Nothing in stock yet." />;
}
