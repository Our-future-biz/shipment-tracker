# Database & Repository Standards

> **This documentation has been split into specialized documents**

## Documentation

This page serves as a hub for database and repository standards in Encore TypeScript services. Documentation is split into three focused documents:

### 1. [Database Standards](database_standards.md) 🗄️
**Database schemas, migrations, and configuration**
- Drizzle ORM setup
- Schema design principles
- Migrations (create, test, deploy)
- Indexing and performance
- Data types and naming conventions

**Read when:**
- Creating new tables
- Adding migrations
- Optimizing database queries
  database-and-data/database_repository_standards/api_pagination_standards
### 2. [Repository Patterns](repository_patterns.md) 🏗️
**BaseRepository and repository layer**
- BaseRepository class and methods
- CRUD operations (create, findById, update, delete)
- Advanced query methods (getOneByQuery, getListByQuery)
- Soft delete implementation
- Business-specific methods
- Error handling and transactions

**Read when:**
- Creating new repository
- Understanding BaseRepository methods
- Implementing complex queries

### 3. [API Pagination Standards](api_pagination_standards.md) 📄
**Pagination in API and repository layer**
- PaginationRequest and PaginatedResponse interfaces
- BaseRepository.getPaginated() method
- API endpoint implementation
- Filtering and sorting
- Best practices and optimization

**Read when:**
- Creating list endpoints with pagination
- Implementing filtering
- Understanding pagination system

---

## Quick Start

### For New Tables

1. **Create schema** → [Database Standards - Schema Design](database_standards.md#schema-design)
2. **Generate migration** → [Database Standards - Migrations](database_standards.md#migrations)
3. **Create repository** → [Repository Patterns - Basic Usage](epository_patterns.md#basic-usage)

### For New List Endpoints

1. **Define interfaces** → [API Pagination - Request/Response](api_pagination_standards.md#paginationrequest)
2. **Create endpoint** → [API Pagination - API Endpoint](api_pagination_standards.md#implementation-in-api-endpoint)
3. **Implement repository** → [API Pagination - Repository](api_pagination_standards.md#implementation-in-repository)

---

## Core Principles

1. ✅ **Repository is the ONLY layer** that touches database
2. ✅ **Type-safe queries** with Drizzle ORM
3. ✅ **Soft deletes by default** for audit and recovery
4. ✅ **UUID primary keys** for distributed systems
5. ✅ **Consistent timestamps** (created_at, updated_at, deleted_at)
6. ✅ **snake_case for database**, camelCase for TypeScript
7. ✅ **Proper indexing** for performance
8. ✅ **Immutable migrations** after deployment
9. ✅ **BaseRepository for consistency** across repositories
10. ✅ **Pagination for list endpoints**

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

**Details:** [Database Standards - Project Structure](database_standards.md#project-structure)

---

## Quick Examples

### Database Configuration

```typescript
// db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import * as schema from "../schemas/schema";

const database = new SQLDatabase("service_name", {
  migrations: "./db/migrations",
});

export const db = drizzle(database.connectionString, { schema });
```

**Full examples:** [Database Standards - Setup](database_standards.md#database-setup)

### Table Schema

```typescript
export const userTable = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  emailIdx: index("user_email_idx").on(table.email),
}));
```

**Detailed examples:** [Database Standards - Schema Design](database_standards.md#schema-design)

### Migrations

```bash
# 1. Update schema.ts
# 2. Generate migration
npx drizzle-kit generate

# 3. Migration runs automatically on service start
```

**Complete guide:** [Database Standards - Migrations](database_standards.md#migrations)

### Repository with BaseRepository

```typescript
import { BaseRepository } from "@core/databases/drizzle/repository";

class UserRepository extends BaseRepository<typeof userTable> {
  constructor() {
    super(db, userTable);
  }

  // Add business-specific methods
  async softDelete(id: string): Promise<void> {
    await this.update(id, { deletedAt: new Date() });
  }
}

export const userRepository = new UserRepository();
```

**Complete guide:** [Repository Patterns](repository_patterns.md)

### Pagination with getPaginated()

```typescript
// API endpoint with pagination
export interface UserFilterRequest extends PaginationRequest {
  active?: boolean;
  role?: UserRole[];
}

export interface UserFilterResponse extends PaginatedResponse<IUserPublic> {}

// Repository implementation
async getByFilter(request: UserFilterRequest): Promise<UserFilterResponse> {
  const whereClauses: SQL[] = [];

  // Filter soft-deleted
  whereClauses.push(ne(userTable.deleted, true));

  if (request.active != null) {
    whereClauses.push(eq(userTable.active, request.active));
  }

  return this.getPaginated<IUserPublic>({
    request,
    whereClauses,
    whereDefaultQuery: "AND",
    defaultOrderBy: userTable.name,
  });
}
```

**Detailed guide:** [API Pagination Standards](api_pagination_standards.md)

---

## Checklists

### New Tables
- [ ] UUID primary key
- [ ] Standard timestamps (created_at, updated_at, deleted_at)
- [ ] snake_case for columns and tables
- [ ] Indexes on queried columns
- [ ] Foreign keys with indexes
- [ ] Types exported

### New Repositories
- [ ] Extends BaseRepository
- [ ] Constructor calls super(db, table)
- [ ] Export singleton instance
- [ ] Type hints on methods
- [ ] Error handling with APIError
- [ ] Soft delete implemented
- [ ] Tests for key methods

### List Endpoints with Pagination
- [ ] Request extends PaginationRequest
- [ ] Response extends PaginatedResponse<T>
- [ ] Type-safe sortBy values
- [ ] defaultOrderBy defined
- [ ] Soft-deleted records filtered
- [ ] Indexes on sort columns

---

## Quick Reference

```typescript
// Basic CRUD with BaseRepository
const item = await repository.findById(id);
const createdItem = await repository.create(data);
const updatedItem = await repository.update(id, data);
await repository.delete(id);

// Query methods
const itemGet = await repository.getOneByQuery({ where: eq(table.id, id) });
const itemsList = await repository.getListByQuery({ where: conditions });
const items = await repository.findBy([eq(table.active, true)]);

// Pagination! Please this is important, check pagination documentation.
const result = await repository.getPaginated({
  request,
  whereClauses,
  defaultOrderBy: table.name,
});

// Drizzle ORM helpers
eq, ne, and, or, like, ilike, inArray, isNull, gt, lt, desc, asc
```

---

## Related Documentation

- [Controllers & API Endpoints](controllers_api_endpoints.md) - API endpoint patterns
- [Naming Conventions](naming_convention.md) - Project naming standards
