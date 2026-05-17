# Service Architecture & Patterns

## Overview

This document defines the architectural patterns, service structure, and design principles for building Encore TypeScript microservices at Groupon. These patterns ensure consistency, scalability, and maintainability across the entire platform.

---

## Core Architecture: Layered Pattern

Our services follow a **strict layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────┐
│         HTTP Request                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      CONTROLLER LAYER                │
│  - Receive & validate requests       │
│  - Authorization checks              │
│  - Delegate to services              │
│  - Return HTTP responses             │
│  ❌ NO business logic                │
│  ❌ NO database access               │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│       SERVICE LAYER                  │
│  - Business logic                    │
│  - Orchestration                     │
│  - Cross-service communication       │
│  - Data transformation               │
│  ❌ NO database queries              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      REPOSITORY LAYER                │
│  - Database queries (Drizzle ORM)    │
│  - Transaction management            │
│  - Data persistence                  │
│  ❌ NO business logic                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│          DATABASE                    │
│      (PostgreSQL)                    │
└─────────────────────────────────────┘
```

### Service Layer Rule (Data Access)

Services should access data through **repository methods by default**.

- ✅ Preferred: `service -> repository -> database`
- ❌ Avoid: direct SQL/ORM queries in service methods
- ✅ Exception (documented): service-level transaction orchestration for multi-step workflows may use `db.transaction(...)`

When a service orchestrates a transaction, prefer calling repository methods inside the transaction (or transaction-aware repository helpers) instead of embedding unrelated query logic in the service.

---

## Service Patterns

### Basic Service Template

```typescript
// services/user.service.ts
class UserService {
  async createUser(req: CreateUserRequest): Promise<UserResponse> {
    const exists = await userRepository.findByEmail(req.email);

    if (exists) {
      throw APIError.alreadyExists("User already exists");
    }

    const user = await userRepository.create(req);
    return { user };
  }
}

// Export singleton service instance
export const userService = new UserService();
```

### Pattern 1: Small Service (Single Domain)

**Use when:**
- Service has single, focused responsibility
- Limited number of endpoints (< 15)
- Simple domain model
- Team size: 1-3 developers

**Structure:**

```
/services/user/
├── controllers/           # API endpoints
├── services/             # Business logic
├── repositories/         # Data access
├── interfaces/           # Types & DTOs
├── schemas/             # Database schema
├── db/                  # Database config & migrations
├── utils/               # Utilities
├── test/                # Tests
└── encore.service.ts    # Service configuration
```

**Example: Authentication Service**

```typescript
// encore.service.ts
export default new Service("authentication", {
  middlewares: [errorMiddleware],
});

// controllers/login.controller.ts
export const login = api(
  { method: "POST", path: "/auth/login", expose: true, auth: false },
  async (params: LoginRequest): Promise<LoginResponse> => {
    return await authService.login(params);
  }
);

// services/auth.service.ts
class AuthService {
  async login(params: LoginRequest): Promise<LoginResponse> {
    const user = await userRepository.findByEmail(params.email);
    // Business logic...
    return { token };
  }
}

// repositories/user.repository.ts
class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return await db.select().from(userTable).where(eq(userTable.email, email));
  }
}
```

---

### Pattern 2: Large Service (Multiple Domains)

**Use when:**
- Service has multiple related domains
- Many endpoints (15+)
- Complex domain model
- Team size: 3+ developers

**Structure:**

```
/services/deal-management/
├── modules/
│   ├── deals/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── interfaces/
│   │   ├── schemas/
│   │   └── test/
│   ├── merchants/
│   │   └── [same structure]
│   └── campaigns/
│       └── [same structure]
├── shared/              # Shared code between modules
│   ├── utils/
│   └── interfaces/
├── db/                  # Shared database config
└── encore.service.ts    # Service configuration
```

**Example: Deal Management Service**

```
/services/deal-management/
├── modules/
│   ├── deals/
│   │   ├── controllers/
│   │   │   ├── dealCreate.controller.ts
│   │   │   ├── dealUpdate.controller.ts
│   │   │   └── dealGet.controller.ts
│   │   ├── services/
│   │   │   └── deal.service.ts
│   │   ├── repositories/
│   │   │   └── deal.repository.ts
│   │   └── interfaces/
│   │       └── interfaces.ts
│   └── merchants/
│       └── [similar structure]
├── shared/
│   ├── utils/
│   │   └── validation.utils.ts
│   └── interfaces/
│       └── common.interfaces.ts
└── encore.service.ts
```

---

## Service Configuration (encore.service.ts)

### Purpose

The `encore.service.ts` file is the **central configuration** for each service:

1. **Define service metadata**
2. **Configure middleware**
3. **Declare secrets**
4. **Initialize external clients**
5. **Set up constants**
6. **Register with ORR (Operational Readiness Review)**

### Template

```typescript
import { errorMiddleware } from "@core/middleware/error";
import { metadataMiddleware } from "@core/middleware/metadata";
import { _coreORRServiceConfig } from "@core/orr_service_configs/core_alert_policy.orr";
import { _core_system_config } from "@core/orr_service_configs/core_system.orr";
import { registerService } from "@core/service_management/initiator/init.service";
import { GrouponServiceProvider } from "@core/service_management/models/models";
import { RedisService } from "@core/databases/redis/redis.service";
import { appMeta } from "encore.dev";
import { secret } from "encore.dev/config";
import { Service } from "encore.dev/service";
import { Bucket } from "encore.dev/storage/objects";
import { service_management } from "~encore/clients";

// ==== SERVICE SECRETS ================================================================================================

const OPENAI_API_KEY = secret("OPENAI_API_KEY");
const REDIS_URL = secret("REDIS_COMMON_ENCORE");
export const SERVICE_ACCOUNT_KEY = secret("ENCORE_SERVICE_ACCOUNT_KEY");

// ==== SERVICE CONSTANTS ===============================================================================================

/**
 * Maximum page size for paginated endpoints
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Default pagination limit
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Redis client for caching
 */
export const redisClient = await new RedisService(
  REDIS_URL(),
  "service_name"
).connect();

/**
 * Public bucket for file storage
 */
export const filesBucket = new Bucket("service-files", {
  versioned: false,
  public: true,
});

// ==== SERVICE CONFIG =================================================================================================

// Configure environment variables for external libraries
process.env.OPENAI_API_KEY = OPENAI_API_KEY();

// ==== ENCORE CONFIG ==================================================================================================

/**
 * Service Name
 *
 * Brief description of what this service does.
 * Include key responsibilities and dependencies.
 */
export default new Service("service_name", {
  middlewares: [errorMiddleware, metadataMiddleware],
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
      description: "Detailed service description for monitoring and documentation.",
      supportModules: true,

      // Common configuration (varies by service category)
      // For tribe-specific configs, see:
      // - B2B Tribe: apps/encore-ts/services/_tribe_b2b/b2b.orr.ts
      // - B2C Tribe: apps/encore-ts/services/_tribe_b2c/b2c.orr.ts
      // - Core Tribe: apps/encore-ts/services/_tribe_core/core.orr.ts
      // - Marketing Tribe: apps/encore-ts/services/_tribe_marketing/marketing.orr.ts
      ..._core_system_config,

      // ORR configuration
      ..._coreORRServiceConfig,
    }).init()
  )
);
```

---

## Service Communication

### Internal Communication (Service-to-Service)

Encore provides **type-safe** service-to-service communication:

```typescript
import { user, authorization, auditlog } from "~encore/clients";

// Call another service
const userResult = await user._internalUserCreate({
  name: "John Doe",
  email: "john@example.com",
});

// Check permissions
await authorization.validatePermission({
  requiredRoles: [UserRole.ADMIN],
});

// Log to audit log
await auditlog._create({
  action: "CREATE",
  entity: "USER",
  entityId: userResult.user.id,
  data: { email: userResult.user.email },
});
```

### Benefits

- ✅ **Type-safe**: Compile-time type checking
- ✅ **Auto-complete**: Full IDE support
- ✅ **Automatic retry**: Built-in retry logic
- ✅ **Distributed tracing**: Automatic request tracking
- ✅ **Load balancing**: Automatic across instances

### Private APIs for Service Communication

Use **private APIs** (prefixed with `_`) for internal communication:

```typescript
// In user service: _internalUserCreate.controller.ts
export const _internalUserCreate = api(
  {
    method: "POST",
    path: "/user/internal/create",
    expose: false,  // Not accessible externally
    auth: false,    // No auth needed (trusted internal)
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return await userService.createUser(params);
  }
);

// In another service: Call the private API
import { user } from "~encore/clients";

const result = await user._internalUserCreate({
  name: "John",
  email: "john@example.com",
});
```

---

## Data Flow Patterns

### Pattern 1: Simple CRUD

**Flow:** Controller → Service → Repository → Database

```typescript
// Controller: Receive request
export const userGet = api(
  { method: "GET", path: "/user/:id", expose: true, auth: true },
  async (params: { id: string }): Promise<UserGetResponse> => {
    return await userService.getUserById(params.id);
  }
);

// Service: Business logic
async getUserById(id: string): Promise<UserGetResponse> {
  const user = await userRepository.findById(id);

  if (!user) {
    throw APIError.notFound("User not found");
  }

  return { user };
}

// Repository: Database access
async findById(id: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, id))
    .limit(1);

  return user || null;
}
```

---

### Pattern 2: Complex Business Logic

**Flow:** Controller → Service → Multiple Repositories + External Services

Note: This example demonstrates **service-level transaction orchestration**. Use this pattern for multi-step workflows, but keep data-access logic in repositories where practical.

```typescript
// Service: Orchestrate multiple operations
async createDealWithMerchant(params: CreateDealRequest): Promise<CreateDealResponse> {
  // 1. Validate merchant exists
  const merchant = await merchantRepository.findById(params.merchantId);
  if (!merchant) {
    throw APIError.notFound("Merchant not found");
  }

  // 2. Check user permissions
  await this.validateMerchantAccess(merchant.id);

  // 3. Create deal (in transaction)
  const deal = await db.transaction(async (tx) => {
    const [newDeal] = await tx.insert(dealTable).values(params).returning();

    // Create default campaign
    await tx.insert(campaignTable).values({
      dealId: newDeal.id,
      name: "Default Campaign",
    });

    return newDeal;
  });

  // 4. Send notifications
  await this.notifyMerchant(merchant.id, deal.id);

  // 5. Log to audit
  await auditlog._create({
    action: "CREATE",
    entity: "DEAL",
    entityId: deal.id,
    data: { merchantId: merchant.id },
  });

  return { deal };
}
```

---

### Pattern 3: Event-Driven (Pub/Sub)

**Flow:** Service → Topic → Subscriber(s)

**Publisher:**

```typescript
// topics/userCreated.topic.ts
import { Topic } from "encore.dev/pubsub";

export interface UserCreatedEvent {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

export const userCreatedTopic = new Topic<UserCreatedEvent>("user-created", {
  deliveryGuarantee: "at-least-once",
});

// services/user.service.ts
async createUser(params: UserCreateRequest): Promise<UserCreateResponse> {
  const user = await userRepository.create(params);

  // Publish event
  await userCreatedTopic.publish({
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  });

  return { user };
}
```

**Subscriber:**

```typescript
// In email service: pubsub/sendWelcomeEmail.sub.ts
import { Subscription } from "encore.dev/pubsub";
import { userCreatedTopic } from "~encore/clients/user";

const _ = new Subscription(userCreatedTopic, "send-welcome-email", {
  handler: async (event) => {
    await emailService.sendWelcomeEmail({
      to: event.email,
      name: event.name,
    });

    log.info("Welcome email sent", { userId: event.userId });
  },
});
```

---

## Middleware Patterns

### Global Middleware

Applied to **all** endpoints in a service:

```typescript
// encore.service.ts
export default new Service("service_name", {
  middlewares: [
    errorMiddleware,      // Error handling
    metadataMiddleware,   // Request metadata
    loggingMiddleware,    // Request logging
  ],
});
```

### Error Middleware

```typescript
// core/middleware/error.ts
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";

export const errorMiddleware = async (req: any, next: any) => {
  try {
    return await next(req);
  } catch (error) {
    if (error instanceof APIError) {
      log.error(error, "API Error", { path: req.path });
      throw error;
    }

    log.error(error, "Unexpected error", { path: req.path });
    throw APIError.internal("Internal server error");
  }
};
```

### Metadata Middleware

```typescript
// core/middleware/metadata.ts
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";

export const metadataMiddleware = async (req: any, next: any) => {
  const authData = getAuthData();
  const requestId = crypto.randomUUID();

  log.info("Request started", {
    requestId,
    path: req.path,
    method: req.method,
    userId: authData?.userID,
  });

  const startTime = Date.now();
  const result = await next(req);
  const duration = Date.now() - startTime;

  log.info("Request completed", {
    requestId,
    path: req.path,
    duration,
  });

  return result;
};
```

---

## Caching Strategies

### Pattern 1: Redis Caching

```typescript
// Service with Redis cache
class UserService {
  async getUserById(id: string): Promise<User> {
    // Try cache first
    const cached = await redisClient.get(`user:${id}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - fetch from database
    const user = await userRepository.findById(id);
    if (!user) {
      throw APIError.notFound("User not found");
    }

    // Store in cache (5 minutes TTL)
    await redisClient.setex(`user:${id}`, 300, JSON.stringify(user));

    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const updated = await userRepository.update(id, data);

    // Invalidate cache
    await redisClient.del(`user:${id}`);

    return updated;
  }
}
```

### Pattern 2: In-Memory Caching

```typescript
class ConfigService {
  #cache = new Map<string, { value: any; expiry: number }>();

  async getConfig(key: string): Promise<any> {
    const cached = this.#cache.get(key);

    // Check if cached and not expired
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    // Fetch fresh data
    const value = await configRepository.get(key);

    // Cache for 1 hour
    this.#cache.set(key, {
      value,
      expiry: Date.now() + 3600000,
    });

    return value;
  }
}
```

---

## Error Handling Patterns

### Service-Level Errors

Service methods should throw `APIError` (or transform errors into `APIError`) instead of throwing generic `Error`.

```typescript
// ✅ Good
throw APIError.invalidArgument("Feature ID is required and must be a string");

// ❌ Avoid in services
throw new Error("Configuration not found");
```

```typescript
class UserService {
  async createUser(params: UserCreateRequest): Promise<UserCreateResponse> {
    // Check if user exists
    const existing = await userRepository.findByEmail(params.email);
    if (existing) {
      throw APIError.alreadyExists("User with this email already exists");
    }

    // Validate business rules
    if (!this.isValidEmail(params.email)) {
      throw APIError.invalidArgument("Invalid email format");
    }

    try {
      const user = await userRepository.create(params);
      return { user };
    } catch (error) {
      log.error(error, "Failed to create user", { params });
      throw APIError.internal("Failed to create user");
    }
  }
}
```

### Repository-Level Errors

```typescript
class UserRepository {
  async create(data: NewUser): Promise<User> {
    try {
      const [user] = await db
        .insert(userTable)
        .values(data)
        .returning();

      return user;
    } catch (error) {
      log.error(error, "Database error in create", { data });

      // Handle specific database errors
      if (error instanceof Error && error.message.includes("unique constraint")) {
        throw APIError.alreadyExists("User already exists");
      }

      throw APIError.internal("Database error");
    }
  }
}
```

---

## Transaction Patterns

### Pattern 1: Simple Transaction

Transaction orchestration may live in the service layer when coordinating multiple business operations. Prefer repository methods/helpers for the actual data-access logic when possible.

```typescript
async createDealWithCampaign(params: CreateDealRequest): Promise<Deal> {
  return await db.transaction(async (tx) => {
    // All operations in transaction
    const [deal] = await tx.insert(dealTable).values(params).returning();

    await tx.insert(campaignTable).values({
      dealId: deal.id,
      name: "Default Campaign",
    });

    return deal;
  });
}
```

### Pattern 2: Complex Transaction with Rollback

```typescript
async transferOwnership(fromId: string, toId: string, dealId: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Verify current owner
      const [deal] = await tx
        .select()
        .from(dealTable)
        .where(eq(dealTable.id, dealId))
        .limit(1);

      if (!deal || deal.ownerId !== fromId) {
        throw APIError.permissionDenied("Not authorized");
      }

      // Verify new owner exists
      const [newOwner] = await tx
        .select()
        .from(userTable)
        .where(eq(userTable.id, toId))
        .limit(1);

      if (!newOwner) {
        throw APIError.notFound("New owner not found");
      }

      // Transfer ownership
      await tx
        .update(dealTable)
        .set({ ownerId: toId })
        .where(eq(dealTable.id, dealId));

      // Log transfer
      await tx.insert(auditLogTable).values({
        action: "TRANSFER_OWNERSHIP",
        entityId: dealId,
        fromUserId: fromId,
        toUserId: toId,
      });
    });

    log.info("Ownership transferred", { dealId, fromId, toId });
  } catch (error) {
    log.error(error, "Ownership transfer failed", { dealId, fromId, toId });
    throw error;
  }
}
```

---

## Side Effects and Audit Logging Placement

Keep cross-service side effects (for example `auditlog._create(...)`) in the **service layer**, not in repositories.

- Repository: persist data and return the result.
- Service: orchestrate additional effects after persistence succeeds.

```typescript
async createUser(params: UserCreateRequest): Promise<UserCreateResponse> {
  const user = await userRepository.create(params);

  await auditlog._create({
    action: "CREATE",
    entity: "USER",
    entityId: user.id,
    data: { email: user.email },
  });

  return { user };
}
```

---

## Scheduled Jobs (Cron)

### Pattern: Periodic Data Sync

```typescript
// crons/syncUsers.cron.ts
import { CronJob } from "encore.dev/cron";
import { api } from "encore.dev/api";
import log from "encore.dev/log";

const _ = new CronJob("sync-users", {
  title: "Sync users from Workday",
  every: "1h",
  endpoint: syncUsers,
});

export const syncUsers = api({}, async (): Promise<void> => {
  log.info("Starting user sync");

  try {
    const users = await workdayService.getUsers();

    for (const user of users) {
      await userService.syncUser(user);
    }

    log.info("User sync completed", { count: users.length });
  } catch (error) {
    log.error(error, "User sync failed");
    throw error;
  }
});
```

---

## Best Practices

### ✅ DO

1. **Follow layered architecture strictly**
2. **Keep controllers thin**
3. **Put business logic in services**
4. **Use repositories for all database access**
5. **Use private APIs for service-to-service**
6. **Implement proper error handling**
7. **Log important operations**
8. **Use transactions for multi-step operations**
9. **Cache frequently accessed data**
10. **Document service responsibilities**
11. **Export singleton service instances**

### ❌ DON'T

1. **Don't mix layers** (e.g., database queries in controllers)
2. **Don't skip authorization checks**
3. **Don't hardcode configuration**
4. **Don't expose internal APIs publicly**
5. **Don't create God services** (do everything)
6. **Don't skip error handling**
7. **Don't ignore transaction boundaries**
8. **Don't create circular dependencies**

---

## Service Checklist

### New Service Checklist

- [ ] `encore.service.ts` configured
- [ ] Middleware applied (errorMiddleware minimum)
- [ ] Secrets defined for external services
- [ ] Constants exported and documented
- [ ] Registered with ORR (service_management)
- [ ] README.md created with service documentation
- [ ] Public APIs use `expose: true, auth: true`
- [ ] Private APIs use `expose: false, auth: false` and `_` prefix
- [ ] Controllers delegate to services
- [ ] Services use repositories for data
- [ ] Services avoid direct DB queries (except documented transaction orchestration)
- [ ] Repositories use Drizzle ORM
- [ ] Service singleton instance exported (for example `export const userService = new UserService()`)
- [ ] Tests co-located with source files
- [ ] Error handling implemented
- [ ] Logging implemented

---

## Summary

A well-architected Encore service:

1. **Follows layered architecture** (Controller → Service → Repository)
2. **Has clear boundaries** between layers
3. **Uses type-safe communication** for service-to-service calls
4. **Implements proper error handling** at all layers
5. **Uses transactions** for data consistency
6. **Caches appropriately** for performance
7. **Logs contextually** for observability
8. **Tests thoroughly** at all layers

**Remember: Good architecture makes development faster, debugging easier, and maintenance sustainable.**
