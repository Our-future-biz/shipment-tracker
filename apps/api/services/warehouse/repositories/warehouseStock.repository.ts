import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  warehouseBondedEntryTable,
  warehouseStockLineTable,
  warehouseStockMovementTable,
  warehouseZoneTable,
} from "../schemas/warehouseStock.schema";

class StockLineRepository extends TenantRepository<typeof warehouseStockLineTable> {
  constructor() {
    super(db as never, warehouseStockLineTable, "warehouse_stock_line");
  }
}

class ZoneRepository extends TenantRepository<typeof warehouseZoneTable> {
  constructor() {
    super(db as never, warehouseZoneTable, "warehouse_zone");
  }
}

class StockMovementRepository extends TenantRepository<typeof warehouseStockMovementTable> {
  constructor() {
    super(db as never, warehouseStockMovementTable, "warehouse_stock_movement");
  }
}

class BondedEntryRepository extends TenantRepository<typeof warehouseBondedEntryTable> {
  constructor() {
    super(db as never, warehouseBondedEntryTable, "warehouse_bonded_entry");
  }
}

export const stockLineRepository = new StockLineRepository();
export const zoneRepository = new ZoneRepository();
export const stockMovementRepository = new StockMovementRepository();
export const bondedEntryRepository = new BondedEntryRepository();
