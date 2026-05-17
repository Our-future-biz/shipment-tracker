# Controllers & API Endpoints

## Overview

Controllers in Encore.ts define API endpoints that serve as the entry point for all HTTP requests. They are responsible for receiving requests, validating inputs, performing authorization checks, and delegating business logic to the service layer. Controllers must remain thin and focused solely on HTTP-level concerns.

---

## Core Principles

1. **Single Responsibility**: Controllers handle HTTP requests and delegate to services
2. **No Business Logic**: Business rules belong in the service layer
3. **No Direct Database Access**: Use repositories through services
4. **Type Safety**: All inputs and outputs are strongly typed
5. **Authorization First**: Check permissions before processing requests
6. **Fail Fast**: Validate early and throw clear errors

---

## File Structure & Naming

### Public API Controllers

**File naming:** `{model}{Operation}.controller.ts`

**Examples:**
- `userCreate.controller.ts`
- `dealUpdate.controller.ts`
- `orderGet.controller.ts`

**Location (Small Service):**
```
/services/{service-name}/
  └── controllers/
      ├── userCreate.controller.ts
      ├── userUpdate.controller.ts
      └── userGet.controller.ts
```

**Location (Large Service with Modules):**
```
/services/{service-name}/
  └── modules/
      └── {module-name}/
          └── controllers/
              ├── {model}Create.controller.ts
              ├── {model}Get.controller.ts
              └── {model}Update.controller.ts
```

### Private API Controllers

**File naming:** `_{model}{Operation}.controller.ts`

**Examples:**
- `_internalUserCreate.controller.ts`
- `_internalDealSync.controller.ts`
- `_systemHealthCheck.controller.ts`

**The underscore prefix (`_`) is mandatory** and signals:
- Internal use only
- Cannot be called from outside Encore services
- Not exposed to external APIs
- Service-to-service communication

**Location (Small Service):**
```
/services/{service-name}/
  └── controllers/
      ├── _internalUserCreate.controller.ts
      ├── _internalUserUpdate.controller.ts
      └── _systemHealthCheck.controller.ts
```

**Location (Large Service with Modules):**
```
/services/{service-name}/
  └── modules/
      └── {module-name}/
          └── controllers/
              ├── _internal{model}{operation}.controller.ts
              └── _{model}Get.controller.ts
```

### Request/Response Interface Placement

Keep endpoint contracts close to the controller by default.

- Define controller-specific request/response interfaces in the controller file.
- If the contract is shared across multiple endpoints/services, move it to a shared interface/DTO file and import it.
- Reused domain models (for example `User`) may be returned directly when appropriate.

---

## API Path Structure

### Standard Service Paths

For services without modules:

```
/service-name/endpoint-logic
```

**Examples:**
- `/user/core/me`
- `/user/core/user`
- `/user/core/users/search`

### Module-Based Service Paths

For large services with modules, API paths include the module name in the second position:

```
/service-name/module-name/endpoint-logic
```

**Examples:**
- `/ai-common-management/agent-catalog/ai-agent`
- `/ai-common-management/gcp-keys/gcp-key`
- `/ai-common-management/oauth-feeder/oauth-credential`

**Benefits:**
- ✅ Clear logical grouping of endpoints
- ✅ Easy to identify which module handles the request
- ✅ Better API organization for large services
- ✅ Supports multiple teams working on different modules

**Configuration Requirement:**

To use module-based paths, you must enable `supportModules: true` in your `encore.service.ts`:

```typescript
registerService(appMeta(), () =>
  service_management._encoreServiceAdd(
    new GrouponServiceProvider("ai_common_management", {
      name: "AI Common Management",
      description: "Manages shared AI configs and onboarding.",

      // IMPORTANT: Enable module support for module-based paths
      supportModules: true,
    }).init()
  )
);
```

### Resource Path Convention for CRUD-Style Endpoints

Use predictable resource nouns inside the endpoint path so API shape stays consistent across services.

- The first path segment is the microservice name (kebab-case, usually singular).
- In module-based services, the next segment is the module name.
- Use a **singular** resource noun for single-resource operations.
- Use a **plural** resource noun for list/filter endpoints.
- For list/filter endpoints, use standardized pagination in both request and response (see [API Pagination Standards](api_pagination_standards.md)).

Examples (small service with `core` namespace):

- `POST /user/core/user` - create one user
- `GET /user/core/user/:id` - get one user
- `PUT /user/core/user` - update one user
- `DELETE /user/core/user/:id` - delete one user
- `PUT /user/core/users` - list/filter users with request-body pagination (legacy pattern used in some services)

If a service already uses a different list-path style (for example `GET /.../search`), keep the style consistent within that service.

---

## Public API Endpoints

Public APIs are exposed to external clients and must be secured.

### Requirements

- ✅ **Must** use `expose: true`
- ✅ **Must** use `auth: true`
- ✅ **Must** implement authorization checks for sensitive operations
- ✅ **Must** validate all inputs
- ✅ **Must** return typed responses
- ✅ File name: `{model}{Operation}.controller.ts`
- ✅ Endpoint name: No underscore prefix

### Basic Public API Template

```typescript
import { api } from "encore.dev/api";
import { authorization } from "~encore/clients";
import { UserRole } from "@groupon/lib/types";
import { userService } from "../services/user.service";

/**
 * Get current authenticated user profile
 *
 * Returns the complete user profile for the authenticated user.
 * Requires valid authentication token.
 *
 * @returns User profile data
 * @throws {APIError} Unauthenticated if token is invalid
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

### Public API with Authorization

```typescript
import { api } from "encore.dev/api";
import { authorization } from "~encore/clients";
import { UserRole } from "@groupon/lib/types";
import type { IsEmail } from "encore.dev/validate";
import { userService } from "../services/user.service";

/**
 * Create a new user (Admin only)
 *
 * Creates a new user account. Requires ADMIN or USER_ADMIN role.
 *
 * @param params - User creation parameters
 * @returns Created user object
 * @throws {APIError} PermissionDenied if user lacks required role
 * @throws {APIError} InvalidArgument if validation fails
 */
export const userCreate = api(
  {
    method: "POST",
    path: "/user/core/user",
    expose: true,
    auth: true,
    tags: ["ADMIN", "USER_ADMIN"],
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    // Authorization check
    await authorization.validatePermission({
      requiredRoles: [UserRole.ADMIN, UserRole.USER_ADMIN],
    });

    // Delegate to service
    return await userService.createUser(params);
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

### Public API with Query Parameters

```typescript
import { api } from "encore.dev/api";
import type { Query } from "encore.dev/api";
import { userService } from "../services/user.service";

/**
 * Search users by filters
 *
 * @param params - Search filters (email, name, role)
 * @returns Paginated list of users
 */
export const usersSearch = api(
  {
    method: "GET",
    path: "/user/core/users/search",
    expose: true,
    auth: true,
  },
  async (params: UserSearchRequest): Promise<UserSearchResponse> => {
    return await userService.searchUsers(params);
  }
);

export interface UserSearchRequest {
  email?: Query<string>;
  name?: Query<string>;
  role?: Query<string>;
  page?: Query<number>;
  limit?: Query<number>;
}

export interface UserSearchResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}
```

### Public API with Path Parameters

```typescript
import { api } from "encore.dev/api";
import { userService } from "../services/user.service";

/**
 * Get user by ID
 *
 * @param params - User ID in URL path
 * @returns User object if found
 * @throws {APIError} NotFound if user doesn't exist
 */
export const userGet = api(
  {
    method: "GET",
    path: "/user/core/user/:id",
    expose: true,
    auth: true,
  },
  async (params: UserGetRequest): Promise<UserGetResponse> => {
    return await userService.getUserById(params.id);
  }
);

export interface UserGetRequest {
  id: string; // From URL path
}

export interface UserGetResponse {
  user: User;
}
```

### Public API with Module-Based Path

For large services using modules:

```typescript
import { api } from "encore.dev/api";
import { aiAgentCatalogService } from "../services/ai_agents.service";

/**
 * Get AI Agent from catalog
 *
 * This endpoint is part of the agent_catalog module.
 * Path structure: /service-name/module-name/endpoint-logic
 *
 * @param params - Agent ID or unique alias
 * @returns AI Agent configuration
 * @throws {APIError} NotFound if agent doesn't exist
 */
export const aiAgentInCatalogGet = api(
  {
    method: "GET",
    path: "/ai-common-management/agent-catalog/ai-agent",
    expose: true,
    auth: true,
    tags: ["agent_catalog"],
  },
  async (params: AIModelGetRequest): Promise<IAIAgentInCatalogPublic> => {
    return aiAgentCatalogService.get(params);
  }
);

export interface AIModelGetRequest {
  id: string; // ID or unique alias
}
```

---

## Private API Endpoints

Private APIs are internal-only and used for service-to-service communication within the Encore ecosystem.

### Requirements

- ✅ **Must** start with underscore `_` in filename and endpoint name
- ✅ **Must** use `expose: false`
- ✅ **Typically** use `auth: false` (service-to-service trusted)
- ✅ **Cannot** be called from outside Encore
- ✅ File name: `_{model}{Operation}.controller.ts`
- ✅ Endpoint name: Starts with `_`
- ✅ Prefer `/internal/` path segment for new private endpoints (for example `/user/core/internal/create`)

**Path note:** Some older services/docs use `/private/` in private endpoint paths. Keep existing services consistent, but prefer `/internal/` for new endpoints and don't mix both styles within one service.

### Basic Private API Template

```typescript
import { api } from "encore.dev/api";
import type { IsEmail } from "encore.dev/validate";
import { userService } from "../services/user.service";

/**
 * Internal API: Create user
 *
 * This endpoint is for internal service-to-service communication only.
 * NOT accessible from outside the Encore ecosystem.
 * Used by authentication service during OAuth flow.
 *
 * @param params - User creation parameters
 * @returns Created user object
 */
export const _internalUserCreate = api(
  {
    method: "POST",
    path: "/user/core/internal/create",
    expose: false,
    auth: false,
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return await userService.createUser(params);
  }
);

export interface UserCreateRequest {
  id?: string;
  googleId?: string;
  name: string;
  email: string & IsEmail;
  profileUrl?: string;
  roles?: UserRole[];
}

export interface UserCreateResponse {
  user: User;
}
```

### Private API for Bulk Operations

```typescript
import { api } from "encore.dev/api";
import { userService } from "../services/user.service";

/**
 * Internal API: Bulk user sync
 *
 * Used by sync service to batch update users from external system.
 * NOT exposed to external clients.
 *
 * @param params - Array of users to sync
 * @returns Sync results with success/failure counts
 */
export const _bulkUserSync = api(
  {
    method: "POST",
    path: "/user/core/internal/sync",
    expose: false,
    auth: false,
  },
  async (params: BulkUserSyncRequest): Promise<BulkUserSyncResponse> => {
    return await userService.bulkSync(params.users);
  }
);

export interface BulkUserSyncRequest {
  users: UserSyncData[];
}

export interface BulkUserSyncResponse {
  synced: number;
  failed: number;
  errors?: string[];
}
```

---

## HTTP Methods

### GET - Retrieve Resources

Use for read-only operations that don't modify state.

```typescript
export const userGet = api(
  { method: "GET", path: "/user/:id", expose: true, auth: true },
  async (params: { id: string }): Promise<UserResponse> => {
    return await userService.getUser(params.id);
  }
);
```

### POST - Create Resources

Use for creating new resources.

```typescript
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return await userService.createUser(params);
  }
);
```

### PUT - Update Resources (Full)

Use for complete resource updates.

```typescript
export const userUpdate = api(
  { method: "PUT", path: "/user/:id", expose: true, auth: true },
  async (params: UserUpdateRequest): Promise<UserUpdateResponse> => {
    return await userService.updateUser(params.id, params);
  }
);
```

### PATCH - Partial Update

Use for partial resource updates.

```typescript
export const userPatch = api(
  { method: "PATCH", path: "/user/:id", expose: true, auth: true },
  async (params: UserPatchRequest): Promise<UserPatchResponse> => {
    return await userService.patchUser(params.id, params);
  }
);
```

### DELETE - Remove Resources

Use for soft or hard deletes.

```typescript
export const userDelete = api(
  { method: "DELETE", path: "/user/:id", expose: true, auth: true },
  async (params: { id: string }): Promise<void> => {
    await userService.softDeleteUser(params.id);
  }
);
```

---

## Input Validation

### Encore Native Validators

Encore provides built-in validators for common patterns:

```typescript
import type {
  Min, Max, MinLen, MaxLen,
  IsEmail, IsURL
} from "encore.dev/validate";

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

### Zod Validation (Advanced)

For complex validation logic:

```typescript
import { z } from "zod";
import { APIError, ErrCode } from "encore.dev/api";

export const UserCreateRequestValidator = z.object({
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  tags: z.array(z.string()).max(10),
  metadata: z.record(z.any()).optional(),
});

export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    // Validate with Zod
    const validation = UserCreateRequestValidator.safeParse(params);

    if (!validation.success) {
      throw new APIError(ErrCode.InvalidArgument, "Validation failed")
        .withDetails({ errors: validation.error.errors });
    }

    return await userService.createUser(validation.data);
  }
);
```

---

## Authorization Patterns

### Single Role Check

```typescript
import { authorization } from "~encore/clients";
import { UserRole } from "@groupon/lib/types";

await authorization.validatePermission({
  requiredRoles: [UserRole.ADMIN],
});
```

### Multiple Role Check (OR)

```typescript
await authorization.validatePermission({
  requiredRoles: [UserRole.ADMIN, UserRole.USER_ADMIN],
});
```

### Custom Authorization Logic

```typescript
import { getAuthData } from "~encore/auth";

const authData = getAuthData();
if (!authData) {
  throw APIError.unauthenticated("Not authenticated");
}

// Check if user owns the resource
const resource = await resourceService.get(params.id);
if (resource.ownerId !== authData.userID) {
  throw APIError.permissionDenied("Not authorized to access this resource");
}
```

---

## Error Handling

### Throwing Errors

```typescript
import { APIError, ErrCode } from "encore.dev/api";

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
  .withDetails({
    field: "email",
    message: "Invalid format"
  });
```

### Try-Catch in Controllers

```typescript
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    try {
      return await userService.createUser(params);
    } catch (error) {
      log.error(error, "User creation failed", { params });

      if (error instanceof APIError) {
        throw error; // Re-throw APIError as-is
      }

      throw APIError.internal("Failed to create user");
    }
  }
);
```

---

## Response Patterns

### Success Response

```typescript
export interface UserCreateResponse {
  user: User;
  message?: string;
}

return {
  user: createdUser,
  message: "User created successfully",
};
```

### Paginated Response

```typescript
export interface UserListResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

return {
  users: results,
  pagination: {
    page: params.page || 1,
    limit: params.limit || 10,
    total: totalCount,
    hasMore: (params.page || 1) * (params.limit || 10) < totalCount,
  },
};
```

### Empty Success Response

```typescript
export const userDelete = api(
  { method: "DELETE", path: "/user/:id", expose: true, auth: true },
  async (params: { id: string }): Promise<void> => {
    await userService.softDeleteUser(params.id);
    // No return value needed
  }
);
```

---

## Documentation Standards

### Controller Documentation Template

```typescript
/**
 * Short one-line description
 *
 * Detailed explanation of what this endpoint does.
 * Include important notes about permissions, side effects, etc.
 *
 * @param params - Description of parameters
 * @returns Description of return value
 * @throws {APIError} NotFound - When resource doesn't exist
 * @throws {APIError} PermissionDenied - When user lacks permissions
 * @throws {APIError} InvalidArgument - When validation fails
 *
 * @example
 * ```typescript
 * const result = await userCreate({
 *   name: "John Doe",
 *   email: "john@example.com",
 * });
 * ```
 */
export const userCreate = api(/*...*/);
```

### Controller Documentation Quality

Write controller descriptions so someone unfamiliar with the service can find the correct endpoint quickly.

- Be explicit about purpose, permissions, and side effects.
- Prefer concrete wording over vague descriptions.
- This improves onboarding and endpoint discoverability in tooling/search.

---

## Best Practices

### ✅ DO

- Keep controllers thin - delegate to services
- Validate all inputs using types or validators
- Check authorization before processing
- Use clear, descriptive endpoint paths
- Document all endpoints with JSDoc
- Return typed responses
- Log important operations
- Use appropriate HTTP methods and status codes

### ❌ DON'T

- Include business logic in controllers
- Make direct database queries
- Transform complex data in controllers
- Use anonymous types for requests/responses
- Skip authorization checks
- Return inconsistent response formats
- Expose internal implementation details
- Mix public and private logic

---

## Testing Controllers

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { userCreate } from "./userCreate.controller";

describe("userCreate controller", () => {
  it("should create user successfully", async () => {
    const result = await userCreate({
      name: "Test User",
      email: "test@example.com",
    });

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe("test@example.com");
  });

  it("should throw error for invalid email", async () => {
    await expect(
      userCreate({
        name: "Test",
        email: "invalid-email",
      })
    ).rejects.toThrow("Invalid email");
  });

  it("should require authentication", async () => {
    // Test without auth token
    await expect(
      userCreate({
        name: "Test",
        email: "test@example.com",
      })
    ).rejects.toThrow("Unauthenticated");
  });
});
```

---

## Module-Based Services

### When to Use Modules

Use module-based organization for large services when:
- ✅ Service handles multiple distinct domains (e.g., agent_catalog, gcp_keys, oauth)
- ✅ Service has > 30 files
- ✅ Different teams work on different modules
- ✅ You want clear API path structure with module names

### Module Structure

```
/services/ai-common-management/
├── modules/
│   ├── agent_catalog/
│   │   ├── controllers/
│   │   │   ├── aiAgentCreate.controller.ts
│   │   │   └── aiAgentGet.controller.ts
│   │   ├── services/
│   │   ├── repository/
│   │   ├── schemas/
│   │   └── interfaces/
│   │
│   ├── gcp_keys/
│   │   └── controllers/
│   │       └── gcpKeyGetOwn.controller.ts
│   │           # path: /ai-common-management/gcp-keys/gcp-key
│   │
│   └── oauth_feeder/
│       └── controllers/
│           └── oauthCreate.controller.ts
│               # path: /ai-common-management/oauth-feeder/oauth-credential
│
├── common/               # Shared across modules
│   └── interfaces/
│
└── encore.service.ts     # supportModules: true
```

### Module Controller Example

```typescript
// File: modules/gcp_keys/controllers/gcpKeyGetOwn.controller.ts
import { api } from "encore.dev/api";
import { gcpService } from "../services/gcp.service";

/**
 * Get GCP credentials for authenticated user
 *
 * Module: gcp_keys
 * Path pattern: /service-name/module-name/endpoint
 */
export const gcpTokenGetOwn = api(
  {
    method: "GET",
    path: "/ai-common-management/gcp-keys/gcp-key",
    expose: true,
    auth: true,
    tags: ["gcp_keys"],
  },
  async (): Promise<IGetGCPTokenCredentialResponse> => {
    return await gcpService.getOwn();
  }
);

export interface IGetGCPTokenCredentialResponse {
  user_owner_email: string;
  name: string;
  uniqueId: string;
  email: string;
  credentials: IGetGCPTokenCredentialRecord[];
}
```

### Enabling Module Support

In your `encore.service.ts`:

```typescript
import { Service } from "encore.dev/service";
import { appMeta } from "encore.dev";
import { service_management } from "~encore/clients";
import { GrouponServiceProvider } from "@core/service_management/models/models";

export default new Service("ai_common_management", {
  middlewares: [errorMiddleware],
});

registerService(appMeta(), () =>
  service_management._encoreServiceAdd(
    new GrouponServiceProvider("ai_common_management", {
      name: "AI Common Management",
      description: "Manages shared AI configs and onboarding.",

      // CRITICAL: Enable module support for module-based paths
      supportModules: true,

    }).init()
  )
);
```

---

## Common Patterns

### Pagination

```typescript
import { PAGINATION_DEFAULTS } from "@groupon/lib/consts";

export interface PaginatedRequest {
  page?: Query<number>;
  limit?: Query<number>;
}

export const userList = api(
  { method: "GET", path: "/users", expose: true, auth: true },
  async (params: PaginatedRequest): Promise<UserListResponse> => {
    const page = params.page || PAGINATION_DEFAULTS.PAGE;
    const limit = Math.min(
      params.limit || PAGINATION_DEFAULTS.LIMIT,
      PAGINATION_DEFAULTS.MAX_LIMIT
    );

    return await userService.list({ page, limit });
  }
);
```

### Filtering

```typescript
export interface UserFilterRequest {
  email?: Query<string>;
  role?: Query<string>;
  isActive?: Query<boolean>;
  createdAfter?: Query<string>; // ISO date string
}

export const usersFilter = api(
  { method: "GET", path: "/users", expose: true, auth: true },
  async (params: UserFilterRequest): Promise<UserListResponse> => {
    return await userService.filter(params);
  }
);
```

### Batch Operations

```typescript
export interface UserBatchGetRequest {
  ids: string[];
}

export interface UserBatchGetResponse {
  users: Record<string, User>;
  notFound: string[];
}

export const userBatchGet = api(
  { method: "POST", path: "/users/batch", expose: true, auth: true },
  async (params: UserBatchGetRequest): Promise<UserBatchGetResponse> => {
    return await userService.batchGet(params.ids);
  }
);
```

---

## Summary

Controllers are the HTTP interface layer of your Encore service. They must:

1. **Remain thin** - Delegate to services
2. **Validate inputs** - Use types and validators
3. **Check authorization** - Verify permissions first
4. **Handle errors gracefully** - Throw appropriate APIErrors
5. **Document thoroughly** - Clear JSDoc comments
6. **Follow conventions** - Public vs private, naming, structure
7. **Use correct path structure**:
   - Standard services: `/service-name/endpoint-logic`
   - Module-based services: `/service-name/module-name/endpoint-logic`
8. **Enable module support** - Set `supportModules: true` when using modules

### Path Structure Quick Reference

| Service Type | Path Pattern | Configuration |
|--------------|--------------|---------------|
| **Small Service** | `/service-name/endpoint` | No special config needed |
| **Large Service with Modules** | `/service-name/module/endpoint` | `supportModules: true` |

**Examples:**

```typescript
// Small service (no modules)
path: "/user/core/me"
path: "/user/core/user/:id"

// Large service with modules
path: "/ai-common-management/agent-catalog/ai-agent"
path: "/ai-common-management/gcp-keys/gcp-key"
path: "/ai-common-management/oauth-feeder/oauth-credential"
```

**Remember: A controller's job is to translate HTTP requests into service calls, nothing more.**
