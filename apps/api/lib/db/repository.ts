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
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { PaginatedResponse, PaginationRequest } from "./interface";

type TableWithDefaults = PgTable & {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
};

export interface PaginationOptions<TTable extends TableWithDefaults> {
  request: PaginationRequest;
  whereClauses?: SQL[];
  defaultOrderBy: PgColumn;
  defaultMaxLimit: number;
  defaultLimit: number;
}

export abstract class BaseRepository<TTable extends TableWithDefaults> {
  protected readonly db: NodePgDatabase<Record<string, never>>;
  protected readonly table: TTable;
  protected readonly tableName: string;

  constructor(
    db: NodePgDatabase<Record<string, never>>,
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

  async getPaginated(options: PaginationOptions<TTable>): Promise<PaginatedResponse<InferSelectModel<TTable>>> {
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
    const [row] = await this.db.update(this.table)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(and(eq(this.table.id, id), isNull(this.table.deletedAt)))
      .returning();
    return (row as InferSelectModel<TTable>) ?? null;
  }

  async softDelete(id: string): Promise<InferSelectModel<TTable> | null> {
    const [row] = await this.db.update(this.table)
      .set({ deletedAt: new Date(), updatedAt: new Date() } as never)
      .where(eq(this.table.id, id))
      .returning();
    return (row as InferSelectModel<TTable>) ?? null;
  }
}
