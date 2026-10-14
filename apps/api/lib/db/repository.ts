import {
  eq,
  isNull,
  and,
  desc,
  asc,
  count as drizzleCount,
  type SQL,
  type InferSelectModel,
  type InferInsertModel,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// Any service's drizzle instance, whatever schema it was created with.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema type parameter is irrelevant here
export type AnyDb = NodePgDatabase<any>;
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { PaginatedResponse, PaginationRequest } from "./interface";

type TableWithDefaults = PgTable & {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
};

export interface PaginationOptions {
  request: PaginationRequest;
  whereClauses?: SQL[];
  defaultOrderBy: PgColumn;
  defaultMaxLimit: number;
  defaultLimit: number;
}

export abstract class BaseRepository<TTable extends TableWithDefaults> {
  protected readonly db: AnyDb;
  protected readonly table: TTable;
  protected readonly tableName: string;

  constructor(
    db: AnyDb,
    table: TTable,
    tableName: string,
  ) {
    this.db = db;
    this.table = table;
    this.tableName = tableName;
  }

  async create(data: InferInsertModel<TTable>): Promise<InferSelectModel<TTable>> {
    const [row] = await this.db.insert(this.table).values(data as never).returning();
    return row as InferSelectModel<TTable>;
  }

  async getById(id: string, opts: { includeDeleted?: boolean } = {}): Promise<InferSelectModel<TTable> | null> {
    const conditions = opts.includeDeleted
      ? [eq(this.table.id, id)]
      : [eq(this.table.id, id), isNull(this.table.deletedAt)];
    const [row] = await this.db.select().from(this.table as PgTable).where(and(...conditions)).limit(1);
    return (row as InferSelectModel<TTable>) ?? null;
  }

  async getByColumn<TCol extends PgColumn>(column: TCol, value: unknown, opts: { includeDeleted?: boolean } = {}): Promise<InferSelectModel<TTable> | null> {
    const conditions = opts.includeDeleted
      ? [eq(column, value)]
      : [eq(column, value), isNull(this.table.deletedAt)];
    const [row] = await this.db.select().from(this.table as PgTable).where(and(...conditions)).limit(1);
    return (row as InferSelectModel<TTable>) ?? null;
  }

  async getAll(limit = 100, opts: { includeDeleted?: boolean } = {}): Promise<InferSelectModel<TTable>[]> {
    const conditions = opts.includeDeleted ? [] : [isNull(this.table.deletedAt)];
    const rows = await this.db.select().from(this.table as PgTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(this.table.createdAt))
      .limit(limit);
    return rows as InferSelectModel<TTable>[];
  }

  async getPaginated(options: PaginationOptions): Promise<PaginatedResponse<InferSelectModel<TTable>>> {
    const { request, whereClauses = [], defaultOrderBy, defaultMaxLimit, defaultLimit } = options;
    const limit = Math.min(request.limit ?? defaultLimit, defaultMaxLimit);
    const offset = request.offset ?? 0;
    const direction = request.sortDirection === "asc" ? asc : desc;
    const where = whereClauses.length > 0
      ? and(isNull(this.table.deletedAt), ...whereClauses)
      : isNull(this.table.deletedAt);

    const [rows, [{ value: total }]] = await Promise.all([
      this.db.select().from(this.table as PgTable).where(where).orderBy(direction(defaultOrderBy)).limit(limit).offset(offset),
      this.db.select({ value: drizzleCount() }).from(this.table as PgTable).where(where),
    ]);

    return { pagination: { total: Number(total), offset, limit }, data: rows as InferSelectModel<TTable>[] };
  }

  async update(id: string, data: Partial<InferInsertModel<TTable>>): Promise<InferSelectModel<TTable> | null> {
    const rows = (await this.db.update(this.table)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(and(eq(this.table.id, id), isNull(this.table.deletedAt)))
      .returning()) as InferSelectModel<TTable>[];
    return rows[0] ?? null;
  }

  async softDelete(id: string): Promise<InferSelectModel<TTable> | null> {
    const rows = (await this.db.update(this.table)
      .set({ deletedAt: new Date(), updatedAt: new Date() } as never)
      .where(and(eq(this.table.id, id), isNull(this.table.deletedAt)))
      .returning()) as InferSelectModel<TTable>[];
    return rows[0] ?? null;
  }
}

type TenantTable = TableWithDefaults & { companyId: PgColumn };

/**
 * Base repository for tenant-scoped tables. Every read and write is constrained to a
 * single companyId, so a caller physically cannot reach another company's rows. The
 * companyId always comes from the authenticated request (getAuthData), never from the
 * client. Prefer these methods over the inherited unscoped ones on tenant tables.
 */
// A row to insert without its companyId (the repository adds it). A key-remapping mapped type
// rather than Omit<>, which loses the optional fields of drizzle's insert type.
export type InsertForCompany<TTable extends PgTable> = {
  [K in keyof InferInsertModel<TTable> as K extends "companyId" ? never : K]: InferInsertModel<TTable>[K];
};

export abstract class TenantRepository<TTable extends TenantTable> extends BaseRepository<TTable> {
  async listForCompany(companyId: string, limit = 1000): Promise<InferSelectModel<TTable>[]> {
    const rows = await this.db.select().from(this.table as PgTable)
      .where(and(eq(this.table.companyId, companyId), isNull(this.table.deletedAt)))
      .orderBy(desc(this.table.createdAt))
      .limit(limit);
    return rows as InferSelectModel<TTable>[];
  }

  async getByIdForCompany(id: string, companyId: string): Promise<InferSelectModel<TTable> | null> {
    const [row] = await this.db.select().from(this.table as PgTable)
      .where(and(eq(this.table.id, id), eq(this.table.companyId, companyId), isNull(this.table.deletedAt)))
      .limit(1);
    return (row as InferSelectModel<TTable>) ?? null;
  }

  async getByColumnForCompany<TCol extends PgColumn>(
    column: TCol,
    value: unknown,
    companyId: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<InferSelectModel<TTable> | null> {
    const conditions = [eq(column, value), eq(this.table.companyId, companyId)];
    if (!opts.includeDeleted) conditions.push(isNull(this.table.deletedAt));
    const [row] = await this.db.select().from(this.table as PgTable).where(and(...conditions)).limit(1);
    return (row as InferSelectModel<TTable>) ?? null;
  }

  // Injects companyId so it can never be forgotten or overridden by the caller's payload.
  async createForCompany(
    companyId: string,
    data: InsertForCompany<TTable>,
  ): Promise<InferSelectModel<TTable>> {
    return this.create({ ...data, companyId } as InferInsertModel<TTable>);
  }

  async updateForCompany(
    id: string,
    companyId: string,
    data: Partial<InferInsertModel<TTable>>,
  ): Promise<InferSelectModel<TTable> | null> {
    const rows = (await this.db.update(this.table)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(and(eq(this.table.id, id), eq(this.table.companyId, companyId), isNull(this.table.deletedAt)))
      .returning()) as InferSelectModel<TTable>[];
    return rows[0] ?? null;
  }

  async softDeleteForCompany(id: string, companyId: string): Promise<InferSelectModel<TTable> | null> {
    const rows = (await this.db.update(this.table)
      .set({ deletedAt: new Date(), updatedAt: new Date() } as never)
      .where(and(eq(this.table.id, id), eq(this.table.companyId, companyId), isNull(this.table.deletedAt)))
      .returning()) as InferSelectModel<TTable>[];
    return rows[0] ?? null;
  }
}
