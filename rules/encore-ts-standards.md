# Encore TypeScript Development Standards

## Overview

This rule defines the comprehensive coding standards, architecture patterns, and best practices for the Encore TypeScript microservices project at Groupon. These standards are **mandatory** for all developers working on the `apps/encore-ts` codebase and are designed to ensure consistency, scalability, and maintainability across 100+ developers.

---

## 🌟 Reference Implementation: demo_service

> **📍 Location:** `/apps/encore-ts/services/_playground_and_poc/demo_service/`
>
> The `demo_service` is the **canonical reference implementation** for all Encore TypeScript services. It demonstrates:
> - ✅ Complete CRUD operations (Create, Read, Update, Delete, Soft Delete)
> - ✅ Public and private API endpoints
> - ✅ Cron jobs for scheduled background tasks (cleanup old records)
> - ✅ Service layer with business logic, authorization, and audit logging
> - ✅ Repository layer extending BaseRepository
> - ✅ Proper interface/DTO organization
> - ✅ Schema using defaultTableColumns and defaultTableIndexes
> - ✅ Comprehensive testing with mocks and HTTP validation
> - ✅ Correct ORR registration with tribe config
> - ✅ `baseAuthMiddleware` registered in the `Service` middleware stack (after `errorMiddleware`)
>
> **When implementing any service, refer to demo_service as the source of truth.**
> All code examples in this document are taken directly from the demo_service implementation.

---

## Core Principles (Non-Negotiable)

1. **We are not here to repeat how things have been done for the past ten years, nor to hide behind endless corporate rules.** Those are empty excuses without real outcomes or justification. Our focus is on building, delivering, and challenging the status quo to create meaningful results.

2. **Single Responsibility Per Layer:**
   - **Controller**: Receive/validate input, authorization check, call service. **NO database queries, NO business logic**.
   - **Service**: Business rules, orchestration, cross-module coordination. Minimal I/O.
   - **Repository**: **ONLY** data access (queries, transactions). **NO business logic**.

3. **Interfaces Everywhere:** All inputs/outputs are typed **interfaces** (no anonymous JSON). DTOs are explicit.

4. **Fail Fast, Log Contextually:** Bubble typed errors using `APIError`. No silent catches.

5. **Security by Default:** Least privilege, explicit role checks, validated inputs, safe defaults.

6. **File/Folder Naming:** Every file, folder, config follows **required** naming conventions.

7. **ORR Registration Required:** Every Encore service **MUST** register with ORR (Operational Readiness Review) in `encore.service.ts`. No exceptions.

8. **baseAuthMiddleware Required:** Every new Encore service under `apps/encore-ts/services/` **MUST** include `baseAuthMiddleware` from `@core_system/authorization/middleware/auth.middleware` in the `middlewares` array of `new Service(...)`, immediately after `errorMiddleware`. Temporal workflow worker Encore packages under `apps/encore-ts/workflows/` are excluded and follow their worker `encore.service.ts` examples instead.

---

## Project Structure

### Tribe/Ownership Folder Organization

All services MUST be organized under the appropriate tribe/ownership folder:

```
/services/
├── _core_system/           # Core infrastructure & operational services
│   ├── ai-gateway/         # AI infrastructure
│   ├── websocket/          # WebSocket infrastructure
│   ├── authentication/     # Core auth services
│   ├── authorization/      # Core authz services
│   ├── user/              # User management
│   ├── api_tokens/        # API token management
│   └── ...
├── _tribe_b2b/            # Business-to-Business services
│   └── ...
├── _tribe_b2c/            # Business-to-Consumer services
│   └── ...
├── _tribe_core/           # Core business services
│   └── ...
├── _tribe_marketing/      # Marketing services
│   └── ...
└── {individual-services}/ # Legacy services (being migrated to tribes)
```

**When creating a new service:**
1. **Always ask which tribe/team owns it**
2. Place it in the correct tribe folder (e.g., `_tribe_b2b/`, `_core_system/`)
3. Use the matching ORR config for that tribe
4. Register **`baseAuthMiddleware`** in `encore.service.ts` after `errorMiddleware` (see `demo_service/encore.service.ts`)

### Small Microservice Pattern

```
/services/{service-name}/
├── controllers/                    # API endpoint definitions
│   ├── userCreate.controller.ts   # Public API (expose: true, auth: true)
│   └── _internalUserCreate.controller.ts  # Private API (expose: false)
├── services/
│   └── user.service.ts            # Business logic (singleton class)
├── repositories/
│   └── user.repository.ts         # Data access layer (Drizzle/MongoDB)
├── interfaces/
│   └── interfaces.ts              # Type definitions and DTOs
├── schemas/
│   ├── schema.ts                  # Drizzle/MongoDB table schema
│   └── relations.ts               # Optional Drizzle relations
├── db/
│   ├── db.ts                      # Database configuration
│   ├── drizzle.config.ts          # Drizzle configuration
│   └── migrations/                # SQL migration files
├── crons/
│   └── jobName.cron.ts           # Scheduled jobs (use .cron.ts extension)
├── topics/
│   └── topicName.topic.ts        # Pub/Sub topics
├── buckets/
│   └── bucketName.bucket.ts      # Object storage
├── utils/
│   ├── user.utils.ts             # Model-specific utilities
│   └── utils.ts                  # Generic utilities
├── pubsub/
│   ├── _createUser.sub.ts        # Subscribers
│   └── _emitNewUser.pub.ts       # Publishers
├── tests/                         # Test files (mirrors source structure)
│   ├── controllers/
│   │   └── *.controller.test.ts
│   ├── services/
│   │   └── *.service.test.ts
│   └── repositories/
│       └── *.repository.test.ts
├── encore.service.ts              # Encore Service + middleware + ORR (avoid importing for config only)
├── service.config.ts              # Secrets + service-wide constants (same folder as encore.service.ts)
└── README.md                      # Service documentation
```

### Large Microservice Pattern (with Modules)

```
/services/{service-name}/
├── modules/
│   ├── user/                      # Domain module
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── interfaces/
│   │   ├── schemas/
│   │   └── test/
│   └── billing/                   # Another domain module
│       └── [same structure]
├── encore.service.ts
├── service.config.ts              # Optional; use when you have secrets or exported constants
└── README.md
```

---

## Critical Requirements for Every Service

> **🔴 NON-NEGOTIABLE REQUIREMENTS:**
>
> When creating ANY new Encore service, you MUST:
>
> ### 1. **Study the Reference Implementation**
> - Review `/apps/encore-ts/services/_playground_and_poc/demo_service/`
> - Understand the folder structure and file organization
> - Follow the same patterns for controllers, services, repositories
>
> ### 2. **Determine Service Ownership/Tribe**
> **BEFORE creating a service, always ask the user:**
> - "Which tribe/team will own this service?"
> - Available options:
>   - **Core System** (`_core_system`) - Core infrastructure and operational services (authentication, authorization, user management, API tokens, AI services, etc.)
>     - Use `_core_encore_config` + `_coreEncoreORRServiceConfig` for infrastructure services and for operational services (auth, users, tokens)
>   - **B2B Tribe** (`_tribe_b2b`) - Business-to-Business services
>     - Use `_B2B_tribe__encore_one_team_config` + `_B2BTribeORRServiceConfig`
>   - **B2C Tribe** (`_tribe_b2c`) - Business-to-Consumer services
>     - Use `_B2C_tribe__encore_one_team_config` + `_B2CTribeORRServiceConfig`
>   - **Core Tribe** (`_tribe_core`) - Core business services
>     - Use `_Core_tribe_config` + `_CoreTribeORRServiceConfig`
>   - **Marketing Tribe** (`_tribe_marketing`) - Marketing services
>     - Use `_Marketing_tribe_config` + `_MarketingTribeORRServiceConfig`
>
> ### 3. **Create Service Structure** - Following demo_service pattern:
>   - `encore.service.ts` - Encore `Service` wiring, middleware, ORR registration (no secrets/constants here)
>   - `service.config.ts` (optional but recommended when needed) - `secret(...)` definitions and exported service-wide constants, **same directory** as `encore.service.ts`, so callers never import `encore.service.ts` just for config
>    - `schemas/{model}.schema.ts` - Database schema with defaultTableColumns
>    - `interfaces/interfaces.ts` - All DTOs in one file
>    - `repositories/{model}.repository.ts` - Extends BaseRepository
>    - `services/{model}.service.ts` - Business logic with audit logging
>    - `controllers/{model}{Operation}.controller.ts` - API endpoints
>    - `db/db.ts` - Database configuration
>
> ### 4. **ORR Registration** - REQUIRED at the bottom of every `encore.service.ts` file
>    - Enables service monitoring, health checks, and alert policies
>    - Requires TWO configs:
>      1. Tribe config (e.g., `_core_encore_config`)
>      2. Alert policy config (e.g., `_coreEncoreORRServiceConfig`)
>    - See complete example in "Service Configuration" section
>    - Refer to `demo_service/encore.service.ts` for the exact pattern
>
> ### 5. **Register Entity in GROUPON_ENTITY Constants**
>    - **REQUIRED:** Add your entity to `packages/lib/src/consts.ts`
>    - Add to the `ENCORE_DB_ENTITY` object:
>      ```typescript
>      export const ENCORE_DB_ENTITY = {
>        // ... existing entities
>        YOUR_ENTITY: "YOUR_ENTITY",
>      };
>      ```
>    - Use `GROUPON_ENTITY.YOUR_ENTITY` in all audit log calls
>    - This ensures consistent entity naming across the platform
>
> ### 6. **Implement Core Features**
>    - Controllers: Thin API definitions (see demo_service controllers)
>    - Service: Business logic + authorization + audit logging
>    - Repository: Extend BaseRepository, add custom methods if needed
>    - Tests: Co-located with mocks (see demo_service tests)
>
> **Failure to follow these patterns will result in inconsistent code, monitoring failures, and operational issues!**

---

## API Endpoints: Public vs Private

### Public API Endpoints

**Rules:**
- **Must** be secured with `auth: true`
- **Must** use `expose: true`
- **Must** include authorization checks for sensitive operations
- File name: `{model}{Operation}.controller.ts` (e.g., `userCreate.controller.ts`)
- Endpoint name: Regular naming without underscore

**Example:**

```typescript
import { api } from "encore.dev/api";
import { authorization } from "~encore/clients";
import { UserRole } from "@groupon/lib/types";
import { userService } from "../services/user.service";

/**
 * Public API: Get current user profile
 * Requires authentication
 */
export const me = api(
  {
    method: "GET",
    path: "/user/core/me",
    expose: true,
    auth: true,
  },
  async (): Promise<GetMeResponse> => {
    return await userService.getUser();
  }
);

export interface GetMeResponse {
  user: User;
}
```

### Private API Endpoints

**Rules:**
- **Must** start with underscore `_` in both filename and endpoint name
- **Must** use `expose: false`
- **Typically** use `auth: false` (internal service-to-service calls)
- **Cannot** be called from outside Encore services
- Only accessible between internal Encore microservices
- File name: `_{model}{Operation}.controller.ts` (e.g., `_internalUserCreate.controller.ts`)

**Example:**

```typescript
import { api } from "encore.dev/api";
import type { IsEmail } from "encore.dev/validate";
import { userService } from "../services/user.service";

/**
 * Private API: Create user for internal service use only
 * NOT accessible from outside Encore ecosystem
 */
export const _internalUserCreate = api(
  {
    method: "POST",
    path: "/user/core/internal/create",
    expose: false,
    auth: false,
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return userService.createUser(params);
  }
);

export interface UserCreateRequest {
  name: string;
  email: string & IsEmail;
  roles?: UserRole[];
}

export interface UserCreateResponse {
  user: User;
}
```

---

## Controller Standards

### Controller Responsibilities

✅ **DO:**
- Define API endpoints using `encore.dev/api`
- Define controller-specific interfaces in the same controller file (after the endpoint)
- Call service layer methods (singleton instances)
- Return typed responses
- Keep controllers thin (just API definition + service call)
- Use proper HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Include JSDoc comments explaining the endpoint purpose
- Place interfaces AFTER the endpoint definition for better readability

❌ **DON'T:**
- Include business logic (belongs in service layer)
- Include authorization checks (belongs in service layer)
- Make direct database queries (use service → repository)
- Import controller-specific interfaces from shared interfaces file
- Perform data transformations (belongs in service layer)

### Controller Examples

#### Example 1: POST endpoint (Create)

```typescript
import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import type { DemoContent } from "@/_playground_and_poc/demo_service/interfaces/interfaces";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Creates a new demo content item in the system.
 * Requires valid authentication token.
 */
export const demoContentCreate = api(
  {
    method: "POST",
    path: "/demo-service/content",
    expose: true,
    auth: true,
  },
  async (params: CreateDemoContentRequest): Promise<CreateDemoContentResponse> => {
    return await demoService.createContent(params);
  }
);

/**
 * Create Demo Content Request
 * Request payload for creating new demo content
 */
export interface CreateDemoContentRequest {
  // the text of the demo content item (max 100 characters)
  text: string & MinLen<1> & MaxLen<100>;
}

/**
 * Create Demo Content Response
 * Response after successfully creating demo content
 */
export interface CreateDemoContentResponse {
  // the demo content item
  data: DemoContent;
}
```

#### Example 2: GET endpoint with path parameter

```typescript
import { api } from "encore.dev/api";
import type { DemoContent } from "@/_playground_and_poc/demo_service/interfaces/interfaces";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Retrieves a single demo content item by its ID.
 * Requires valid authentication token.
 */
export const demoContentGet = api(
  {
    method: "GET",
    path: "/demo-service/content/:id",
    expose: true,
    auth: true,
  },
  async (params: GetDemoContentRequest): Promise<GetDemoContentResponse> => {
    return await demoService.getContent(params);
  }
);

/**
 * Get Demo Content Request
 * Request payload for retrieving a single demo content item
 */
export interface GetDemoContentRequest {
  // the id of the demo content item
  id: string;
}

/**
 * Get Demo Content Response
 * Response containing the requested demo content item
 */
export interface GetDemoContentResponse {
  // return the demo content item
  data: DemoContent;
}
```

#### Example 3: GET endpoint with query parameters

```typescript
import { api } from "encore.dev/api";
import type { PaginatedResponse, PaginationRequest } from "@groupon/lib/types";
import type { DemoContent } from "@/_playground_and_poc/demo_service/interfaces/interfaces";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Retrieves a paginated list of demo content items.
 * Supports optional text search and pagination parameters.
 * Requires valid authentication token.
 */
export const demoContentList = api(
  {
    method: "GET",
    path: "/demo-service/content",
    expose: true,
    auth: true,
  },
  async (params: ListDemoContentRequest): Promise<ListDemoContentResponse> => {
    return await demoService.listContent(params);
  }
);

/**
 * List Demo Content Request
 * Request payload for listing demo content with pagination and search
 */
export interface ListDemoContentRequest extends PaginationRequest {
  // Optional text search query
  search?: string;
  // Optional flag to include deleted content
  // Default is false
  includeDeleted?: boolean;
}

/**
 * List Demo Content Response
 * Paginated response containing demo content items
 */
export interface ListDemoContentResponse extends PaginatedResponse<DemoContent> {}
```

#### Example 4: PUT endpoint (Update)

```typescript
import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import type { DemoContent } from "@/_playground_and_poc/demo_service/interfaces/interfaces";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Updates an existing demo content item.
 */
export const demoContentUpdate = api(
  {
    method: "PUT",
    path: "/demo-service/content/:id",
    expose: true,
    auth: true,
  },
  async (params: UpdateDemoContentRequest): Promise<UpdateDemoContentResponse> => {
    return await demoService.updateContent(params);
  }
);

/**
 * Update Demo Content Request
 * Request payload for updating existing demo content
 */
export interface UpdateDemoContentRequest {
  // the id of the demo content item
  id: string;
  // the text of the demo content item
  text: string & MinLen<1> & MaxLen<100>;
}

/**
 * Update Demo Content Response
 * Response after successfully updating demo content
 */
export interface UpdateDemoContentResponse {
  // the demo content item
  data: DemoContent;
}
```

#### Example 5: DELETE endpoint with role restriction

```typescript
import { api } from "encore.dev/api";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Hard deletes a demo content item by its ID (permanently removes from database).
 * Requires ADMIN role.
 */
export const demoContentDelete = api(
  {
    method: "DELETE",
    path: "/demo-service/content/:id",
    expose: true,
    auth: true,
    tags: ["ADMIN"], // Document role requirement
  },
  async (params: DeleteDemoContentRequest): Promise<DeleteDemoContentResponse> => {
    return await demoService.deleteContent(params);
  }
);

/**
 * Delete Demo Content Request
 * Request payload for hard-deleting demo content (permanently removes from database)
 */
export interface DeleteDemoContentRequest {
  // the id of the demo content item
  id: string;
}

/**
 * Delete Demo Content Response
 * Response after successfully deleting demo content
 */
export interface DeleteDemoContentResponse {
  // the success of the operation
  success: boolean;
}
```

#### Example 6: PATCH endpoint for soft delete

```typescript
import { api } from "encore.dev/api";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Soft deletes a demo content item by its ID (marks as deleted without removing from database).
 */
export const demoContentSoftDelete = api(
  {
    method: "PATCH",
    path: "/demo-service/content/:id/soft-delete",
    expose: true,
    auth: true,
  },
  async (params: SoftDeleteDemoContentRequest): Promise<SoftDeleteDemoContentResponse> => {
    return await demoService.softDeleteContent(params);
  }
);

/**
 * Soft Delete Demo Content Request
 * Request payload for soft-deleting demo content (marks as deleted without removing from database)
 */
export interface SoftDeleteDemoContentRequest {
  // the id of the demo content item
  id: string;
}

/**
 * Soft Delete Demo Content Response
 * Response after successfully soft-deleting demo content
 */
export interface SoftDeleteDemoContentResponse {
  // the success of the operation
  success: boolean;
}
```

#### Example 7: Private internal endpoint

```typescript
import { api } from "encore.dev/api";
import type {
  ListDemoContentRequest,
  ListDemoContentResponse,
} from "@/_playground_and_poc/demo_service/controllers/demoContentList.controller";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Internal endpoint for service-to-service communication.
 * Lists demo content without authorization checks.
 * NOT accessible from outside Encore ecosystem.
 *
 * Note: Reuses interfaces from the public list endpoint
 */
export const _internalDemoContentList = api(
  {
    method: "GET",
    path: "/demo-service/internal/content",
    expose: false,
    auth: false,
    tags: ["INTERNAL"],
  },
  async (params: ListDemoContentRequest): Promise<ListDemoContentResponse> => {
    return await demoService.internalListContent(params);
  }
);
```

---

## Service Layer Standards

### Service Responsibilities

✅ **DO:**
- Implement business logic and orchestration
- Validate business rules (beyond type validation)
- Call repository methods for data access
- Perform authorization checks using `authorization.validatePermission()`
- Log important operations with context
- Create audit logs for mutations (create, update, delete)
- Use `getAuthData()` to access authenticated user information
- Call other services using `~encore/clients`
- Use singleton pattern with exported class instances
- Build dynamic where clauses for complex queries
- Handle not-found cases with `APIError.notFound()`

❌ **DON'T:**
- Make direct database queries (use repositories)
- Handle HTTP-specific logic
- Parse request bodies or headers directly
- Skip audit logging for mutations

### Cross-service boundaries and `~encore/clients` (CRITICAL)

Applies across **all** Encore TS services under `apps/encore-ts/services/`.

Each service is wired to **its own** database. If service A imports service B's repository, service class, or `db` and invokes it, queries run on **A's** connection — wrong schema and hard-to-debug failures.

More generally, **any** behavior owned by another Encore service (data, rules, side effects) must execute **inside that service**. From A you only call B through **`~encore/clients`**. For orchestration across several services, use **successive client calls** (e.g. `user._x()` then `authorization._y()`), not a mix of client calls and direct imports of sibling `services/` or `repositories/`.

- ✅ **DO:** Use `~encore/clients` for every cross-service hop.
- ❌ **DON'T:** Import another service's `repositories/`, `services/`, `db`, or controllers into a different service to reuse implementation.

### Service Template with Full CRUD Examples

```typescript
import { AUDITLOG_ACTION, GROUPON_ENTITY } from "@groupon/lib/consts";
import { UserRole } from "@groupon/lib/types";
import { ilike, isNull, type SQL } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { MY_PAGINATION_DEFAULTS } from "@/_playground_and_poc/demo_service/service.config";
import type {
  CreateDemoContentRequest,
  CreateDemoContentResponse,
  DeleteDemoContentRequest,
  DeleteDemoContentResponse,
  DemoContent,
  GetDemoContentRequest,
  GetDemoContentResponse,
  ListDemoContentRequest,
  ListDemoContentResponse,
  UpdateDemoContentRequest,
  UpdateDemoContentResponse,
} from "@/_playground_and_poc/demo_service/interfaces/interfaces";
import { demoContentRepository } from "@/_playground_and_poc/demo_service/repositories/demoContent.repository";
import { demoContentTable } from "@/_playground_and_poc/demo_service/schemas/demoContent.schema";
import { getAuthData } from "~encore/auth";
import { auditlog, authorization } from "~encore/clients";

/**
 * Demo Service
 * Business logic layer for demo content management
 * Implements authorization checks and orchestrates repository calls
 */
class DemoService {
  /**
   * Create new demo content
   * Requires authentication
   */
  async createContent(request: CreateDemoContentRequest): Promise<CreateDemoContentResponse> {
    // Optional: How you get authenticated user
    const auth = getAuthData()!;

    // Optional: This is how you log in your service
    log.info("Creating demo content", { userId: auth.userID });

    // This is how you use the repository
    const data = await demoContentRepository.create(request);

    // Required: This is how you create an audit log
    await auditlog._auditLogCreate({
      action: AUDITLOG_ACTION.CREATE,
      entity: GROUPON_ENTITY.DEMO_CONTENT,
      entityId: data.id,
      data,
    });

    return { data };
  }

  /**
   * Update existing demo content
   */
  async updateContent(request: UpdateDemoContentRequest): Promise<UpdateDemoContentResponse> {
    // Optional: Custom business validations
    if (!request.text || request.text.trim() === "") {
      throw APIError.invalidArgument("Text content cannot be empty");
    }

    // Optional: Get the old content primarily for audit log
    const oldData = await demoContentRepository.getById<DemoContent>(request.id);
    if (!oldData) {
      throw APIError.notFound("Demo content not found");
    }

    // Update the content using default repository update method
    const data = await demoContentRepository.update(request.id, request);

    // Required: This is how you create an audit log with diff
    await auditlog._auditLogCreateDiff({
      action: AUDITLOG_ACTION.UPDATE,
      entity: GROUPON_ENTITY.DEMO_CONTENT,
      entityId: data.id,
      data,
      oldData,
    });

    return { data };
  }

  /**
   * Get single demo content by ID
   * Public access (requires authentication)
   */
  async getContent(request: GetDemoContentRequest): Promise<GetDemoContentResponse> {
    // Optional: Consider if we need logging for simple get requests
    log.info("Getting demo content", { id: request.id });

    const data = await demoContentRepository.getById<DemoContent>(request.id);
    if (!data) {
      throw APIError.notFound("Demo content not found");
    }

    return { data };
  }

  /**
   * List demo content with pagination
   * Public access (requires authentication)
   */
  async listContent(request: ListDemoContentRequest): Promise<ListDemoContentResponse> {
    // Optional: Example of how to validate permission
    await authorization.validatePermission({
      requiredRoles: [UserRole.VIEWER],
    });

    // Optional: Build where clauses for search
    const whereClauses: SQL[] = [];
    const searchTerm = request.search?.trim();
    if (searchTerm && searchTerm.length > 0) {
      whereClauses.push(ilike(demoContentTable.text, `%${searchTerm}%`));
    }

    // Optional: If includeDeleted is false, add the deletedAt is null condition
    if (!request.includeDeleted) {
      whereClauses.push(isNull(demoContentTable.deletedAt));
    }

    // Required: Return the paginated data
    return await demoContentRepository.getPaginated<DemoContent>({
      request,
      whereClauses,
      defaultOrderBy: demoContentTable.createdAt,
      defaultMaxLimit: MY_PAGINATION_DEFAULTS.MAX_LIMIT,
      defaultLimit: MY_PAGINATION_DEFAULTS.DEFAULT_LIMIT,
    });
  }

  /**
   * Soft delete demo content
   * Marks content as deleted without removing from database
   */
  async softDeleteContent(request: DeleteDemoContentRequest): Promise<DeleteDemoContentResponse> {
    // Optional: Get the old content primarily for audit log
    const oldData = await demoContentRepository.getById<DemoContent>(request.id);
    if (!oldData) {
      throw APIError.notFound("Demo content not found");
    }

    await demoContentRepository.softDelete(request.id);

    // Required: Create an audit log
    await auditlog._auditLogCreate({
      action: AUDITLOG_ACTION.DELETE,
      entity: GROUPON_ENTITY.DEMO_CONTENT,
      entityId: request.id,
      data: oldData,
    });

    return { success: true };
  }

  /**
   * Delete demo content (hard delete)
   * Permanently removes content from database
   * Requires ADMIN role
   */
  async deleteContent(request: DeleteDemoContentRequest): Promise<DeleteDemoContentResponse> {
    // Authorization check - only admins can delete
    await authorization.validatePermission({
      requiredRoles: [UserRole.ADMIN],
    });

    const data = await demoContentRepository.getById<DemoContent>(request.id);
    if (!data) {
      throw APIError.notFound("Demo content not found");
    }

    // Note: no return value from delete
    await demoContentRepository.delete(request.id);

    // Required: Create an audit log
    await auditlog._auditLogCreate({
      action: AUDITLOG_ACTION.DELETE,
      entity: GROUPON_ENTITY.DEMO_CONTENT,
      entityId: request.id,
      data,
    });

    return { success: true };
  }

  /**
   * Internal method for service-to-service calls
   * No authorization checks
   */
  async internalListContent(request: ListDemoContentRequest): Promise<ListDemoContentResponse> {
    log.info("Internal listing demo content", {
      limit: request.limit,
      offset: request.offset,
      search: request.search,
    });

    return await demoContentRepository.getPaginated({
      request,
      whereClauses: [],
      defaultOrderBy: demoContentTable.createdAt,
    });
  }
}

// Always export singleton instance
export const demoService = new DemoService();
```

### Key Service Patterns

1. **Authentication**: Use `getAuthData()` to get current user info
2. **Authorization**: Use `authorization.validatePermission({ requiredRoles: [...] })`
3. **Logging**: Use `log.info()`, `log.error()` with contextual data
4. **Audit Logs**: ALWAYS create audit logs for mutations:
   - `auditlog._auditLogCreate()` for create/delete operations
   - `auditlog._auditLogCreateDiff()` for update operations
   - **IMPORTANT**: Use `GROUPON_ENTITY.YOUR_ENTITY` constant (not string literals)
   - **REQUIRED**: Add new entities to `packages/lib/src/consts.ts` in `ENCORE_DB_ENTITY`
5. **Error Handling**: Use `APIError.notFound()`, `APIError.invalidArgument()`, etc.
6. **Business Validation**: Validate beyond types (e.g., trimmed strings, business rules)
7. **Dynamic Queries**: Build `whereClauses: SQL[]` arrays for complex filtering
8. **Pagination**: Use `repository.getPaginated()` with pagination defaults from `service.config.ts`

---

## Registering New Entities

### Why Register Entities?

Every service that tracks data in audit logs **MUST** register its entity type in the central `GROUPON_ENTITY` constants. This ensures:
- Consistent entity naming across all services
- Type-safe entity references
- Centralized entity management
- Proper audit log categorization

### How to Register a New Entity

**Step 1: Add to `packages/lib/src/consts.ts`**

```typescript
// File: packages/lib/src/consts.ts

export const ENCORE_DB_ENTITY = {
  TAGGING_JOB: "TAGGING_JOB",
  BRAND: "BRAND",
  USER: "USER",
  TAG: "TAG",
  // ... other entities
  YOUR_ENTITY: "YOUR_ENTITY", // ✅ Add your entity here, Use UPPER_SNAKE_CASE
};
```

**Step 2: Use in Service Layer**

```typescript
// File: services/your_service/services/your.service.ts

import { AUDITLOG_ACTION, GROUPON_ENTITY } from "@groupon/lib/consts";

// ✅ CORRECT: Use the constant
await auditlog._auditLogCreate({
  action: AUDITLOG_ACTION.CREATE,
  entity: GROUPON_ENTITY.YOUR_ENTITY,  // Type-safe!
  entityId: data.id,
  data,
});

// ❌ WRONG: Don't use string literals
await auditlog._auditLogCreate({
  action: AUDITLOG_ACTION.CREATE,
  entity: "YOUR_ENTITY",  // Hard to refactor, error-prone
  entityId: data.id,
  data,
});
```

### Entity Naming Conventions

- Use `UPPER_SNAKE_CASE` for entity names
- Use singular form (e.g., `TODO`, not `TODOS`)
- Be descriptive but concise
- Match your table/model name concept

**Examples:**
- ✅ `TODO`, `USER`, `PRODUCT`, `ORDER`
- ✅ `DEMO_CONTENT`, `API_TOKEN`, `FAQ_ITEM`
- ❌ `todos`, `Users`, `product-item`

### Complete Example: Adding TODO Entity

```typescript
// 1. Add to packages/lib/src/consts.ts
export const ENCORE_DB_ENTITY = {
  // ... existing entities
  TODO: "TODO",  // ✅ Added
};

// 2. Use in todo.service.ts
import { AUDITLOG_ACTION, GROUPON_ENTITY } from "@groupon/lib/consts";

class TodoService {
  async createTodo(request: CreateTodoRequest): Promise<CreateTodoResponse> {
    const data = await todoRepository.create(request);

    // ✅ Use the registered constant
    await auditlog._auditLogCreate({
      action: AUDITLOG_ACTION.CREATE,
      entity: GROUPON_ENTITY.TODO,  // Type-safe and consistent
      entityId: data.id,
      data,
    });

    return { data };
  }
}
```

---

## Repository Layer Standards

### Repository Responsibilities

✅ **DO:**
- Extend `BaseRepository<TableType>` for standard CRUD operations
- Handle all database operations
- Use Drizzle ORM for type-safe queries
- Add custom business-specific methods when needed
- Use singleton pattern with exported class instances
- Return data or throw errors (no null returns from BaseRepository methods)

❌ **DON'T:**
- Include business logic (belongs in service layer)
- Validate business rules (belongs in service layer)
- Create audit logs (belongs in service layer)
- Skip extending BaseRepository (unless you have a very specific reason)

### Repository Template (Extends BaseRepository)

```typescript
import { BaseRepository } from "@core/databases/drizzle/repository";
import { eq } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import { db } from "@/_playground_and_poc/demo_service/db/db";
import type { DemoContent } from "@/_playground_and_poc/demo_service/interfaces/interfaces";
import { demoContentTable } from "@/_playground_and_poc/demo_service/schemas/demoContent.schema";

/**
 * Demo Content Repository
 * Handles all database operations for demo content
 * Extends BaseRepository for standard CRUD operations
 */
class DemoContentRepository extends BaseRepository<typeof demoContentTable> {
  constructor() {
    super(db, demoContentTable);
  }

  // Add your own business-specific methods here
  // BaseRepository already provides:
  // - create(data)
  // - getById(id)
  // - getByColumn(column, value)
  // - getOneByQuery(where)
  // - update(id, data)
  // - updateByColumn(column, value, data)
  // - delete(id)
  // - getAll(limit)
  // - getPaginated(options)

  /**
   * Soft delete implementation
   * Custom method specific to this repository
   */
  async softDelete(id: string): Promise<DemoContent> {
    const [result] = await this.db
      .update(this.table)
      .set({ deletedAt: new Date() })
      .where(eq(this.table.id, id))
      .returning();

    if (!result) {
      throw APIError.notFound("Demo content not found");
    }

    return result;
  }
}

// Always export singleton instance
export const demoContentRepository = new DemoContentRepository();
```

### BaseRepository Methods (Inherited)

When you extend `BaseRepository`, your repository automatically gets these methods:

#### 1. **create(data)** - Create a new record
```typescript
const newRecord = await repository.create({
  text: "Sample content",
  // timestamps are added automatically
});
```

#### 2. **getById(id, transform?)** - Get record by ID
```typescript
const record = await repository.getById<DemoContent>(id);
if (!record) {
  throw APIError.notFound("Record not found");
}
```

#### 3. **getByColumn(column, value)** - Get record by any column
```typescript
const record = await repository.getByColumn(table.email, "user@example.com");
```

#### 4. **getOneByQuery(where)** - Get record with complex where clause
```typescript
import { or, eq } from "drizzle-orm";

const record = await repository.getOneByQuery(
  or(
    eq(table.id, params.id),
    eq(table.slug, params.slug)
  )
);
```

#### 5. **update(id, data)** - Update record by ID
```typescript
const updated = await repository.update(id, {
  text: "Updated content",
  // updatedAt is set automatically
});
```

#### 6. **updateByColumn(column, value, data)** - Update by any column
```typescript
const updated = await repository.updateByColumn(
  table.email,
  "user@example.com",
  { name: "New Name" }
);
```

#### 7. **delete(id)** - Hard delete record
```typescript
await repository.delete(id);
```

#### 8. **getAll(limit?)** - Get all records
```typescript
const allRecords = await repository.getAll(100); // default limit: 100
```

#### 9. **getPaginated(options)** - Get paginated results
```typescript
return await repository.getPaginated<DemoContent>({
  request,                           // Contains limit, offset, sortBy, sortDirection
  whereClauses: [                             // Array of SQL conditions
    ilike(table.text, `%${searchTerm}%`),
    isNull(table.deletedAt),
  ],
  defaultOrderBy: table.createdAt,            // Column to sort by
  defaultMaxLimit: MY_PAGINATION_DEFAULTS.MAX_LIMIT,
  defaultLimit: MY_PAGINATION_DEFAULTS.DEFAULT_LIMIT,
});

// Returns PaginatedResponse<T>:
// {
//   pagination: { total: number, offset: number, limit: number },
//   data: T[]
// }
```

### When to Add Custom Methods

Add custom methods to your repository when:
- You need soft delete functionality
- You have complex queries not covered by BaseRepository
- You need business-specific data access patterns

**Example custom methods:**
- `softDelete(id)` - Mark record as deleted
- `findActiveByUser(userId)` - Complex business query
- `bulkUpdate(ids, data)` - Batch operations

---

## Database Standards

### Drizzle ORM Schema

**Location:** `/schemas/{model}.schema.ts`

**Standards:**
- Use `defaultTableColumns` for standard fields (id, timestamps)
- Use `defaultTableIndexes` for standard indexes
- Use snake_case for table names
- Use snake_case for column names
- Keep schemas focused (one model per file)
- Rely on audit logs for tracking changes instead of storing audit fields

**Template:**

```typescript
import { defaultTableColumns, defaultTableIndexes } from "@core/databases/drizzle/defaults";
import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * Demo table schema
 * This is a simple example table with text content
 *
 * Note: We rely on audit logs for tracking all changes (create/update/delete)
 * instead of storing audit fields in this table
 */
export const demoContentTable = pgTable(
  "demo_content",
  {
    // Gets id, createdAt, updatedAt, deletedAt from defaultTableColumns
    ...defaultTableColumns,

    // Your business-specific fields here
    text: text("text").notNull(),
  },
  (table) => [...defaultTableIndexes("demo_content", table)]
);
```

**What `defaultTableColumns` provides:**
- `id: uuid("id").primaryKey().defaultRandom()`
- `createdAt: timestamp("created_at").notNull().defaultNow()`
- `updatedAt: timestamp("updated_at").notNull().defaultNow()`
- `deletedAt: timestamp("deleted_at")` (for soft deletes)

**What `defaultTableIndexes` provides:**
- Index on `id` column
- Index on `createdAt` column
- Index on `deletedAt` column (for soft delete queries)

### Database Configuration

**Location:** `/db/db.ts`

**Template:**

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Pool } from "pg";
import * as schema from "../schemas/demoContent.schema";

/**
 * Database instance for demo_service
 */
const DB = new SQLDatabase("demo_service", {
  migrations: {
    path: "migrations",
    source: "drizzle",
  },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, { schema });
```

**Key points:**
1. Service name must match your service directory name
2. Migrations path is relative to the `db` directory
3. Use `Pool` from `pg` for connection pooling
4. Pass schema to drizzle for type inference

### Migrations

**Location:** `/db/migrations/`

**Naming:** `{number}_{description}.sql`

**⚠️ IMPORTANT:** Migrations must **NEVER** be hand-written. Always generate them using Drizzle Kit.

**Generate migration:**

Run from the `apps/encore-ts/` directory, specifying the service config:

```bash
cd apps/encore-ts
npx drizzle-kit generate --config=services/_core_system/<service>/db/drizzle.config.ts
```

Example:
```bash
cd apps/encore-ts
npx drizzle-kit generate --config=services/_core_system/authentication/db/drizzle.config.ts
```

This command automatically generates SQL migration files based on your schema changes in the Drizzle schema files. Hand-written migrations can lead to inconsistencies and are not supported.

---

## Secrets & Environment Management

Define secrets in **`service.config.ts`** at the service root (**next to** `encore.service.ts`), not in `encore.service.ts`. Importing `encore.service.ts` evaluates `new Service(...)` and `registerService(...)`; pulling secrets from there causes that **side effect** whenever any module imports the file. Same rule applies to **service-wide constants** (see the **Service configuration** section below).

### Defining Secrets

**Location:** `service.config.ts` (same directory as `encore.service.ts`)

**Pattern:**

```typescript
import { secret } from "encore.dev/config";

// ==== SERVICE SECRETS ================================
const OPENAI_API_KEY = secret("OPENAI_API_KEY");
const DATABASE_URL = secret("DATABASE_URL");

// Use secrets in initialization
export const openAIClient = new OpenAI({
  LITE_LLM_apiKey: OPENAI_API_KEY(),
});
```

### Setting Secrets

**Local development:**

```bash
encore secret set --type local SECRET_NAME
```

**Staging:**

```bash
encore secret set --type development SECRET_NAME
```

**Production:**

```bash
encore secret set --type production SECRET_NAME
```

---

## Service configuration (`encore.service.ts` + `service.config.ts`)

### `service.config.ts` — secrets and constants

**Location:** Service root, **same level** as `encore.service.ts`.

**Put here:** `secret(...)` declarations, pagination defaults, token lifetimes, and any other **exported service-wide constants** that business code imports.

**Do not** define those in `encore.service.ts`. Code that only needs constants or secrets should import `@/.../service.config` so it never loads the Encore service registration as a side effect of the import.

### `encore.service.ts` — Encore wiring only

**Location:** Root of service directory

**Purpose:**
- Initialize Encore service (`new Service(...)`)
- Configure middleware (required: `errorMiddleware`, then **`baseAuthMiddleware`** for services under `apps/encore-ts/services/`)
- Initialize external clients when they must be tied to service startup (otherwise prefer a dedicated module)
- Register with ORR (Operational Readiness Review)

> **⚠️ CRITICAL REQUIREMENT:**
>
> **EVERY Encore service MUST include ORR registration with the correct tribe-specific config!**
>
> The ORR (Operational Readiness Review) registration block at the bottom of `encore.service.ts` is **mandatory** for all services. This enables proper monitoring, alerting, and service management across the platform.
>
> **Always use the appropriate tribe/ownership config based on which team owns the service.**
>
> **EVERY new service under `apps/encore-ts/services/` MUST register `baseAuthMiddleware`** (import from `@core_system/authorization/middleware/auth.middleware`) in the `middlewares` array **after** `errorMiddleware`, matching `demo_service/encore.service.ts`. Add `metadataMiddleware` or other shared middleware **after** `baseAuthMiddleware` when your tribe pattern requires it.

**`service.config.ts` template** (secrets + constants; import from services, not from `encore.service.ts`):

```typescript
import { secret } from "encore.dev/config";

// ==== SERVICE SECRETS ================================================================================================
// const API_KEY = secret("API_KEY");

// ==== SERVICE CONSTANTS ==============================================================================================

export const MY_PAGINATION_DEFAULTS = {
  MAX_LIMIT: 50,
  DEFAULT_LIMIT: 5,
  DEFAULT_OFFSET: 0,
};
```

**`encore.service.ts` template for Core System Services** (includes infrastructure and operational services):

```typescript
import { errorMiddleware } from "@core/middleware/error";
import { baseAuthMiddleware } from "@core_system/authorization/middleware/auth.middleware";
import { registerService } from "@core/service_management/initiator/init.service";
import { GrouponServiceProvider } from "@core/service_management/models/models";
import { appMeta } from "encore.dev";
import { Service } from "encore.dev/service";
import { _core_encore_config } from "@/_core_system/core_encore.orr";
import { _coreEncoreORRServiceConfig } from "@/_core_system/core_encore_alert_policy.orr";
import { service_management } from "~encore/clients";

// ==== ENCORE CONFIG ==================================================================================================

/**
 * Service description for documentation
 * Explain what this service does and its purpose
 */
export default new Service("service_name", {
  middlewares: [errorMiddleware, baseAuthMiddleware],
});

// ==== ORR GLOBAL GROUPON SERVICE CONFIG ==============================================================================
/**
 * ORR Management for this service
 * - Required for every Encore Service!
 */
registerService(appMeta(), () =>
  service_management._encoreServiceAdd(
    new GrouponServiceProvider("service_name", {
      name: "Service Display Name",
      description: "Service description for monitoring and documentation",

      // replace that with your tribe config
      ..._core_encore_config,

      // replace that with your tribe ORR config
      ..._coreEncoreORRServiceConfig,
    }).init()
  )
);
```

**For other tribe configs, change the imports:**

```typescript
// For Core System - Infrastructure services:
import { _core_encore_config } from "@/_core_system/core_encore.orr";
import { _coreEncoreORRServiceConfig } from "@/_core_system/core_encore_alert_policy.orr";

// For Core System - Operational services (auth, users, tokens):
import { _core_system_config } from "@/_core_system/core_encore.orr";
import { _coreOperationORRServiceConfig } from "@/_core_system/core_operation_alert_policy.orr";

// For B2B Tribe services:
import { _B2B_tribe__encore_one_team_config } from "@/_tribe_b2b/b2b.orr";
import { _B2BTribeORRServiceConfig } from "@/_tribe_b2b/b2b_alert_policy.orr";

// For B2C Tribe services:
import { _B2C_tribe__encore_one_team_config } from "@/_tribe_b2c/b2c.orr";
import { _B2CTribeORRServiceConfig } from "@/_tribe_b2c/b2c_alert_policy.orr";

// For Core Tribe services:
import { _Core_tribe_config } from "@/_tribe_core/core.orr";
import { _CoreTribeORRServiceConfig } from "@/_tribe_core/core_alert_policy.orr";

// For Marketing Tribe services:
import { _Marketing_tribe_config } from "@/_tribe_marketing/marketing.orr";
import { _MarketingTribeORRServiceConfig } from "@/_tribe_marketing/marketing_alert_policy.orr";
```

**Important Notes:**

1. **Two configs are required:**
   - **Tribe config** (e.g., `_core_encore_config`) - Base service configuration
   - **Alert policy config** (e.g., `_coreEncoreORRServiceConfig`) - Alert and monitoring policies

2. **Service constants pattern:**
   - Export pagination defaults and other service-wide constants from **`service.config.ts`**
   - Use uppercase with underscores for constant names
   - Group by purpose (e.g., pagination, timeouts, limits)

3. **Secrets:**
   - Define in **`service.config.ts`** only if your service needs them
   - Keep the section with comment even if empty for consistency

---

## Naming Conventions

### Files

- **Controllers:** `{model}{Operation}.controller.ts` (e.g., `demoContentCreate.controller.ts`)
  - Private: `_{model}{Operation}.controller.ts` (e.g., `_internalDemoContentList.controller.ts`)
  - Cron: `_cron{JobName}.controller.ts` (e.g., `_cronDemoCleanup.controller.ts`)
- **Controller Tests:** `{model}.controllers.test.ts` (one consolidated test file per model)
- **Cron Jobs:** `{jobName}.cron.ts` (e.g., `demoContentCleanup.cron.ts`)
- **Services:** `{model}.service.ts` (e.g., `demo.service.ts`)
- **Service Tests:** `{model}.service.test.ts`
- **Repositories:** `{model}.repository.ts` (e.g., `demoContent.repository.ts`)
- **Repository Tests:** `{model}.repository.test.ts`
- **Interfaces:** `interfaces.ts` (single file per service/module)
- **Schemas:** `{model}.schema.ts` (e.g., `demoContent.schema.ts`)
- **Utils:** `{model}.utils.ts` or `utils.ts`

**Examples from demo_service:**
```
controllers/
├── demoContentCreate.controller.ts
├── demoContentGet.controller.ts
├── demoContentList.controller.ts
├── demoContentUpdate.controller.ts
├── demoContentDelete.controller.ts
├── demoContentSoftDelete.controller.ts
├── _cronDemoCleanup.controller.ts           # Cron endpoint
└── _internalDemoContentList.controller.ts   # Private API

crons/
└── demoContentCleanup.cron.ts               # ✅ Uses .cron.ts extension

services/
└── demo.service.ts

repositories/
└── demoContent.repository.ts

tests/                                        # ✅ Dedicated test directory
├── controllers/
│   └── demoContent.controllers.test.ts     # ✅ One test file for all controllers
├── services/
│   └── demo.service.test.ts
└── repositories/
    └── demoContent.repository.test.ts

interfaces/
└── interfaces.ts

schemas/
└── demoContent.schema.ts
```

**Controller Test Naming Pattern:**
- ✅ **Use:** `{model}.controllers.test.ts` (plural "controllers")
- ❌ **Don't use:** `{model}{Operation}.controller.test.ts` (one test file per operation)
- **Why?** Consolidates all controller tests in one file for better isolation and centralized mocking

### Code Elements

- **Types/Interfaces:** `PascalCase` (e.g., `DemoContent`, `CreateDemoContentRequest`)
- **API Request/Response Interfaces:** `{Operation}{Model}{Request/Response}`
  - Examples:
    - `CreateDemoContentRequest`, `CreateDemoContentResponse`
    - `UpdateDemoContentRequest`, `UpdateDemoContentResponse`
    - `GetDemoContentRequest`, `GetDemoContentResponse`
    - `ListDemoContentRequest`, `ListDemoContentResponse`
    - `DeleteDemoContentRequest`, `DeleteDemoContentResponse`
- **Services/Classes:** `PascalCase` (e.g., `DemoService`, `DemoContentRepository`)
- **Service Instances:** `camelCase` with type suffix (e.g., `demoService`, `demoContentRepository`)
- **Functions/Variables:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MY_PAGINATION_DEFAULTS`, `MAX_LIMIT`)
- **Private class fields:** Use `#` prefix (e.g., `#client`, `#cache`)
- **Database tables:** `snake_case` singular (e.g., `demo_content`, `user_profile`)
- **Database columns:** `snake_case`

---

## Error Handling

### Using APIError

**Import:**

```typescript
import { APIError, ErrCode } from "encore.dev/api";
```

**Common Patterns:**

```typescript
// Not found
throw APIError.notFound("User not found");

// Invalid argument
throw APIError.invalidArgument("Email is required");

// Permission denied
throw APIError.permissionDenied("Insufficient permissions");

// Internal error
throw APIError.internal("Failed to process request");

// With details
throw new APIError(ErrCode.InvalidArgument, "Validation failed")
  .withDetails({ errors: validationErrors });
```

### Error Middleware

**All services must use `errorMiddleware`:**

```typescript
import { errorMiddleware } from "@core/middleware/error";
import { baseAuthMiddleware } from "@core_system/authorization/middleware/auth.middleware";

export default new Service("service_name", {
  middlewares: [errorMiddleware, baseAuthMiddleware],
});
```

**New services under `apps/encore-ts/services/` must also register `baseAuthMiddleware`** immediately after `errorMiddleware` (see `demo_service/encore.service.ts`). Append `metadataMiddleware` or other middleware after `baseAuthMiddleware` when required by your tribe or integration pattern.

---

## Authorization & Authentication

### Getting Auth Data

```typescript
import { getAuthData } from "~encore/auth";

const authData = getAuthData();
if (!authData) {
  throw APIError.unauthenticated("Not authenticated");
}

const userId = authData.userID;
```

### Role-Based Access Control

```typescript
import { authorization } from "~encore/clients";
import { UserRole } from "@groupon/lib/types";

// Validate permission
await authorization.validatePermission({
  requiredRoles: [UserRole.ADMIN, UserRole.USER_ADMIN],
});
```

---

## Interfaces & DTOs (Data Transfer Objects)

### Location and Organization

**Controller-Specific Interfaces:**
- Define directly in controller files, AFTER the endpoint definition
- Keep interfaces close to where they're used
- Makes it easy to see what data an endpoint accepts/returns

**Shared Interfaces (entities, common types):**
- Keep in `/interfaces/interfaces.ts` for types used across multiple files
- Examples: Entity types, common response structures

**Standards:**
- Use JSDoc comments for documentation
- Extend standard base types where applicable
- Use Encore validators for type-level validation
- Keep interfaces focused and small
- Place controller interfaces AFTER the endpoint definition

### Shared Interfaces Template (interfaces/interfaces.ts)

**Only include shared types here - entity definitions and types used across multiple controllers:**

```typescript
import type { DrizzleBaseEntity } from "@core/databases/drizzle/interface";

/**
 * Demo Content Type
 * Represents a demo content item in the system
 *
 * Note: Audit information (who created/updated/deleted and when) is tracked
 * in the audit log system, not in this entity
 */
export interface DemoContent extends DrizzleBaseEntity {
  // the text of the demo content item
  text: string;
}
```

### Controller Interface Template

**Define in controller file, AFTER the endpoint:**

```typescript
import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import type { DemoContent } from "@/_playground_and_poc/demo_service/interfaces/interfaces";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * Creates a new demo content item in the system.
 * Requires valid authentication token.
 */
export const demoContentCreate = api(
  {
    method: "POST",
    path: "/demo-service/content",
    expose: true,
    auth: true,
  },
  async (params: CreateDemoContentRequest): Promise<CreateDemoContentResponse> => {
    return await demoService.createContent(params);
  }
);

/**
 * Create Demo Content Request
 * Request payload for creating new demo content
 */
export interface CreateDemoContentRequest {
  // the text of the demo content item (max 100 characters)
  text: string & MinLen<1> & MaxLen<100>;
}

/**
 * Create Demo Content Response
 * Response after successfully creating demo content
 */
export interface CreateDemoContentResponse {
  // the demo content item
  data: DemoContent;
}
```

### Validation with Encore Validators

Use Encore's built-in validators for type-level validation:

```typescript
import type { Min, Max, MinLen, MaxLen, IsEmail, IsURL } from "encore.dev/validate";

export interface UserCreateRequest {
  // Email validation
  email: string & IsEmail;

  // Number range
  age: number & Min<18> & Max<120>;

  // String length
  username: string & MinLen<3> & MaxLen<20>;

  // Array size
  tags: Array<string> & MaxLen<10>;

  // Combined validators
  website: string & (IsURL | IsEmail);
}
```

### Standard Base Types

**Use these base types from the codebase:**

1. **`DrizzleBaseEntity`** - For entity types returned from database
   ```typescript
   export interface MyEntity extends DrizzleBaseEntity {
     // your fields
   }
   ```

2. **`PaginationRequest`** - For list endpoints with pagination
   ```typescript
   export interface ListRequest extends PaginationRequest {
     search?: string;
   }
   ```

3. **`PaginatedResponse<T>`** - For paginated responses
   ```typescript
   export interface ListResponse extends PaginatedResponse<MyEntity> {}
   ```

### Interface Naming Convention

Follow this consistent pattern:

- **Entity/Model:** `{ModelName}` (e.g., `DemoContent`, `User`)
- **Create Request:** `Create{ModelName}Request`
- **Create Response:** `Create{ModelName}Response`
- **Update Request:** `Update{ModelName}Request`
- **Update Response:** `Update{ModelName}Response`
- **Get Request:** `Get{ModelName}Request`
- **Get Response:** `Get{ModelName}Response`
- **List Request:** `List{ModelName}Request`
- **List Response:** `List{ModelName}Response`
- **Delete Request:** `Delete{ModelName}Request`
- **Delete Response:** `Delete{ModelName}Response`

### Rules

✅ **DO:**
- Use JSDoc comments for all interfaces
- Use Encore validators for type-level validation
- Extend standard base types (`DrizzleBaseEntity`, `PaginationRequest`, etc.)
- Define controller-specific interfaces in controller files (AFTER the endpoint)
- Keep only shared entity types in `interfaces/interfaces.ts`
- Document field purposes in comments
- Use consistent naming patterns

❌ **DON'T:**
- Validate manually in services with `if` statements for type validation
- Create anonymous types inline
- Skip JSDoc documentation
- Put controller-specific request/response interfaces in shared `interfaces.ts`

---

## Testing Standards

### Test File Location

Tests are in **dedicated test directories** that mirror the source structure:

**For Controllers:** Use **one consolidated test file per model** to ensure test isolation:

```
/services/demo_service/
├── controllers/
│   ├── demoContentCreate.controller.ts
│   ├── demoContentGet.controller.ts
│   ├── demoContentList.controller.ts
│   ├── demoContentUpdate.controller.ts
│   ├── demoContentDelete.controller.ts
│   └── demoContentSoftDelete.controller.ts
├── services/
│   ├── demo.service.ts
├── repositories/
│   └── demoContent.repository.ts
└── tests/
    ├── controllers/
    │   └── demoContent.controllers.test.ts    # One test file for all controllers
    ├── services/
    │   └── demo.service.test.ts
    └── repositories/
        └── demoContent.repository.test.ts
```

**Why One Test File Per Model?**
- ✅ **Better test isolation:** `beforeEach` cleanup ensures clean state between tests
- ✅ **Centralized mocks:** Auth and client mocks defined once for all controller tests
- ✅ **Easier maintenance:** All controller tests for a model in one place
- ✅ **Consistent setup:** Shared test utilities and helpers

### Test Template (Vitest with Mocks - Consolidated Controller Tests)

**File:** `tests/controllers/{model}.controllers.test.ts`

**Pattern:** One test file for all controller operations of a model

```typescript
import { UserRole } from "@groupon/lib/types";
import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../db/db";
import { demoContentTable } from "../schemas/demoContent.schema";
import { type CreateDemoContentRequest, demoContentCreate } from "./demoContentCreate.controller";
import { type DeleteDemoContentRequest, demoContentDelete } from "./demoContentDelete.controller";
import { demoContentGet, type GetDemoContentRequest } from "./demoContentGet.controller";
import { demoContentList, type ListDemoContentRequest } from "./demoContentList.controller";
import { demoContentSoftDelete, type SoftDeleteDemoContentRequest } from "./demoContentSoftDelete.controller";
import { demoContentUpdate, type UpdateDemoContentRequest } from "./demoContentUpdate.controller";

// Mock Auth Data - centralized for all controller tests
vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn().mockReturnValue({
    userID: "test-user-demo-123",
    roles: [UserRole.ADMIN], // Use ADMIN role by default to allow all operations
  }),
}));

// Mock clients - use importOriginal to get real demo_service client for HTTP validation tests
vi.mock("~encore/clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~encore/clients")>();
  return {
    ...actual,
    auditlog: {
      _create: vi.fn().mockResolvedValue(undefined),
      _createBulk: vi.fn().mockResolvedValue(undefined),
      _createDiff: vi.fn().mockResolvedValue(undefined),
    },
    authorization: {
      validatePermission: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe("Demo Service Controllers", () => {
  // Clean database before each test to ensure isolation
  beforeEach(async () => {
    await db.delete(demoContentTable).execute();
    vi.clearAllMocks();
  });

  // Final cleanup after all tests
  afterAll(async () => {
    await db.delete(demoContentTable).execute();
    vi.clearAllMocks();
  });

  describe("demoContentCreate", () => {
    describe("successful creation", () => {
      test("should create demo content with valid data", async () => {
        // Arrange
        const request: CreateDemoContentRequest = {
          text: "Test demo content",
        };

        // Act
        const result = await demoContentCreate(request);

        // Assert
        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(result.data.id).toBeDefined();
        expect(result.data.text).toBe("Test demo content");
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
        expect(result.data.deletedAt).toBeNull();

        // Verify audit log was called
        const { auditlog } = await import("~encore/clients");
        expect(auditlog._auditLogCreate).toHaveBeenCalledTimes(1);
        expect(auditlog._auditLogCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            entityId: result.data.id,
          })
        );
      });

      test("should create demo content with maximum length text", async () => {
        // Arrange
        const maxLengthText = "a".repeat(100); // Max length is 100 characters
        const request: CreateDemoContentRequest = {
          text: maxLengthText,
        };

        // Act
        const result = await demoContentCreate(request);

        // Assert
        expect(result.data.text).toBe(maxLengthText);
        expect(result.data.text.length).toBe(100);
        expect(result.data.id).toBeDefined();
      });

      test("should create multiple demo contents independently", async () => {
        // Arrange
        const request1: CreateDemoContentRequest = {
          text: "First demo content",
        };
        const request2: CreateDemoContentRequest = {
          text: "Second demo content",
        };

        // Act
        const result1 = await demoContentCreate(request1);
        const result2 = await demoContentCreate(request2);

        // Assert
        expect(result1.data.id).toBeDefined();
        expect(result2.data.id).toBeDefined();
        expect(result1.data.id).not.toBe(result2.data.id);
        expect(result1.data.text).toBe("First demo content");
        expect(result2.data.text).toBe("Second demo content");
      });
    });

    describe("authentication", () => {
      test("should use authenticated user ID", async () => {
        // Arrange
        const request: CreateDemoContentRequest = {
          text: "Auth test content",
        };

        // Act
        const result = await demoContentCreate(request);

        // Assert
        expect(result.data).toBeDefined();

        // Verify getAuthData was called
        const { getAuthData } = await import("~encore/auth");
        expect(getAuthData).toHaveBeenCalled();
      });
    });

    describe("validation via HTTP layer", () => {
      test("should reject text longer than 100 characters when called via Encore client", async () => {
        // Arrange
        const tooLongText = "a".repeat(101); // 101 characters - exceeds max length

        // Import the Encore client to make actual HTTP call
        const { demo_service } = await import("~encore/clients");

        // Act & Assert
        // This goes through the HTTP layer and triggers Encore's validation
        await expect(demo_service.demoContentCreate({ text: tooLongText })).rejects.toThrow();
      });

      test("should reject empty text when called via Encore client", async () => {
        // Arrange - MinLen<1> requires at least 1 character
        const { demo_service } = await import("~encore/clients");

        // Act & Assert
        await expect(demo_service.demoContentCreate({ text: "" })).rejects.toThrow();
      });
    });

    describe("database persistence", () => {
      test("should persist data to database", async () => {
        // Arrange
        const request: CreateDemoContentRequest = {
          text: "Persistence test content",
        };

        // Act
        const result = await demoContentCreate(request);

        // Assert - Verify data exists in database
        const dbData = await db.select().from(demoContentTable).where(eq(demoContentTable.id, result.data.id)).limit(1);

        expect(dbData).toHaveLength(1);
        expect(dbData[0].id).toBe(result.data.id);
        expect(dbData[0].text).toBe("Persistence test content");
        expect(dbData[0].deletedAt).toBeNull();
      });
    });

    describe("response structure", () => {
      test("should return response with correct structure", async () => {
        // Arrange
        const request: CreateDemoContentRequest = {
          text: "Structure test content",
        };

        // Act
        const result = await demoContentCreate(request);

        // Assert - Check all required fields
        expect(result).toHaveProperty("data");
        expect(result.data).toHaveProperty("id");
        expect(result.data).toHaveProperty("text");
        expect(result.data).toHaveProperty("createdAt");
        expect(result.data).toHaveProperty("updatedAt");
        expect(result.data).toHaveProperty("deletedAt");

        // Check field types
        expect(typeof result.data.id).toBe("string");
        expect(typeof result.data.text).toBe("string");
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe("demoContentGet", () => {
    test("should create and then get an existing record", async () => {
      // Arrange - Create a record
      const createResult = await demoContentCreate({ text: "Test content to get" });
      const contentId = createResult.data.id;

      // Act - Get the record
      const getRequest: GetDemoContentRequest = { id: contentId };
      const getResult = await demoContentGet(getRequest);

      // Assert - Verify the correct record is returned
      expect(getResult.data).toBeDefined();
      expect(getResult.data.id).toBe(contentId);
      expect(getResult.data.text).toBe("Test content to get");
    });

    test("should throw error when getting non-existent record", async () => {
      // Arrange
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const getRequest: GetDemoContentRequest = { id: nonExistentId };

      // Act & Assert
      await expect(demoContentGet(getRequest)).rejects.toThrow("Demo content not found");
    });
  });

  describe("demoContentList", () => {
    test("should create multiple records and list them", async () => {
      // Arrange - Create multiple records
      await demoContentCreate({ text: "First content" });
      await demoContentCreate({ text: "Second content" });
      await demoContentCreate({ text: "Third content" });

      // Act - List all content
      const listRequest: ListDemoContentRequest = { offset: 0, limit: 10 };
      const listResult = await demoContentList(listRequest);

      // Assert - Verify all records are returned
      expect(listResult.data.length).toBeGreaterThanOrEqual(3);

      const texts = listResult.data.map((item) => item.text);
      expect(texts).toContain("First content");
      expect(texts).toContain("Second content");
      expect(texts).toContain("Third content");
    });

    test("should exclude soft-deleted records by default", async () => {
      // Arrange - Create records and soft delete one
      await demoContentCreate({ text: "Active content" });
      const toDelete = await demoContentCreate({ text: "To be deleted" });

      await demoContentSoftDelete({ id: toDelete.data.id });

      // Act - List without includeDeleted flag
      const listRequest: ListDemoContentRequest = { offset: 0, limit: 10 };
      const listResult = await demoContentList(listRequest);

      // Assert - Soft-deleted record should not appear
      const texts = listResult.data.map((item) => item.text);
      expect(texts).toContain("Active content");
      expect(texts).not.toContain("To be deleted");
    });

    test("should require VIEWER role permission", async () => {
      // Arrange - Create a record
      await demoContentCreate({ text: "Permission test" });

      vi.clearAllMocks();

      // Act - List content
      const listRequest: ListDemoContentRequest = { offset: 0, limit: 10 };
      await demoContentList(listRequest);

      // Assert - Verify authorization was called with VIEWER role
      const { authorization } = await import("~encore/clients");
      expect(authorization.validatePermission).toHaveBeenCalledWith({
        requiredRoles: [UserRole.VIEWER],
      });
    });
  });

  describe("demoContentUpdate", () => {
    // Helper function to create test content
    async function createTestContent(text: string) {
      const request: CreateDemoContentRequest = { text };
      const result = await demoContentCreate(request);
      return result.data;
    }

    describe("successful update", () => {
      test("should update demo content with valid data", async () => {
        // Arrange
        const original = await createTestContent("Original text");
        const request: UpdateDemoContentRequest = {
          id: original.id,
          text: "Updated text",
        };

        // Act
        const result = await demoContentUpdate(request);

        // Assert
        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(result.data.id).toBe(original.id);
        expect(result.data.text).toBe("Updated text");
        expect(result.data.createdAt).toEqual(original.createdAt);
        expect(result.data.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
        expect(result.data.deletedAt).toBeNull();

        // Verify audit log was called
        const { auditlog } = await import("~encore/clients");
        expect(auditlog._auditLogCreateDiff).toHaveBeenCalledTimes(1);
        expect(auditlog._auditLogCreateDiff).toHaveBeenCalledWith(
          expect.objectContaining({
            entityId: result.data.id,
          })
        );
      });
    });

    describe("error handling", () => {
      test("should throw error when updating non-existent content", async () => {
        // Arrange
        const request: UpdateDemoContentRequest = {
          id: "non-existent-id-12345",
          text: "Updated text",
        };

        // Act & Assert
        await expect(demoContentUpdate(request)).rejects.toThrow();
      });
    });
  });

  describe("demoContentSoftDelete", () => {
    test("should create and then soft delete a record", async () => {
      // Arrange - Create a record
      const createRequest: CreateDemoContentRequest = { text: "Test content to soft delete" };
      const createResult = await demoContentCreate(createRequest);
      const contentId = createResult.data.id;

      // Verify record was created and not deleted
      const beforeDelete = await db.select().from(demoContentTable).where(eq(demoContentTable.id, contentId)).limit(1);
      expect(beforeDelete).toHaveLength(1);
      expect(beforeDelete[0].text).toBe("Test content to soft delete");
      expect(beforeDelete[0].deletedAt).toBeNull();

      // Act - Soft delete the record
      const deleteRequest: SoftDeleteDemoContentRequest = { id: contentId };
      const deleteResult = await demoContentSoftDelete(deleteRequest);

      // Assert - Verify soft deletion was successful
      expect(deleteResult.success).toBe(true);

      // Verify record still exists but has deletedAt set
      const afterDelete = await db.select().from(demoContentTable).where(eq(demoContentTable.id, contentId)).limit(1);
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0].deletedAt).not.toBeNull();
      expect(afterDelete[0].text).toBe("Test content to soft delete"); // Content should remain
    });

    test("should throw error when trying to soft delete non-existent record", async () => {
      // Arrange
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const request: SoftDeleteDemoContentRequest = { id: nonExistentId };

      // Act & Assert
      await expect(demoContentSoftDelete(request)).rejects.toThrow();
    });

    test("should not affect other records when soft deleting one item", async () => {
      // Arrange - Create multiple records
      const content1 = await demoContentCreate({ text: "Keep this active" });
      const content2 = await demoContentCreate({ text: "Soft delete this" });

      // Act - Soft delete only content2
      await demoContentSoftDelete({ id: content2.data.id });

      // Assert - Verify content1 is still active, content2 is soft deleted
      const allRecords = await db.select().from(demoContentTable).where(isNull(demoContentTable.deletedAt));

      const activeIds = allRecords.map((r) => r.id);
      expect(activeIds).toContain(content1.data.id);
      expect(activeIds).not.toContain(content2.data.id);
    });
  });

  describe("demoContentDelete", () => {
    test("should create and then delete a record", async () => {
      // Arrange - Create a record
      const createRequest: CreateDemoContentRequest = { text: "Test content to delete" };
      const createResult = await demoContentCreate(createRequest);
      const contentId = createResult.data.id;

      // Verify record was created
      const beforeDelete = await db.select().from(demoContentTable).where(eq(demoContentTable.id, contentId)).limit(1);
      expect(beforeDelete).toHaveLength(1);
      expect(beforeDelete[0].text).toBe("Test content to delete");

      // Act - Delete the record
      const deleteRequest: DeleteDemoContentRequest = { id: contentId };
      const deleteResult = await demoContentDelete(deleteRequest);

      // Assert - Verify deletion was successful
      expect(deleteResult.success).toBe(true);

      // Verify record is deleted from database
      const afterDelete = await db.select().from(demoContentTable).where(eq(demoContentTable.id, contentId)).limit(1);
      expect(afterDelete).toHaveLength(0);
    });

    test("should throw error when user does not have ADMIN role", async () => {
      // Arrange - Create a record
      const createRequest: CreateDemoContentRequest = { text: "Test non-admin delete" };
      const createResult = await demoContentCreate(createRequest);
      const contentId = createResult.data.id;

      vi.clearAllMocks();

      // Mock authorization to throw error for non-admin user
      const { authorization } = await import("~encore/clients");
      vi.mocked(authorization.validatePermission).mockRejectedValueOnce(new Error("Insufficient permissions: ADMIN role required"));

      // Act & Assert - Attempt to delete without ADMIN role should throw
      const deleteRequest: DeleteDemoContentRequest = { id: contentId };
      await expect(demoContentDelete(deleteRequest)).rejects.toThrow("Insufficient permissions");
    });

    test("should throw error when trying to delete non-existent record", async () => {
      // Arrange
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const request: DeleteDemoContentRequest = { id: nonExistentId };

      // Act & Assert
      await expect(demoContentDelete(request)).rejects.toThrow();
    });
  });
});
```

### Key Testing Patterns

#### 1. **Consolidated Test File Setup**
```typescript
// File: controllers/{model}.controllers.test.ts
// One test file for all controller operations of a model

// Import all controller operations at the top
import { type CreateDemoContentRequest, demoContentCreate } from "./demoContentCreate.controller";
import { type DeleteDemoContentRequest, demoContentDelete } from "./demoContentDelete.controller";
import { demoContentGet, type GetDemoContentRequest } from "./demoContentGet.controller";
// ... import all other controllers

// Centralized mock setup - applies to all controller tests
vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn().mockReturnValue({
    userID: "test-user-123",
    roles: [UserRole.ADMIN], // Use ADMIN by default to allow all operations
  }),
}));

// Mock external clients (keep real service client for HTTP tests)
vi.mock("~encore/clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~encore/clients")>();
  return {
    ...actual,
    auditlog: {
      _create: vi.fn().mockResolvedValue(undefined),
      _createDiff: vi.fn().mockResolvedValue(undefined),
    },
    authorization: {
      validatePermission: vi.fn().mockResolvedValue(undefined),
    },
  };
});
```

#### 2. **Test Isolation with beforeEach**
```typescript
describe("Demo Service Controllers", () => {
  // Clean database before each test to ensure isolation
  beforeEach(async () => {
    await db.delete(demoContentTable).execute();
    vi.clearAllMocks();
  });

  // Final cleanup after all tests
  afterAll(async () => {
    await db.delete(demoContentTable).execute();
    vi.clearAllMocks();
  });

  // All controller tests go here...
});
```

**Why `beforeEach` instead of `afterAll` only?**
- ✅ **Ensures clean state** at the start of each test
- ✅ **Tests are independent** - one test's data doesn't affect another
- ✅ **Prevents test order dependency** - tests can run in any order
- ✅ **Easier debugging** - failures are isolated to individual tests

#### 3. **Test Organization - Nested Describe Blocks**
```typescript
describe("Demo Service Controllers", () => {
  describe("demoContentCreate", () => {
    describe("successful creation", () => {
      test("should create with valid data", async () => { /* ... */ });
      test("should create with maximum length", async () => { /* ... */ });
    });

    describe("authentication", () => {
      test("should use authenticated user ID", async () => { /* ... */ });
    });

    describe("validation via HTTP layer", () => {
      test("should reject invalid data", async () => { /* ... */ });
    });
  });

  describe("demoContentGet", () => {
    test("should get existing record", async () => { /* ... */ });
    test("should throw error for non-existent", async () => { /* ... */ });
  });

  describe("demoContentList", () => {
    // ... list tests
  });

  // ... other controller operations
});
```

**Organization hierarchy:**
- **Top level:** "Demo Service Controllers" - all controllers for the model
- **Second level:** Operation name (e.g., "demoContentCreate", "demoContentGet")
- **Third level:** Feature category (e.g., "successful creation", "error handling")
- **Tests:** Specific test cases

#### 4. **Arrange-Act-Assert Pattern**
```typescript
test("should create with valid data", async () => {
  // Arrange - Setup test data
  const request: CreateDemoContentRequest = { text: "Test" };

  // Act - Execute the function
  const result = await demoContentCreate(request);

  // Assert - Verify expectations
  expect(result.data).toBeDefined();
  expect(result.data.text).toBe("Test");
});
```

#### 5. **HTTP Layer Validation Testing**
```typescript
test("should validate via HTTP", async () => {
  // Import the Encore client to make actual HTTP call
  const { demo_service } = await import("~encore/clients");

  // This goes through the HTTP layer and triggers Encore's validation
  await expect(demo_service.demoContentCreate({ text: "" })).rejects.toThrow();
});
```

#### 6. **Mock Verification**
```typescript
test("should call audit log", async () => {
  const result = await demoContentCreate(request);

  const { auditlog } = await import("~encore/clients");
  expect(auditlog._auditLogCreate).toHaveBeenCalledTimes(1);
  expect(auditlog._auditLogCreate).toHaveBeenCalledWith(
    expect.objectContaining({ entityId: result.data.id })
  );
});
```

#### 7. **Helper Functions for Test Setup**
```typescript
describe("demoContentUpdate", () => {
  // Helper function to create test content
  async function createTestContent(text: string) {
    const request: CreateDemoContentRequest = { text };
    const result = await demoContentCreate(request);
    return result.data;
  }

  test("should update existing content", async () => {
    // Use helper to create test data
    const original = await createTestContent("Original text");

    // Now test the update operation
    const result = await demoContentUpdate({
      id: original.id,
      text: "Updated text",
    });

    expect(result.data.text).toBe("Updated text");
  });
});
```

### Running Tests

```bash
# All tests in watch mode
pnpm encore:test

# All tests (CI mode)
CI=1 pnpm encore:test

# Single test directory
VITEST_DIR=services/demo_service pnpm encore:test

# Run specific test file
pnpm encore:test services/_playground_and_poc/demo_service/tests/controllers/demoContent.controllers.test.ts
```

### Test Coverage Best Practices

✅ **DO:**
- Use one consolidated test file per model for controllers (`{model}.controllers.test.ts`)
- Clean database with `beforeEach` for test isolation
- Test all CRUD operations (Create, Read, Update, Delete, Soft Delete)
- Include authentication and authorization tests
- Test HTTP validation using Encore client
- Verify audit log calls
- Test error handling (not found, validation errors)
- Use helper functions to reduce test code duplication

❌ **DON'T:**
- Create separate test files for each controller operation
- Rely on test execution order (use `beforeEach` cleanup)
- Skip database cleanup between tests
- Test implementation details (focus on behavior)
- Mock the database layer in controller tests (use real DB for integration tests)

---

## Logging Standards

### Using Encore Logger

```typescript
import log from "encore.dev/log";

// Info logging
log.info("User created", { userId: user.id, email: user.email });

// Error logging
log.error(error, "Failed to create user", { email });

// Debug logging
log.debug("Processing request", { params });
```

**Rules:**
- Always include contextual metadata
- Use structured logging (objects, not strings)
- Log at appropriate levels
- Never log sensitive data (passwords, tokens, PII)

---

## Service-to-Service Communication

### Calling Other Services

```typescript
import { otherService } from "~encore/clients";

// Type-safe service call
const result = await otherService.methodName({
  param: "value",
});

// Handle errors
try {
  const data = await otherService.getData({ id });
} catch (error) {
  log.error(error, "Service call failed", { id });
  throw APIError.internal("Failed to fetch data from service");
}
```

---

## Pub/Sub Topics

### Defining Topics

**Location:** `/topics/topicName.topic.ts`

```typescript
import { Topic } from "encore.dev/pubsub";

export interface UserCreatedEvent {
  userId: string;
  email: string;
  createdAt: Date;
}

export const userCreatedTopic = new Topic<UserCreatedEvent>("user-created", {
  deliveryGuarantee: "at-least-once",
});
```

### Publishing

**Location:** `/pubsub/_emitUserCreated.pub.ts`

```typescript
import { userCreatedTopic } from "../topics/userCreated.topic";
import log from "encore.dev/log";

export async function publishUserCreated(userId: string, email: string) {
  try {
    await userCreatedTopic.publish({
      userId,
      email,
      createdAt: new Date(),
    });

    log.info("User created event published", { userId });
  } catch (error) {
    log.error(error, "Failed to publish user created event", { userId });
    throw error;
  }
}
```

### Subscribing

**Location:** `/pubsub/_createUser.sub.ts`

```typescript
import { Subscription } from "encore.dev/pubsub";
import { userCreatedTopic } from "../topics/userCreated.topic";
import log from "encore.dev/log";

const _ = new Subscription(userCreatedTopic, "send-welcome-email", {
  handler: async (event) => {
    try {
      log.info("Processing user created event", { userId: event.userId });
      // Handle event
    } catch (error) {
      log.error(error, "Failed to process user created event", { event });
      throw error;
    }
  },
});
```

---

## Cron Jobs

### Overview

Cron jobs in Encore are used for scheduled background tasks like data cleanup, periodic synchronization, maintenance operations, and report generation. The demo_service provides a complete reference implementation.

### File Structure

```
/services/{service-name}/
├── crons/
│   └── {jobName}.cron.ts           # Cron job definition (use .cron.ts extension)
└── controllers/
    └── _cron{JobName}.controller.ts # Cron endpoint (underscore prefix)
```

**Naming Convention:**
- Cron definition file: `{jobName}.cron.ts` (e.g., `demoContentCleanup.cron.ts`)
- Cron controller file: `_cron{JobName}.controller.ts` (e.g., `_cronDemoCleanup.controller.ts`)

### Cron Definition File

**Location:** `/crons/{jobName}.cron.ts`

**Pattern:**

```typescript
import { CronJob } from "encore.dev/cron";
import { _cronDemoCleanup } from "@/_playground_and_poc/demo_service/controllers/_cronDemoCleanup.controller";

/**
 * Demo Content Cleanup Cron Job
 *
 * Runs every day at 2 AM to clean up old soft-deleted items.
 * Removes items that have been soft-deleted for more than 30 days.
 *
 * Best Practices:
 * 1. Descriptive job ID using kebab-case
 * 2. Clear title explaining what the job does
 * 3. Appropriate schedule for the task
 * 4. Import controller directly (not via ~encore/clients)
 * 5. Uses underscore prefix for the controller endpoint
 */
const _demoContentCleanupCron = new CronJob("demo-content-cleanup", {
  title: "Demo Content Cleanup - Remove old soft-deleted items",
  schedule: "0 2 * * *", // Run at 2 AM every day
  endpoint: _cronDemoCleanup,
});
```

### Schedule Options

You can use either simple intervals or full cron syntax:

**Simple Intervals:**
```typescript
// Run every minute
every: "1m"

// Run every 5 minutes
every: "5m"

// Run every hour
every: "1h"

// Run every day
every: "24h"
```

**Cron Syntax:**
```typescript
// Run at 2 AM every day
schedule: "0 2 * * *"

// Run at midnight every Sunday
schedule: "0 0 * * 0"

// Run every 15 minutes
schedule: "*/15 * * * *"

// Run at 9 AM every Monday
schedule: "0 9 * * 1"
```

**Cron Syntax Reference:**
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of the month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of the week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

### Cron Controller

**Location:** `/controllers/_cron{JobName}.controller.ts`

**Rules:**
- **Must** start with underscore `_cron` prefix
- **Must** use `auth: false` (cron jobs are internal)
- **Must** use `expose: false` (not accessible externally)
- **Must** use method `POST`
- **Should** return result type (e.g., `Promise<CleanupResult>`) for metrics
- **Must** be thin - only call service method
- **Must** define result interface in controller file (after endpoint)
- Path convention: `/service-name/cron/job-name`

**Template:**

```typescript
import { api } from "encore.dev/api";
import { demoService } from "@/_playground_and_poc/demo_service/services/demo.service";

/**
 * This controller demonstrates how to implement a cron job endpoint in Encore.
 * It's called automatically by the cron scheduler (see crons/demoContentCleanup.cron.ts).
 */
export const _cronDemoCleanup = api(
  {
    auth: false,
    expose: false,
    method: "POST",
    path: "/demo-service/cron/cleanup",
  },
  async (): Promise<CleanupResult> => {
    // Call the service method that contains all business logic and logging
    return await demoService.cleanupOldContent();
  }
);

export interface CleanupResult {
  deletedCount: number; // Number of items permanently deleted
  processedCount: number; // Total number of items evaluated
  duration: string; // Duration of the cleanup operation
}
```

### Service Layer Implementation

**Add the cron job business logic to your service:**

```typescript
import { isNotNull, lt, type SQL } from "drizzle-orm";
import log from "encore.dev/log";
import type { CleanupResult } from "../controllers/_cronDemoCleanup.controller";
import { demoContentRepository } from "../repositories/demoContent.repository";
import { demoContentTable } from "../schemas/demoContent.schema";
import type { DemoContent } from "../interfaces/interfaces";

class DemoService {
  /**
   * Cleanup old soft-deleted content
   * Cron job method - permanently removes items that were soft-deleted more than 30 days ago
   *
   * This method demonstrates:
   * - Background cleanup operations
   * - Date-based filtering using Drizzle ORM
   * - Batch processing with proper logging
   * - Performance tracking
   * - Error handling for cron jobs
   */
  async cleanupOldContent(): Promise<CleanupResult> {
    const startTime = Date.now();

    log.info("Starting cleanup of old soft-deleted demo content");

    try {
      // Calculate the cutoff date (30 days ago)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Build where clause: deletedAt is not null AND deletedAt < thirtyDaysAgo
      const whereClauses: SQL[] = [
        isNotNull(demoContentTable.deletedAt),
        lt(demoContentTable.deletedAt, thirtyDaysAgo),
      ];

      // Find all soft-deleted items older than 30 days
      const result = await demoContentRepository.getPaginated<DemoContent>({
        request: {
          limit: 1000, // Process up to 1000 items per run
          offset: 0,
        },
        whereClauses,
        defaultOrderBy: demoContentTable.deletedAt,
        defaultMaxLimit: 1000,
        defaultLimit: 1000,
      });

      const oldDeletedItems = result.data;

      log.info("Found items to cleanup", {
        count: oldDeletedItems.length,
        total: result.pagination.total,
      });

      // Delete each item permanently
      let deletedCount = 0;
      for (const item of oldDeletedItems) {
        try {
          await demoContentRepository.delete(item.id);
          deletedCount++;

          // Log progress for monitoring (every 10 items)
          if (deletedCount % 10 === 0) {
            log.info("Cleanup progress", {
              deleted: deletedCount,
              total: oldDeletedItems.length,
            });
          }
        } catch (error) {
          // Log individual item errors but continue processing
          log.error(error, "Failed to delete item", { itemId: item.id });
        }
      }

      const endTime = Date.now();
      const duration = `${((endTime - startTime) / 1000).toFixed(2)}s`;

      const cleanupResult: CleanupResult = {
        deletedCount,
        processedCount: oldDeletedItems.length,
        duration,
      };

      log.info("Cleanup completed successfully", cleanupResult);

      return cleanupResult;
    } catch (error) {
      log.error(error, "Cleanup failed");
      throw error;
    }
  }
}
```

### Key Patterns and Best Practices

✅ **DO:**
- Use `.cron.ts` extension for cron definition files (e.g., `demoContentCleanup.cron.ts`)
- Use kebab-case for cron job IDs (e.g., "demo-content-cleanup")
- Prefix cron controller names with `_cron` (e.g., `_cronDemoCleanup`)
- Import controller directly in cron file (not via `~encore/clients`)
- Set `auth: false` and `expose: false` for cron controllers
- Return result type from cron endpoints (e.g., `Promise<CleanupResult>`)
- Keep controllers thin - just call service method and return result
- Define cron result interfaces in controller file (after endpoint definition)
- Put ALL logging in service layer (start, progress, success, errors)
- Include comprehensive logging with emojis for visibility (🧹, ✅, ❌)
- Log start, progress, and completion with metrics in service
- Implement business logic in service layer, not controller
- Process items in batches with progress logging in service
- Track performance metrics (duration, processed count) in service
- Use descriptive titles explaining what the job does
- Choose appropriate schedules (avoid unnecessary frequent runs)
- Keep controller comments simple and reference the cron definition file

❌ **DON'T:**
- Use `~encore/clients` to reference cron endpoints (import controller directly)
- Use `auth: true` for cron controllers (they're internal)
- Use `expose: true` (cron endpoints should never be external)
- Add logging to cron controllers (put all logging in service)
- Add try-catch in cron controllers (let errors propagate naturally)
- Put business logic in the controller (use service layer)
- Use duplicate job IDs across services
- Write verbose documentation in controller (keep it simple)

### Monitoring Cron Jobs

**Encore Dashboard:**
- View cron job execution history
- Check success/failure rates
- See execution logs
- Monitor performance metrics

**Logging Best Practices (Service Layer):**

All logging happens in the service layer. The controller just calls the service and returns the result.

```typescript
// In service layer (e.g., cleanupOldContent method)

// Start
log.info("🧹 Starting demo content cleanup cron job");

// Progress (log every N items)
log.info("Cleanup progress", { deleted: 50, total: 100 });

// Success
log.info("✅ Demo content cleanup completed", {
  deletedCount: 42,
  processedCount: 100,
  duration: "5.23s"
});

// Return metrics
return {
  deletedCount,
  processedCount,
  duration,
};

// Errors - let them propagate naturally (no try-catch in controller)
```

### Common Use Cases

**1. Data Cleanup:**
```typescript
// Remove old soft-deleted records
schedule: "0 2 * * *" // 2 AM daily
```

**2. Report Generation:**
```typescript
// Generate weekly reports
schedule: "0 9 * * 1" // 9 AM every Monday
```

**3. Data Synchronization:**
```typescript
// Sync with external system
every: "1h" // Every hour
```

**4. Cache Warming:**
```typescript
// Pre-populate caches
schedule: "0 0 * * *" // Midnight daily
```

**5. Maintenance Tasks:**
```typescript
// Database optimization
schedule: "0 3 * * 0" // 3 AM every Sunday
```

### Complete Example: Cleanup Cron Job

**Reference Implementation:** See `demo_service` for the complete working example:
- `/crons/demoContentCleanup.cron.ts` - Cron definition:
  - Uses `.cron.ts` file extension
  - Imports controller directly (not via `~encore/clients`)
  - Defines schedule and job configuration
- `/controllers/_cronDemoCleanup.controller.ts` - Thin cron controller:
  - Simple comment referencing cron definition file
  - Just calls service and returns result
  - Defines `CleanupResult` interface after endpoint
- `/services/demo.service.ts` - Business logic with cleanupOldContent() method:
  - Imports `CleanupResult` interface from controller
  - All logging (start, progress, completion, errors)
  - Error handling and re-throwing
  - Batch processing logic
  - Performance metrics tracking

This demonstrates:
- ✅ Proper file organization and naming (`.cron.ts` extension)
- ✅ Direct controller import (not via `~encore/clients`)
- ✅ Correct naming conventions
- ✅ Thin controller pattern (just call service and return)
- ✅ Interface definition in controller (after endpoint)
- ✅ Service layer with all logic and logging
- ✅ Batch processing with progress tracking
- ✅ Performance monitoring
- ✅ Clean separation of concerns

### Important Notes

1. **Automatic Registration:** Cron jobs are automatically registered by Encore, no need to import the cron file
2. **Unique Job IDs:** Job IDs must be unique across your entire application
3. **No Authentication:** Cron endpoints should always have `auth: false` and `expose: false`
4. **Thin Controllers:** Cron controllers should ONLY call the service method and return the result
5. **Service Layer Responsibility:** ALL business logic, logging, error handling, and metrics go in service layer
6. **Return Type:** Return result type (e.g., `Promise<CleanupResult>`) for metrics and monitoring
7. **Interface Location:** Define cron result interfaces in controller file (after endpoint definition)
8. **Independent Execution:** Cron jobs run automatically, no API calls required to trigger them
9. **Direct Import:** Import controller directly in cron file (e.g., `import { _cronDemoCleanup } from "../controllers/_cronDemoCleanup.controller"`)
10. **File Extension:** Use `.cron.ts` extension for cron definition files (e.g., `demoContentCleanup.cron.ts`)
11. **Simple Documentation:** Keep controller comments minimal, reference the cron definition file

---

## Object Storage (Buckets)

**Location:** `/buckets/bucketName.bucket.ts`

```typescript
import { Bucket } from "encore.dev/storage/objects";

export const profilePhotosBucket = new Bucket("profile-photos", {
  versioned: false,
  public: true,
});

// Usage in service
export async function uploadProfilePhoto(userId: string, file: Buffer) {
  const fileName = `${userId}.jpg`;

  await profilePhotosBucket.upload(fileName, file, {
    contentType: "image/jpeg",
  });

  const url = await profilePhotosBucket.publicUrl(fileName);
  return url;
}
```

---

## Documentation Requirements

### Service README.md

**Every service must have:**

```markdown
# Service Name

## Overview
Brief description of what this service does.

## Responsibilities
- Responsibility 1
- Responsibility 2

## API Endpoints

### Public APIs
- `GET /service/resource` - Description
- `POST /service/resource` - Description

### Private APIs
- `POST /service/internal/resource` - Description

## Dependencies
- External services used
- Database tables
- Pub/Sub topics

## Environment Variables
- `SECRET_NAME` - Description

## Local Development
Instructions for running locally

## Testing
How to run tests
```

### Controller Documentation

```typescript
/**
 * Create a new user
 *
 * This endpoint creates a new user in the system.
 * Requires ADMIN or USER_ADMIN role.
 *
 * @param params - User creation parameters
 * @returns Created user object
 * @throws {APIError} InvalidArgument if validation fails
 * @throws {APIError} PermissionDenied if user lacks permissions
 */
export const userCreate = api(/*...*/);
```

---

## Code Review Checklist

Before submitting code, verify:

- [ ] **Architecture:** Does it follow the layered architecture (Controller → Service → Repository)?
- [ ] **Naming:** Are all files, classes, and variables named according to conventions?
- [ ] **Public/Private APIs:** Are public APIs secured with `auth: true`? Are private APIs prefixed with `_`?
- [ ] **Validation:** Are inputs validated using Encore validators or Zod?
- [ ] **Error Handling:** Are errors thrown using `APIError` with appropriate codes?
- [ ] **Authorization:** Are role checks implemented for sensitive operations?
- [ ] **Logging:** Is contextual logging present for important operations?
- [ ] **Types:** Are all inputs/outputs properly typed with interfaces?
- [ ] **Tests:** Are controller tests consolidated in one file (`tests/controllers/{model}.controllers.test.ts`)? Are tests passing?
- [ ] **Test Isolation:** Does the test file use `beforeEach` to clean database before each test?
- [ ] **Documentation:** Is the code documented with clear comments?
- [ ] **No Business Logic in Controllers:** Controllers only validate and delegate?
- [ ] **No DB Queries in Services:** Services use repositories for data access?
- [ ] **Secrets:** Are secrets properly defined and not hardcoded?
- [ ] **ORR Registration:** Is ORR registration present in `encore.service.ts`? (**REQUIRED**)
- [ ] **baseAuthMiddleware:** For services under `apps/encore-ts/services/`, is `baseAuthMiddleware` imported from `@core_system/authorization/middleware/auth.middleware` and listed in `middlewares` immediately after `errorMiddleware`? (**REQUIRED** for new services)
- [ ] **Correct Tribe Config:** Is the service using the correct tribe-specific ORR config?
  - Core System Infrastructure: `_core_encore_config` (from `@/_core_system/core_encore.orr`)
  - Core System Operations (auth/users/tokens): (from `@/_core_system/core_encore.orr`)
  - B2B Tribe: `_B2B_tribe__encore_one_team_config` (from `@/_tribe_b2b/b2b.orr`)
  - B2C Tribe: `_B2C_tribe__encore_one_team_config` (from `@/_tribe_b2c/b2c.orr`)
  - Core Tribe: `_Core_tribe_config` (from `@/_tribe_core/core.orr`)
  - Marketing Tribe: `_Marketing_tribe_config` (from `@/_tribe_marketing/marketing.orr`)

---

## Common Anti-Patterns to Avoid

❌ **Manual Validation in Services:**

```typescript
// BAD
if (!name || !email) {
  throw APIError.invalidArgument("Missing fields");
}
```

✅ **Use Encore Validators:**

```typescript
// GOOD
export interface UserCreateRequest {
  name: string & MinLen<1>;
  email: string & IsEmail;
}
```

---

❌ **Business Logic in Controllers:**

```typescript
// BAD
export const userCreate = api({...}, async (params) => {
  const user = await db.insert(userTable).values(params).returning();
  await sendWelcomeEmail(user.email);
  return { user };
});
```

✅ **Delegate to Service Layer:**

```typescript
// GOOD
export const userCreate = api({...}, async (params) => {
  return await userService.createUser(params);
});
```

---

❌ **Direct DB Queries in Services:**

```typescript
// BAD
async createUser(params) {
  const user = await db.insert(userTable).values(params).returning();
  return user;
}
```

✅ **Use Repository:**

```typescript
// GOOD
async createUser(params) {
  const user = await userRepository.create(params);
  await this.sendWelcomeEmail(user.email);
  return user;
}
```

---

❌ **Anonymous Types:**

```typescript
// BAD
export const userGet = api({...}, async (): Promise<{ user: any }> => {
  //...
});
```

✅ **Explicit Interfaces:**

```typescript
// GOOD
export interface UserGetResponse {
  user: User;
}

export const userGet = api({...}, async (): Promise<UserGetResponse> => {
  //...
});
```

---

## Complete Working Example: demo_service

The `demo_service` located at `/apps/encore-ts/services/_playground_and_poc/demo_service/` serves as the **canonical reference implementation** for all Encore TypeScript services.

### Reference Implementation Structure

```
demo_service/
├── controllers/
│   ├── demoContentCreate.controller.ts        # POST with interfaces AFTER endpoint
│   ├── demoContentGet.controller.ts           # GET with interfaces AFTER endpoint
│   ├── demoContentList.controller.ts          # GET with interfaces AFTER endpoint
│   ├── demoContentUpdate.controller.ts        # PUT with interfaces AFTER endpoint
│   ├── demoContentDelete.controller.ts        # DELETE with interfaces AFTER endpoint
│   ├── demoContentSoftDelete.controller.ts    # PATCH with interfaces AFTER endpoint
│   ├── _cronDemoCleanup.controller.ts         # Cron job controller (auth: false, expose: false)
│   └── _internalDemoContentList.controller.ts # Private API (reuses interfaces from public)
├── crons/
│   └── demoContentCleanup.cron.ts             # Cron job definition (uses .cron.ts extension)
├── services/
│   └── demo.service.ts                        # Imports interfaces from controllers + cron logic
├── repositories/
│   └── demoContent.repository.ts              # Extends BaseRepository + custom methods
├── tests/
│   ├── controllers/
│   │   └── demoContent.controllers.test.ts    # ✅ One test file for all controllers
│   ├── services/
│   │   └── demo.service.test.ts               # Service layer tests
│   └── repositories/
│       └── demoContent.repository.test.ts     # Repository layer tests
├── interfaces/
│   └── interfaces.ts                          # Only shared entity types (DemoContent)
├── schemas/
│   └── demoContent.schema.ts                  # Uses defaultTableColumns + defaultTableIndexes
├── db/
│   ├── db.ts                                  # Database config with Pool
│   ├── drizzle.config.ts                      # Drizzle Kit config
│   └── migrations/                            # Auto-generated SQL migrations
├── encore.service.ts                          # Encore Service + middleware + ORR
└── service.config.ts                          # Secrets + constants (avoid importing encore.service.ts for these)
```

### Key Patterns Demonstrated

1. **Controller Layer** - Thin API definitions with interfaces AFTER the endpoint
2. **Service Layer** - Business logic, authorization, audit logging, imports interfaces from controllers
3. **Repository Layer** - Extends `BaseRepository`, adds custom methods (softDelete)
4. **Interfaces** - Controller interfaces in controller files (after endpoint), only shared entities in `interfaces.ts`
5. **Schema** - Uses `defaultTableColumns` and `defaultTableIndexes`
6. **Database** - Pool-based connection with proper config
7. **Cron Jobs** - Background scheduled tasks with:
   - Cron definition in `crons/` directory
   - Dedicated controller with `_cron` prefix (`auth: false`, `expose: false`)
   - Business logic in service layer with proper error handling
   - Comprehensive logging and progress tracking
8. **Testing** - **One consolidated test file per model** (`{model}.controllers.test.ts`) with:
   - All controller operations tested in one file
   - `beforeEach` cleanup for test isolation
   - Centralized mock setup
   - Helper functions for test data creation
9. **ORR** - Proper registration with tribe config + alert policy config
10. **Middleware** - `errorMiddleware` and **`baseAuthMiddleware`** on `new Service(...)` (see `demo_service/encore.service.ts`)

### How to Use This Reference

When creating a new service:

1. **Copy the structure** from `demo_service`
2. **Replace "DemoContent"** with your model name (e.g., "Product", "User")
3. **Replace "demo"** with your service name
4. **Keep the patterns** (controller → service → repository)
5. **Maintain naming conventions** (file names, interfaces, exports)
6. **Put controller interfaces AFTER the endpoint definition**
7. **Keep only shared entity types in `interfaces/interfaces.ts`**
8. **Follow the same ORR registration** pattern
9. **Register `baseAuthMiddleware`** after `errorMiddleware` in `encore.service.ts` for every new service under `apps/encore-ts/services/`
10. **Write tests** using the consolidated test file pattern:
   - Create `tests/controllers/{model}.controllers.test.ts` for all controller operations
   - Use `beforeEach` to clean database before each test
   - Centralize mocks at the file level
   - Import interfaces from individual controller files

### Command to Study the Reference

```bash
# Navigate to demo service
cd apps/encore-ts/services/_playground_and_poc/demo_service

# Read the files in order:
# 1. encore.service.ts - Encore wiring + ORR; service.config.ts - secrets/constants
# 2. schemas/demoContent.schema.ts - Database schema
# 3. interfaces/interfaces.ts - Type definitions
# 4. repositories/demoContent.repository.ts - Data access
# 5. services/demo.service.ts - Business logic
# 6. controllers/*.controller.ts - API endpoints
# 7. controllers/_cronDemoCleanup.controller.ts - Cron job endpoint
# 8. crons/demoContentCleanup.cron.ts - Cron job definition (note .cron.ts extension)
# 9. tests/controllers/*.test.ts - Testing patterns
```

---

## Quick Reference: Creating a New Service

### Step-by-Step Checklist

1. **📋 Determine tribe/ownership** (ask user if not specified)
2. **📂 Create service folder** under appropriate tribe directory
3. **📄 Create `encore.service.ts`** with `errorMiddleware`, **`baseAuthMiddleware`**, and ORR registration (copy from demo_service); add **`service.config.ts`** when the service has secrets or exported constants (copy pagination block from demo_service)
4. **🗄️ Create schema** in `schemas/{model}.schema.ts` using defaultTableColumns
5. **📝 Create shared entity interfaces** in `interfaces/interfaces.ts` (only entity types)
6. **🔑 Register entity constant** in `packages/lib/src/consts.ts` → `ENCORE_DB_ENTITY`
7. **💾 Create repository** in `repositories/{model}.repository.ts` (extend BaseRepository)
8. **⚙️ Create service** in `services/{model}.service.ts` (business logic + audit logs)
9. **🌐 Create controllers** in `controllers/{model}{Operation}.controller.ts` with interfaces AFTER endpoint
10. **✅ Create consolidated test file** in `tests/controllers/{model}.controllers.test.ts` (one file for all controllers)
11. **🔧 Create database config** in `db/db.ts`
12. **🚀 Generate migration** with `npx drizzle-kit generate`

### File Templates to Copy from demo_service

```bash
# Use these as templates:
demo_service/encore.service.ts           → YOUR_SERVICE/encore.service.ts
demo_service/service.config.ts         → YOUR_SERVICE/service.config.ts
demo_service/schemas/demoContent.schema.ts → YOUR_SERVICE/schemas/{model}.schema.ts
demo_service/interfaces/interfaces.ts     → YOUR_SERVICE/interfaces/interfaces.ts (only shared entities)
demo_service/repositories/demoContent.repository.ts → YOUR_SERVICE/repositories/{model}.repository.ts
demo_service/services/demo.service.ts     → YOUR_SERVICE/services/{model}.service.ts
demo_service/controllers/demoContentCreate.controller.ts → YOUR_SERVICE/controllers/{model}Create.controller.ts (interfaces AFTER endpoint)
demo_service/controllers/_cronDemoCleanup.controller.ts → YOUR_SERVICE/controllers/_cron{JobName}.controller.ts (cron endpoints)
demo_service/crons/demoContentCleanup.cron.ts → YOUR_SERVICE/crons/{jobName}.cron.ts (cron definitions with .cron.ts extension)
demo_service/db/db.ts                    → YOUR_SERVICE/db/db.ts
```

### Essential Imports to Remember

```typescript
// Controllers (with controller-specific interfaces defined in same file)
import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate"; // For validation
import type { EntityType } from "../interfaces/interfaces"; // Only shared entity types
import { serviceName } from "../services/service.service";

// Services
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { getAuthData } from "~encore/auth";
import { auditlog, authorization } from "~encore/clients";
import { AUDITLOG_ACTION, GROUPON_ENTITY } from "@groupon/lib/consts"; // IMPORTANT: Add your entity to GROUPON_ENTITY in packages/lib/src/consts.ts
import { UserRole } from "@groupon/lib/types";

// Repositories
import { BaseRepository } from "@core/databases/drizzle/repository";
import { db } from "../db/db";
import { schema } from "../schemas/schema";

// Schemas
import { defaultTableColumns, defaultTableIndexes } from "@core/databases/drizzle/defaults";
import { pgTable, text } from "drizzle-orm/pg-core";

// Interfaces
import type { DrizzleBaseEntity } from "@core/databases/drizzle/interface";
import type { PaginatedResponse, PaginationRequest } from "@groupon/lib/types";
import type { MinLen, MaxLen } from "encore.dev/validate";
```

---

## Resources

- **⭐ Reference Implementation:** `/apps/encore-ts/services/_playground_and_poc/demo_service/`
- [Encore Documentation](https://encore.dev/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- Internal: `/apps/encore-ts/README.md`
- Internal: `/_documentation/engineering_basics/`

---

**These standards are mandatory and non-negotiable. They ensure consistency, quality, and maintainability across the entire Encore TypeScript codebase at Groupon.**

**When in doubt, refer to the `demo_service` implementation as the source of truth.**
