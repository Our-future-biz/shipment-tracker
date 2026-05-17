# Database Standards

Standards for database schemas, migrations, and configuration in Encore TypeScript services using **Drizzle ORM** with PostgreSQL.

> **Related docs:**
> - [Repository Patterns](./repository_patterns.md) - BaseRepository usage
> - [API Pagination](./api_pagination_standards.md) - Pagination implementation

---

## Core Principles

1. **UUID primary keys** for distributed systems
2. **Timestamps**: created_at, updated_at, deleted_at
3. **snake_case** for database columns/tables
4. **Soft deletes** by default
5. **Proper indexing** for performance
6. **Immutable migrations** after deployment

---

## Project Structure

```
/services/{service-name}/
├── db/
│   ├── db.ts                 # Database connection
│   ├── drizzle.config.ts     # Drizzle Kit config
│   └── migrations/           # SQL migrations
├── schemas/
│   └── schema.ts             # Table schemas
└── repositories/
    └── user.repository.ts    # Data access layer
```

---

## Database Setup

### db.ts

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import * as schema from "../schemas/schema";

const database = new SQLDatabase("service_name", {
  migrations: "./db/migrations",
});

export const db = drizzle(database.connectionString, { schema });
```

### drizzle.config.ts

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./schemas/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
} satisfies Config;
```

---

## Schema Design

### Standard Table

```typescript
import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";

export const userTable = pgTable(
  "user",
  {
    // Primary key
    id: uuid("id").primaryKey().defaultRandom(),

    // Data
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    roles: jsonb("roles").$type<string[]>().default([]),
    isActive: boolean("is_active").default(true).notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    // Indexes
    emailIdx: index("user_email_idx").on(table.email),
    deletedAtIdx: index("user_deleted_at_idx").on(table.deletedAt),
  })
);

// Type inference
export type User = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;
```

### Foreign Keys

```typescript
export const postTable = pgTable(
  "post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),

    // Foreign key
    authorId: uuid("author_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    authorIdIdx: index("post_author_id_idx").on(table.authorId),
  })
);
```

---

## Migrations

### Creating Migrations

```bash
# 1. Update schema.ts
# 2. Generate migration
npx drizzle-kit generate

# 3. Migration runs automatically on service start
```

### Migration Example

```sql
-- 0003_add_phone.sql
ALTER TABLE "user" ADD COLUMN "phone_number" text;
```

### Rules

✅ **DO:**
- Generate with `drizzle-kit generate`
- Test in staging before production
- Keep migrations small and focused
- Never edit after deployment

❌ **DON'T:**
- Delete deployed migrations
- Mix schema and data changes

---

## Common Data Types

```typescript
// Text
text("name")
varchar("code", { length: 50 })

// Numbers
integer("count")
decimal("price", { precision: 10, scale: 2 })

// Timestamps
timestamp("created_at", { withTimezone: true }).notNull().defaultNow()

// Boolean
boolean("is_active").default(true).notNull()

// JSON
jsonb("metadata").$type<Record<string, unknown>>()
jsonb("roles").$type<string[]>().default([])

// UUID
uuid("id").primaryKey().defaultRandom()
```

---

## Indexing

### When to Add Indexes

```typescript
(table) => ({
  // Index frequently queried columns
  emailIdx: index("user_email_idx").on(table.email),

  // Index foreign keys
  authorIdIdx: index("post_author_id_idx").on(table.authorId),

  // Index sort columns
  createdAtIdx: index("user_created_at_idx").on(table.createdAt),

  // Index soft delete column
  deletedAtIdx: index("user_deleted_at_idx").on(table.deletedAt),

  // Composite index for common filters
  statusCreatedIdx: index("user_status_created_idx").on(
    table.status,
    table.createdAt
  ),
})
```

---

## Soft Delete Pattern

All tables should support soft deletes:

```typescript
// In schema
deletedAt: timestamp("deleted_at", { withTimezone: true })

// Index for performance
deletedAtIdx: index("table_deleted_at_idx").on(table.deletedAt)

// In repository - see Repository Patterns doc
```

---

## Naming Conventions

```typescript
// Tables: snake_case
export const userTable = pgTable("user", { ... });

// Columns: snake_case
createdAt: timestamp("created_at")  // ✅
createdAt: timestamp("createdAt")   // ❌

// Indexes: {table}_{column(s)}_idx
index("user_email_idx")
index("post_author_id_idx")
```

---

## Common Mistakes

### ❌ Missing Index on Foreign Key

```typescript
// Bad
authorId: uuid("author_id").references(() => userTable.id)
```

```typescript
// Good
authorId: uuid("author_id").references(() => userTable.id),
// ...
(table) => ({
  authorIdIdx: index("post_author_id_idx").on(table.authorId),
})
```

### ❌ Missing deleted_at Index

```typescript
// Bad
deletedAt: timestamp("deleted_at")
```

```typescript
// Good
deletedAt: timestamp("deleted_at"),
// ...
(table) => ({
  deletedAtIdx: index("user_deleted_at_idx").on(table.deletedAt),
})
```

---

## Checklist

Before deploying:

- [ ] UUID primary key
- [ ] Standard timestamps (created_at, updated_at, deleted_at)
- [ ] snake_case for columns and tables
- [ ] Indexes on queried columns
- [ ] Foreign keys have indexes
- [ ] Types exported (Type, NewType)
- [ ] Tested in staging

---

## Related Docs

- [Repository Patterns](./repository_patterns.md) - Using BaseRepository
- [API Pagination](./api_pagination_standards.md) - Implementing pagination
