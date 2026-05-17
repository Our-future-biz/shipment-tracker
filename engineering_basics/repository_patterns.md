# Repository Patterns with BaseRepository

Standards for writing repository layer in Encore TypeScript services using **BaseRepository**.

> **Related docs:**
> - [Database Standards](./database_standards.md) - Schema and migrations
> - [API Pagination](./api_pagination_standards.md) - Pagination implementation

---

## What is BaseRepository?

BaseRepository provides standard CRUD operations with:
- Type-safe database operations
- Soft delete support
- Pagination with filtering/sorting
- Consistent error handling

**Location:** `@core/databases/drizzle/repository`

---

## Repository Layer Responsibilities

Repositories are responsible for persistence concerns only.

- ✅ SQL/ORM queries and persistence operations
- ✅ Transaction boundaries (or transaction-aware helpers)
- ✅ Mapping between database records and domain-facing repository return shapes
- ✅ Explicit typed `Promise` return values on repository methods
- ❌ No auth/RBAC checks
- ❌ No business branching/validation
- ❌ No cross-service calls (for example `auditlog`, notifications)

---

## Basic Usage

```typescript
import { BaseRepository } from "@core/databases/drizzle/repository";
import { db } from "../db/db";
import { userTable } from "../schemas/schema";

class UserRepository extends BaseRepository<typeof userTable> {
  constructor() {
    super(db, userTable);
  }

  // Add your business-specific methods here
}

// Always export singleton
export const userRepository = new UserRepository();
```

---

## CRUD Methods

### create()

```typescript
async create(data: Partial<TModel>): Promise<TModel>
```

```typescript
const user = await userRepository.create({
  name: "John Doe",
  email: "john@example.com",
});
```

### findById()

```typescript
async findById(id: string | number | UUID): Promise<TModel | null>
```

```typescript
const user = await userRepository.findById(userId);
if (!user) {
  throw new APIError(ErrCode.NotFound, "User not found");
}
```

### update()

```typescript
async update<TInput>(id: string, data: TInput): Promise<TModel>
```

```typescript
const updated = await userRepository.update(userId, {
  name: "Updated Name",
  isActive: false,
});
```

### delete()

```typescript
async delete(id: string): Promise<void>
```

⚠️ **Use sparingly** - prefer soft delete

---

## Query Methods

### getOneByQuery()

```typescript
async getOneByQuery<TSelection>(content: {
  where: SQL | undefined;
  orderBy?: PgColumn | SQL;
  select?: Record<string, PgColumn | SQL>;
}): Promise<TSelection | null>
```

```typescript
import { eq, or } from "drizzle-orm";

const user = await userRepository.getOneByQuery({
  where: isUUID(identifier)
    ? eq(userTable.id, identifier)
    : eq(userTable.email, identifier),
});
```

### getListByQuery()

```typescript
async getListByQuery<TSelection>(content: {
  where: SQL | undefined;
  orderBy?: PgColumn | SQL;
  select?: Record<string, PgColumn | SQL>;
}): Promise<TSelection[]>
```

```typescript
import { eq, and, ne } from "drizzle-orm";

const activeUsers = await userRepository.getListByQuery({
  where: and(
    eq(userTable.isActive, true),
    ne(userTable.deleted, true)
  ),
  orderBy: userTable.name,
});
```

### findBy()

```typescript
async findBy(where: SQL | SQL[]): Promise<TModel[]>
```

```typescript
const users = await userRepository.findBy([
  eq(userTable.isActive, true),
  inArray(userTable.role, ["ADMIN", "USER_ADMIN"]),
]);
```

---

## Update Methods

### updateWithQuery()

```typescript
async updateWithQuery<TInput>(
  where: SQL | undefined,
  data: TInput
): Promise<TModel>
```

Throws error if no record found.

### updateManyWithQuery()

```typescript
async updateManyWithQuery<TInput>(
  where: SQL | undefined,
  data: TInput
): Promise<number>
```

Returns count of updated records. Doesn't throw if no records found.

```typescript
// Deactivate all users of specific role
const count = await userRepository.updateManyWithQuery(
  eq(userTable.role, "VIEWER"),
  { isActive: false }
);
```

---

## Utility Methods

### count()

```typescript
async count(where: SQL | undefined): Promise<number>
```

```typescript
const activeCount = await userRepository.count(
  and(
    eq(userTable.isActive, true),
    ne(userTable.deleted, true)
  )
);
```

---

## Soft Delete

```typescript
class UserRepository extends BaseRepository<typeof userTable> {
  async softDelete(id: string): Promise<void> {
    await this.update(id, { deleted: true });
  }

  async restore(id: string): Promise<void> {
    await this.update(id, { deleted: false });
  }
}

// Always filter out soft-deleted
async getActive(): Promise<User[]> {
  return await this.findBy(ne(userTable.deleted, true));
}
```

---

## Pagination with getPaginated()

See [API Pagination Standards](./api_pagination_standards.md) for full documentation.

### Quick Example

```typescript
async getByFilter(request: UserFilterRequest): Promise<UserFilterResponse> {
  const whereClauses: SQL[] = [];

  // Always filter soft-deleted first
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

---

## Business-Specific Methods

```typescript
class AIAgentRepository extends BaseRepository<typeof agentTable> {
  constructor() {
    super(db, agentTable);
  }

  /**
   * Create agent with defaults
   */
  async createWithDefaults(data: AIAgentCreate): Promise<AIAgent> {
    return await this.create({
      ...data,
      active: true,
      deleted: false,
    });
  }

  /**
   * Find by ID or alias
   */
  async getByIdOrAlias(identifier: string): Promise<AIAgent> {
    const agent = await this.getOneByQuery({
      where: isUUID(identifier)
        ? eq(agentTable.id, identifier)
        : eq(agentTable.uniqueAlias, identifier),
    });

    if (!agent) {
      throw new APIError(ErrCode.NotFound, "Agent not found");
    }

    return agent;
  }

  /**
   * Soft delete
   */
  async softDelete(id: string): Promise<void> {
    await this.update(id, { deleted: true });
  }
}

export const aiAgentRepository = new AIAgentRepository();
```

---

## Error Handling

```typescript
import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";

class UserRepository extends BaseRepository<typeof userTable> {
  async get(id: string): Promise<IUser> {
    const user = await this.findById(id);

    if (!user) {
      throw new APIError(ErrCode.NotFound, "User not found");
    }

    return user;
  }

  async createUser(data: NewUser): Promise<IUser> {
    try {
      return await this.create(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("unique constraint")) {
        throw new APIError(ErrCode.AlreadyExists, "Email already exists");
      }

      log.error(error, "Failed to create user", { data });
      throw new APIError(ErrCode.Internal, "Failed to create user");
    }
  }
}
```

### Error Codes

```typescript
ErrCode.NotFound         // Record doesn't exist
ErrCode.AlreadyExists    // Duplicate record
ErrCode.InvalidArgument  // Bad input
ErrCode.Internal         // Database error
ErrCode.PermissionDenied // Insufficient permissions
```

---

## Transactions

```typescript
import { db } from "../db/db";

class OrderRepository extends BaseRepository<typeof ordersTable> {
  async createOrderWithItems(
    orderData: NewOrder,
    items: NewOrderItem[]
  ): Promise<Order> {
    return await this.db.transaction(async (tx) => {
      // Create order
      const [order] = await tx
        .insert(ordersTable)
        .values(orderData)
        .returning();

      // Create order items
      await tx.insert(orderItemsTable).values(
        items.map((item) => ({
          ...item,
          orderId: order.id,
        }))
      );

      return order;
    });
  }
}
```

---

## Helper Functions

### isUUID()

```typescript
import { isUUID } from "@core/databases/drizzle/repository";

const whereClause = isUUID(identifier)
  ? eq(table.id, identifier)
  : eq(table.alias, identifier);
```

---

## Drizzle ORM Helpers

```typescript
import {
  eq,       // Equals
  ne,       // Not equals
  and,      // AND condition
  or,       // OR condition
  like,     // LIKE (case-sensitive)
  ilike,    // LIKE (case-insensitive)
  inArray,  // IN array
  isNull,   // IS NULL
  isNotNull,// IS NOT NULL
  gt,       // Greater than
  gte,      // Greater or equal
  lt,       // Less than
  lte,      // Less or equal
  desc,     // Descending sort
  asc,      // Ascending sort
  sql,      // Raw SQL
} from "drizzle-orm";
```

### Examples

```typescript
// Equals
eq(userTable.email, "user@example.com")

// AND
and(eq(userTable.active, true), ne(userTable.deleted, true))

// OR
or(eq(userTable.role, "ADMIN"), eq(userTable.role, "USER_ADMIN"))

// LIKE (case-insensitive)
ilike(userTable.name, "%john%")

// IN array
inArray(userTable.id, ["id1", "id2", "id3"])

// Greater than
gt(userTable.createdAt, new Date("2024-01-01"))

// Raw SQL
sql`LOWER(${userTable.email}) = LOWER(${email})`
```

---

## Testing

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { userRepository } from "./user.repository";

describe("UserRepository", () => {
  let testUserId: string;

  beforeEach(async () => {
    const user = await userRepository.create({
      name: "Test User",
      email: "test@example.com",
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    await db.delete(userTable).where(eq(userTable.id, testUserId));
  });

  it("should find user by ID", async () => {
    const user = await userRepository.findById(testUserId);
    expect(user).toBeDefined();
    expect(user?.email).toBe("test@example.com");
  });

  it("should soft delete user", async () => {
    await userRepository.softDelete(testUserId);
    const user = await userRepository.findById(testUserId);
    expect(user?.deleted).toBe(true);
  });
});
```

---

## Best Practices

### ✅ DO

- Export singleton instance
- Add type hints to methods
- Log important operations
- Throw APIError with context
- Use transactions for multi-step operations
- Filter soft-deleted by default

### ❌ DON'T

- Add business logic to repository
- Make external API calls
- Call other Encore services (for example `auditlog`) from repository methods
- Return raw database errors
- Validate business rules

---

## Checklist

- [ ] Extends BaseRepository with table type
- [ ] Constructor calls super(db, table)
- [ ] Export singleton instance
- [ ] Type hints on methods
- [ ] Error handling with APIError
- [ ] Soft delete implemented
- [ ] Tests for key methods
- [ ] No business logic
- [ ] No cross-service side effects in repository (audit log, notifications, etc.)

---

## Real Example

From codebase:

```typescript
// ai_agent_in_catalog.repository.ts
export class AIAgentInCatalogRepository extends BaseRepository<typeof agentInCatalogTable> {
  constructor() {
    super(aiCommonManagementDB, agentInCatalogTable);
  }

  async getByAlias(alias: string): Promise<IAIAgentInCatalog> {
    const model = await this.getOneByQuery({
      where: isUUID(alias)
        ? eq(agentInCatalogTable.id, alias)
        : eq(agentInCatalogTable.uniqueAlias, alias),
    });

    if (!model) {
      throw new APIError(ErrCode.NotFound, "Agent not found");
    }

    return model;
  }

  async getByFilter(request: AIAgentFilterRequest): Promise<AIAgentFilterResponse> {
    const whereClauses: SQL[] = [];

    whereClauses.push(ne(agentInCatalogTable.deleted, true));

    if (request.active != null) {
      whereClauses.push(eq(agentInCatalogTable.active, request.active));
    }

    if (request.agentSpecification != null) {
      whereClauses.push(
        inArray(agentInCatalogTable.agentSpecification, request.agentSpecification)
      );
    }

    return this.getPaginated<IAIAgentInCatalogPublic>({
      request,
      whereClauses,
      whereDefaultQuery: "AND",
      whatToGetFromDB: agentInCatalogTable,
      defaultOrderBy: agentInCatalogTable.name,
    });
  }
}

export const aiAgentInCatalogRepository = new AIAgentInCatalogRepository();
```

---

## Related Docs

- [Database Standards](./database_standards.md) - Schema and migrations
- [API Pagination](./api_pagination_standards.md) - Pagination implementation
