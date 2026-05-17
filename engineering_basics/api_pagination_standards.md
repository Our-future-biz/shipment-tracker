# API Pagination Standards

How to implement pagination in API endpoints and repository layer using `PaginationRequest`, `PaginatedResponse`, and `BaseRepository.getPaginated()`.

> **Related docs:**
> - [Repository Patterns](./repository_patterns.md) - BaseRepository methods
> - [Database Standards](./database_standards.md) - Schema and indexing

---

## Overview

Pagination returns large datasets in pages instead of all at once:
- Better performance
- Lower database load
- Better UX
- Less network traffic

**Components:**
1. `PaginationRequest` - input from client
2. `PaginatedResponse` - output with data + metadata
3. `BaseRepository.getPaginated()` - repository method
4. `PAGINATION_DEFAULTS` - default values

---

## PaginationRequest

```typescript
// Location: packages/lib/src/types.ts
export interface PaginationRequest {
  offset?: number;              // Start from record (default: 0)
  limit?: number;               // Records per page (default: 25, max: 100)
  sortBy?: string;              // Column to sort by
  sortDirection?: "asc" | "desc"; // Sort direction (default: "asc")
}
```

### Parameters

- **offset** - Which record to start from (0 = first page, 25 = second page with limit 25)
- **limit** - Max records per page (auto-capped at MAX_LIMIT)
- **sortBy** - Column name (falls back to defaultOrderBy if invalid)
- **sortDirection** - `"asc"` or `"desc"`

---

## PaginatedResponse

```typescript
// Location: packages/lib/src/types.ts
export interface PaginatedResponse<T> {
  data: T[];           // Array of records
  pagination: Pagination;
}

export interface Pagination {
  total: number;       // Total count in database
  offset: number;      // Current offset
  limit: number;       // Used limit
}
```

### Example Response

```json
{
  "data": [
    { "id": "123", "name": "Agent 1" },
    { "id": "456", "name": "Agent 2" }
  ],
  "pagination": {
    "total": 47,
    "offset": 0,
    "limit": 25
  }
}
```

---

## PAGINATION_DEFAULTS

```typescript
// Location: packages/lib/src/consts.ts
export const PAGINATION_DEFAULTS = {
  OFFSET: 0,
  LIMIT: 25,
  MAX_LIMIT: 100,
} as const;
```

---

## Implementation in API Endpoint

### Step 1: Define Request Interface

```typescript
import type { PaginationRequest } from "@groupon/lib/types";

export interface UserFilterRequest extends PaginationRequest {
  // Filter params
  email?: string;
  role?: UserRole[];
  active?: boolean;

  // Type-safe sortBy
  sortBy?: "name" | "email" | "createdAt";
}
```

### Step 2: Define Response Interface

```typescript
import type { PaginatedResponse } from "@groupon/lib/types";

export interface UserFilterResponse extends PaginatedResponse<IUserPublic> {}
```

### Step 3: Create Endpoint

```typescript
import { api } from "encore.dev/api";

export const getUserList = api(
  {
    path: "/users/list",
    method: "PUT",
    expose: true,
    auth: true,
  },
  async (params: UserFilterRequest): Promise<UserFilterResponse> => {
    return await userService.getFiltered(params);
  }
);
```

### Example Request

```json
{
  "offset": 0,
  "limit": 25,
  "sortBy": "name",
  "sortDirection": "asc",
  "active": true,
  "role": ["ADMIN", "USER_ADMIN"]
}
```

---

## Implementation in Repository

### BaseRepository.getPaginated()

```typescript
async getPaginated<TResult>(data: DrizzlePagination<TResult>): Promise<PaginatedResponse<TResult>>
```

### DrizzlePagination Interface

```typescript
export interface DrizzlePagination<R> {
  request: PaginationRequest;           // Client request
  whereClauses: SQL[] | SQL;            // WHERE conditions
  whereDefaultQuery?: "OR" | "AND";     // How to combine (default: "AND")
  whatToGetFromDB?: any;                // What to select (default: all columns)
  defaultOrderBy: string | PgColumn;    // Default sort column (required)
  defaultLimit?: number;                // Default limit (default: 25)
  defaultMaxLimit?: number;             // Max limit (default: 100)
  transform?: (item: any) => R;         // Transform function
}
```

### Basic Example

```typescript
import { BaseRepository } from "@core/databases/drizzle/repository";
import { eq, ne, inArray, type SQL } from "drizzle-orm";

class AIAgentRepository extends BaseRepository<typeof agentTable> {
  async getByFilter(request: AIAgentFilterRequest): Promise<AIAgentFilterResponse> {
    const whereClauses: SQL[] = [];

    // 1. Always filter soft-deleted FIRST
    whereClauses.push(ne(agentTable.deleted, true));

    // 2. Add optional filters
    if (request.active != null) {
      whereClauses.push(eq(agentTable.active, request.active));
    }

    if (request.agentSpecification != null) {
      whereClauses.push(
        inArray(agentTable.agentSpecification, request.agentSpecification)
      );
    }

    // 3. Call getPaginated
    return this.getPaginated<IAIAgentPublic>({
      request,
      whereClauses,
      whereDefaultQuery: "AND",
      defaultOrderBy: agentTable.name,
    });
  }
}
```

---

## Real Example from Codebase

### Controller

```typescript
// get_list.ai_agent_in_catalog.controller.ts
export interface AIAgentFilterRequest extends PaginationRequest {
  sortBy?: "name" | undefined;
  active?: boolean | null;
  agentSpecification?: ("DEAL" | "MERCHANT" | "OTHER")[] | null;
}

export interface AIAgentFilterResponse extends PaginatedResponse<IAIAgentInCatalogPublic> {}

export const aiAgentInCatalogGetList = api(
  {
    path: "/ai-common-management/agent-catalog/ai-agent-list",
    method: "PUT",
    expose: true,
    auth: true,
  },
  async (params: AIAgentFilterRequest): Promise<AIAgentFilterResponse> => {
    return await aiAgentCatalogService.getFilter(params);
  }
);
```

### Repository

```typescript
// ai_agent_in_catalog.repository.ts
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
```

---

## Advanced Usage

### Custom Transform

```typescript
return this.getPaginated<IUserPublic>({
  request,
  whereClauses,
  defaultOrderBy: userTable.name,
  transform: (user) => ({
    ...user,
    email: user.email.replace(/(.{3}).*(@.*)/, "$1***$2"), // Partially hide email
    deletedAt: undefined, // Don't return deletedAt
  }),
});
```

### Custom Select

```typescript
import { getTableColumns } from "drizzle-orm";

const columns = getTableColumns(userTable);

return this.getPaginated<Pick<IUser, "id" | "name" | "email">>({
  request,
  whereClauses,
  defaultOrderBy: userTable.name,
  whatToGetFromDB: {
    id: columns.id,
    name: columns.name,
    email: columns.email,
  },
});
```

### Custom Limits

```typescript
return this.getPaginated({
  request,
  whereClauses,
  defaultOrderBy: userTable.name,
  defaultLimit: 20,      // Custom default
  defaultMaxLimit: 50,   // Custom max
});
```

---

## Performance

### Add Indexes

```typescript
// schema.ts
export const userTable = pgTable(
  "user",
  { /* columns */ },
  (table) => ({
    // Index sort columns
    nameIdx: index("user_name_idx").on(table.name),
    createdAtIdx: index("user_created_at_idx").on(table.createdAt),

    // Composite index for common filters
    activeCreatedIdx: index("user_active_created_idx").on(
      table.isActive,
      table.createdAt
    ),
  })
);
```

---

## Common Mistakes

### ❌ Forgetting to Filter Soft-Deleted

```typescript
// Bad
const whereClauses: SQL[] = [];
if (request.active != null) {
  whereClauses.push(eq(table.active, request.active));
}
```

```typescript
// Good
const whereClauses: SQL[] = [];
whereClauses.push(ne(table.deleted, true)); // FIRST!
if (request.active != null) {
  whereClauses.push(eq(table.active, request.active));
}
```

### ❌ Missing defaultOrderBy

```typescript
// Bad - will throw error
return this.getPaginated({
  request,
  whereClauses,
});
```

```typescript
// Good
return this.getPaginated({
  request,
  whereClauses,
  defaultOrderBy: table.createdAt, // Required!
});
```

### ❌ Wrong Generic Type

```typescript
// Bad - returns all data including sensitive fields
return this.getPaginated<IUser>({ ... });
```

```typescript
// Good - returns only public fields
return this.getPaginated<IUserPublic>({ ... });
```

---

## Testing

```typescript
import { describe, it, expect } from "vitest";

describe("UserRepository - Pagination", () => {
  it("should return first page", async () => {
    const result = await userRepository.getByFilter({
      offset: 0,
      limit: 10,
    });

    expect(result.data).toHaveLength(10);
    expect(result.pagination.offset).toBe(0);
    expect(result.pagination.limit).toBe(10);
  });

  it("should filter active users", async () => {
    const result = await userRepository.getByFilter({
      active: true,
      offset: 0,
      limit: 100,
    });

    expect(result.data.every((u) => u.active === true)).toBe(true);
  });

  it("should sort by name ascending", async () => {
    const result = await userRepository.getByFilter({
      sortBy: "name",
      sortDirection: "asc",
      offset: 0,
      limit: 5,
    });

    const names = result.data.map((u) => u.name);
    expect(names).toEqual([...names].sort());
  });

  it("should enforce max limit", async () => {
    const result = await userRepository.getByFilter({
      offset: 0,
      limit: 200, // Higher than MAX_LIMIT
    });

    expect(result.data.length).toBeLessThanOrEqual(100);
  });
});
```

---

## Checklist

- [ ] Request extends PaginationRequest
- [ ] Response extends PaginatedResponse<T>
- [ ] sortBy values are type-safe (union type)
- [ ] defaultOrderBy is defined
- [ ] Soft-deleted filtered FIRST
- [ ] Indexes on sort columns
- [ ] Tests cover pagination

---

## FAQ

### Q: Why offset instead of page number?

**A:** More flexible. Can skip any number of records. Page number requires calculation: `offset = (page - 1) * limit`.

### Q: How to implement infinite scroll?

**A:** Increment offset by limit on each load:
```typescript
// Load 1: offset: 0, limit: 25
// Load 2: offset: 25, limit: 25
// Load 3: offset: 50, limit: 25
```

### Q: Custom max limit per endpoint?

**A:** Yes, use `defaultMaxLimit`:
```typescript
return this.getPaginated({
  request,
  whereClauses,
  defaultOrderBy: table.name,
  defaultMaxLimit: 50, // Custom max
});
```

### Q: COUNT query is slow?

**A:** Solutions:
1. Add indexes on filter columns
2. Use partial indexes for soft-delete
3. For huge tables, consider approximation or cache

---

## Summary

**Key points:**

1. Always extend `PaginationRequest` and `PaginatedResponse<T>`
2. Use `BaseRepository.getPaginated()` - don't build custom
3. Always define `defaultOrderBy`
4. Filter soft-deleted records FIRST
5. Use type-safe `sortBy` values (union types)
6. Add indexes on sort columns
7. Test pagination scenarios

---

## Related Docs

- [Repository Patterns](./repository_patterns.md) - BaseRepository methods
- [Database Standards](./database_standards.md) - Indexing and optimization
