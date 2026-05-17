# Folder Structure & Naming

## Overview

A consistent folder structure is the foundation of a maintainable codebase. This document defines **strict, non-negotiable** rules for organizing Encore TypeScript microservices. Every file must have a clear home. Every developer must know where to find—and where to place—code.

**These rules are mandatory.** Code reviews will reject PRs that violate this structure.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Small Microservice Structure](#small-microservice-structure)
3. [Large Microservice Structure](#large-microservice-structure)
4. [Folder Purposes & Rules](#folder-purposes--rules)
5. [Common Libraries](#common-libraries)
6. [File Organization Best Practices](#file-organization-best-practices)
7. [Anti-Patterns](#anti-patterns)
8. [Migration Guide](#migration-guide)

---

## Core Principles

### 1. Predictable Structure
Every service follows the same pattern. A developer should find `userCreate.controller.ts` in `/controllers/` in **every** service.

### 2. Separation of Concerns
- **Controllers:** HTTP layer only
- **Services:** Business logic only
- **Repositories:** Database access only
- **Utils:** Pure, reusable functions only

### 3. Dedicated Test Directory
Tests are in dedicated test folders (`/tests`), separate from source files, mirroring the structure they test.

### 4. Clear Boundaries
Public APIs have no underscore. Private APIs start with `_`. This is enforced everywhere.

### 5. Scalability
Structure works for both 3-file services and 50-file services. Start small, grow predictably.

---

## Small Microservice Structure

**When to use:** Service with single domain, < 20 files, simple responsibilities

### Complete Structure

```
/services/{service-name}/
├── controllers/                    # HTTP endpoints
│   ├── userCreate.controller.ts         # Public API (exposed)
│   ├── userUpdate.controller.ts
│   ├── userGet.controller.ts
│   └── _internalUserSync.controller.ts  # Private API (internal)
│
├── services/                       # Business logic
│   ├── user.service.ts
│   └── notification.service.ts
│
├── repositories/                   # Data access
│   ├── user.repository.ts
│   └── audit-log.repository.ts
│
├── db/                            # Database configuration
│   ├── db.ts                           # Database connection
│   ├── drizzle.config.ts              # Drizzle Kit config
│   └── migrations/                     # SQL migrations
│       ├── 0001_initial.sql
│       ├── 0002_add_users.sql
│       └── meta/
│           └── _journal.json
│
├── schemas/                       # Database schemas
│   ├── user.schema.ts                  # Drizzle table definitions
│   ├── audit-log.schema.ts
│   └── relations.ts                    # Drizzle relations (optional)
│
├── interfaces/                    # Type definitions
│   ├── user.interfaces.ts              # User-specific DTOs
│   ├── notification.interfaces.ts
│   └── interfaces.ts                   # Universal types
│
├── utils/                         # Utilities
│   ├── validation.utils.ts             # Validation helpers
│   ├── formatting.utils.ts
│   └── utils.ts                        # Generic utilities
│
├── pubsub/                        # Pub/Sub (optional)
│   ├── _createUser.sub.ts              # Subscription
│   └── _emitNewUser.pub.ts            # Publisher
│
├── topics/                        # Topic definitions (optional)
│   └── userEvents.topic.ts
│
├── crons/                         # Scheduled jobs (optional)
│   └── dailyCleanup.cron.ts
│
├── buckets/                       # Object storage (optional)
│   └── userAvatars.bucket.ts
│
├── middleware/                    # Custom middleware (optional)
│   ├── auth.middleware.ts
│   └── logging.middleware.ts
│
├── tests/                         # Test files (mirrors source structure)
│   ├── controllers/
│   │   ├── userCreate.controller.test.ts
│   │   ├── userUpdate.controller.test.ts
│   │   ├── userGet.controller.test.ts
│   │   └── _internalUserSync.controller.test.ts
│   │
│   ├── services/
│   │   ├── user.service.test.ts
│   │   └── notification.service.test.ts
│   │
│   ├── repositories/
│   │   ├── user.repository.test.ts
│   │   └── audit-log.repository.test.ts
│   │
│   ├── utils/
│   │   └── validation.utils.test.ts
│   │
│   ├── pubsub/
│   │   ├── _createUser.sub.test.ts
│   │   └── _emitNewUser.pub.test.ts
│   │
│   └── crons/
│       └── dailyCleanup.cron.test.ts
│
├── encore.service.ts              # Encore service config
├── README.md                      # Service documentation
└── ai_readme.md                   # AI-specific docs (optional)
```

### Mandatory Files

Every small service **MUST** have:

1. **`encore.service.ts`** - Service configuration
2. **`README.md`** - Service documentation
3. **`/controllers/`** - At least one controller
4. **`/db/db.ts`** - Database connection (if using DB)
5. **`/schemas/`** - Database schemas (if using DB)

---

## Large Microservice Structure

**When to use:** Service with multiple domains, > 20 files, complex responsibilities

### Complete Structure with Modules

```
/services/{service-name}/
├── modules/                       # RECOMMENDED: Module-based organization
│   ├── agent_catalog/            # Domain module (e.g., "agent_catalog")
│   │   ├── controllers/
│   │   │   ├── aiAgentCreate.controller.ts
│   │   │   ├── aiAgentGet.controller.ts
│   │   │   └── aiAgentUpdate.controller.ts
│   │   │
│   │   ├── services/
│   │   │   └── ai_agent.service.ts
│   │   │
│   │   ├── repository/
│   │   │   └── ai_agent.repository.ts
│   │   │
│   │   ├── schemas/
│   │   │   └── schema.ts
│   │   │
│   │   ├── interfaces/
│   │   │   └── interfaces.ts
│   │   │
│   │   └── utils/
│   │       └── helpers.ts
│   │
│   ├── gcp_keys/                 # Another module (e.g., "gcp_keys")
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repository/
│   │   ├── schema/
│   │   └── interfaces/
│   │
│   └── oauth_feeder/             # Another module (e.g., "oauth_feeder")
│       ├── controllers/
│       ├── services/
│       ├── repository/
│       ├── schema/
│       └── interfaces/
│
├── common/                        # Shared resources across modules
│   ├── interfaces/
│   │   └── interface.ts
│   └── utils/
│       └── helpers.ts
│
├── db/                           # Shared database config (if needed)
│   ├── db.ts
│   ├── drizzle.config.ts
│   └── migrations/
│       └── 0001_initial.sql
│
├── encore.service.ts              # Main service config (with supportModules: true)
├── README.md                      # Main service documentation
└── ai_readme.md                   # AI-specific docs (optional)
```

### Alternative: Sub-Package Structure

```
/services/{service-name}/
├── sub_package_1/                 # Domain-specific package (e.g., "reporting")
│   ├── controllers/
│   │   ├── reportCreate.controller.ts
│   │   ├── reportCreate.controller.test.ts
│   │   ├── reportGet.controller.ts
│   │   └── reportGet.controller.test.ts
│   │
│   ├── services/
│   │   ├── report.service.ts
│   │   ├── report.service.test.ts
│   │   ├── export.service.ts
│   │   └── export.service.test.ts
│   │
│   ├── repositories/
│   │   ├── report.repository.ts
│   │   └── report.repository.test.ts
│   │
│   ├── db/
│   │   ├── db.ts
│   │   └── migrations/
│   │       └── 0001_initial.sql
│   │
│   ├── schemas/
│   │   └── report.schema.ts
│   │
│   ├── interfaces/
│   │   └── report.interfaces.ts
│   │
│   ├── utils/
│   │   └── report.utils.ts
│   │
│   └── README.md                  # Sub-package documentation
│
├── sub_package_2/                 # Another domain (e.g., "analytics")
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   ├── db/
│   ├── schemas/
│   ├── interfaces/
│   ├── utils/
│   └── README.md
│
├── shared/                        # Shared utilities for this service
│   ├── constants.ts
│   ├── types.ts
│   └── utils.ts
│
├── encore.service.ts              # Main service config
├── README.md                      # Main service documentation
└── ai_readme.md                   # AI-specific docs (optional)
```

### Module-Based Organization Rules

**Recommended approach for complex services:**

1. **Use `/modules/` directory** - Groups related functionality into logical modules
2. **Each module is self-contained** - Has its own controllers, services, repositories, schemas
3. **Module naming** - Use lowercase with underscores (e.g., `agent_catalog`, `gcp_keys`)
4. **API path structure** - `/service-name/module-name/endpoint-logic`
   - Example: `/ai-common-management/agent-catalog/ai-agent`
   - Example: `/ai-common-management/gcp-keys/gcp-key`
5. **Enable in config** - Set `supportModules: true` in `encore.service.ts`
6. **Shared resources** - Use `/common/` for cross-module utilities and interfaces
7. **Database per module** - Each module can have its own database or share via `/db/`

### Module Configuration in encore.service.ts

```typescript
export default new Service("ai_common_management", {
  middlewares: [errorMiddleware, metadataMiddleware],
});

registerService(appMeta(), () =>
  service_management._encoreServiceAdd(
    new GrouponServiceProvider("ai_common_management", {
      name: "AI Common Management",
      description: "Manages shared AI configs and onboarding.",

      // IMPORTANT: Enable module support
      supportModules: true,
    }).init()
  )
);
```

### Sub-Package Rules

1. **Each sub-package is self-contained** - It has its own controllers, services, repos, schemas
2. **Sub-packages can share** - Use `/shared/` for cross-package code
3. **No cross-package dependencies** - `sub_package_1` should NOT import from `sub_package_2` directly
4. **Each sub-package has README** - Document purpose and responsibilities

### When to Use Modules vs Sub-Packages

**Use `/modules/` when:**
- ✅ Service has multiple distinct domains (e.g., agent_catalog, gcp_keys, oauth)
- ✅ Each domain has its own API endpoints
- ✅ You want clear API path structure: `/service/module/endpoint`
- ✅ Service has > 30 files
- ✅ Different teams work on different modules
- ✅ You need logical separation with shared resources

**Use sub-packages when:**
- ✅ Service handles multiple business domains without module-specific APIs
- ✅ You need complete isolation between packages
- ✅ Different deployment strategies per package

**Don't split when:**
- ❌ Service is small (< 20 files)
- ❌ Domains are tightly coupled
- ❌ No clear boundaries

### Real-World Example: ai-common-management

```
/services/ai-common-management/
├── modules/
│   ├── agent_catalog/          # AI Agent management
│   │   └── controllers/
│   │       └── aiAgentInCatalogGet.controller.ts
│   │           # path: /ai-common-management/agent-catalog/ai-agent
│   │
│   ├── gcp_keys/              # GCP service account keys
│   │   └── controllers/
│   │       └── gcpKeyGetOwn.controller.ts
│   │           # path: /ai-common-management/gcp-keys/gcp-key
│   │
│   ├── n8N/                   # n8n integration
│   └── oauth_feeder/          # OAuth credential management
│
├── common/
│   └── interfaces/
│       └── interface.ts       # Shared across all modules
│
├── db/
│   ├── db.ts                  # Shared database config
│   └── migrations/
│
└── encore.service.ts          # supportModules: true
```

---

## Folder Purposes & Rules

### `/controllers/` - HTTP Endpoints

**Purpose:** Define API endpoints (public and private)

**Rules:**
- ✅ **Public controllers:** `{model}{Operation}.controller.ts`
- ✅ **Private controllers:** `_{model}{Operation}.controller.ts`
- ✅ Controllers delegate to services
- ✅ Tests in dedicated directory: `tests/controllers/{controller}.test.ts`
- ❌ No business logic
- ❌ No database access
- ❌ No complex transformations

**Example:**
```
controllers/
├── userCreate.controller.ts        # Public: POST /user
├── userGet.controller.ts           # Public: GET /user/:id
└── _internalUserSync.controller.ts # Private: Internal sync

tests/controllers/
├── userCreate.controller.test.ts
├── userGet.controller.test.ts
└── _internalUserSync.controller.test.ts
```

**File Template:**
```typescript
// userCreate.controller.ts
import { api } from "encore.dev/api";
import { authorization } from "~encore/clients";
import { userService } from "../services/user.service";
import type { UserCreateRequest, UserCreateResponse } from "../interfaces/user.interfaces";

/**
 * Create new user
 * Requires ADMIN role
 */
export const userCreate = api(
  {
    method: "POST",
    path: "/user",
    expose: true,
    auth: true,
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    await authorization.validatePermission({
      requiredRoles: ["ADMIN"],
    });

    return await userService.createUser(params);
  }
);
```

---

### `/services/` - Business Logic

**Purpose:** Implement business rules and orchestration

**Rules:**
- ✅ **Naming:** `{model}.service.ts`
- ✅ Contains business logic
- ✅ Orchestrates multiple repositories
- ✅ Validates business rules
- ✅ Calls external services
- ✅ Tests in dedicated directory: `tests/services/{service}.test.ts`
- ❌ No HTTP concerns (req/res)
- ❌ No direct database queries
- ❌ No SQL/Drizzle queries

**Example:**
```
services/
├── user.service.ts
└── notification.service.ts

tests/services/
├── user.service.test.ts
└── notification.service.test.ts
```

**File Template:**
```typescript
// user.service.ts
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { userRepository } from "../repositories/user.repository";
import type { User, NewUser } from "../schemas/user.schema";

class UserService {
  /**
   * Create new user with business validation
   */
  async createUser(data: NewUser): Promise<User> {
    // Business rule validation
    if (!this.#isValidEmail(data.email)) {
      throw APIError.invalidArgument("Invalid email format");
    }

    // Check business constraint
    const existing = await userRepository.findByEmail(data.email);
    if (existing) {
      throw APIError.alreadyExists("User with this email already exists");
    }

    // Business rule: Default role
    const userData = {
      ...data,
      roles: data.roles || ["USER"],
    };

    const user = await userRepository.create(userData);

    log.info("User created", { userId: user.id });
    return user;
  }

  #isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

export const userService = new UserService();
```

---

### `/repositories/` - Data Access

**Purpose:** Database access layer (ONLY place with queries)

**Rules:**
- ✅ **Naming:** `{model}.repository.ts`
- ✅ Uses Drizzle ORM
- ✅ Handles database errors
- ✅ Implements soft deletes
- ✅ Tests in dedicated directory: `tests/repositories/{repository}.test.ts`
- ❌ No business logic
- ❌ No external API calls
- ❌ No validation (except DB constraints)

**Example:**
```
repositories/
├── user.repository.ts
└── deal.repository.ts

tests/repositories/
├── user.repository.test.ts
└── deal.repository.test.ts
```

**File Template:**
```typescript
// user.repository.ts
import { eq, and, isNull } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { db } from "../db/db";
import { userTable, type User, type NewUser } from "../schemas/user.schema";

class UserRepository {
  async findById(id: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(userTable)
        .where(and(
          eq(userTable.id, id),
          isNull(userTable.deletedAt)
        ))
        .limit(1);

      return user || null;
    } catch (error) {
      log.error(error, "Database error in findById", { id });
      throw APIError.internal("Failed to fetch user");
    }
  }

  async create(data: NewUser): Promise<User> {
    try {
      const [user] = await db
        .insert(userTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      log.info("User created in DB", { userId: user.id });
      return user;
    } catch (error) {
      log.error(error, "Database error in create", { data });

      if (error instanceof Error && error.message.includes("unique constraint")) {
        throw APIError.alreadyExists("User already exists");
      }

      throw APIError.internal("Failed to create user");
    }
  }
}

export const userRepository = new UserRepository();
```

---

### `/db/` - Database Configuration

**Purpose:** Database connection and migration management

**Required Files:**
```
db/
├── db.ts                  # REQUIRED: Database connection
├── drizzle.config.ts      # REQUIRED: Drizzle Kit config
└── migrations/            # REQUIRED: Migration files
    ├── 0001_initial.sql
    ├── 0002_add_users.sql
    └── meta/
        └── _journal.json
```

**db.ts Template:**
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import * as schema from "../schemas/schema";

/**
 * Encore SQL Database instance
 */
const database = new SQLDatabase("service_name", {
  migrations: "./db/migrations",
});

/**
 * Drizzle ORM instance
 */
export const db = drizzle(database.connectionString, { schema });
```

**drizzle.config.ts Template:**
```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./schemas/*.schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
} satisfies Config;
```

---

### `/schemas/` - Database Schemas

**Purpose:** Define database tables and relations using Drizzle

**Rules:**
- ✅ **Naming:** `{model}.schema.ts`
- ✅ One file per table/model
- ✅ Relations in `relations.ts` (optional)
- ✅ Export types: `type User = typeof userTable.$inferSelect`
- ❌ No business logic
- ❌ No queries

**Example:**
```
schemas/
├── user.schema.ts
├── deal.schema.ts
├── merchant.schema.ts
└── relations.ts        # Optional: Drizzle relations
```

**File Template:**
```typescript
// user.schema.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const userTable = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    googleId: text("google_id").unique(),
    roles: jsonb("roles").$type<string[]>().default([]),
    isActive: boolean("is_active").default(true).notNull(),

    // Standard timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    emailIdx: index("user_email_idx").on(table.email),
    deletedAtIdx: index("user_deleted_at_idx").on(table.deletedAt),
  })
);

// Type exports
export type User = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;
```

---

### `/interfaces/` - Type Definitions

**Purpose:** DTOs, request/response types, domain interfaces

**Rules:**
- ✅ **Naming:** `{model}.interfaces.ts` or `interfaces.ts`
- ✅ API interfaces: `{Model}{Operation}{Request|Response}`
- ✅ Domain types
- ❌ No implementation
- ❌ No business logic

**Example:**
```
interfaces/
├── user.interfaces.ts          # User-specific types
├── deal.interfaces.ts          # Deal-specific types
└── interfaces.ts               # Universal types
```

**File Template:**
```typescript
// user.interfaces.ts
import type { IsEmail } from "encore.dev/validate";
import type { User } from "../schemas/user.schema";

// API Request/Response
export interface UserCreateRequest {
  name: string;
  email: string & IsEmail;
  roles?: string[];
}

export interface UserCreateResponse {
  user: User;
}

export interface UserGetRequest {
  id: string;
}

export interface UserGetResponse {
  user: User;
}

// Domain types
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}
```

---

### `/utils/` - Utility Functions

**Purpose:** Pure, reusable helper functions

**Rules:**
- ✅ **Naming:** `{purpose}.utils.ts` or `utils.ts`
- ✅ Pure functions (no side effects)
- ✅ Reusable across the service
- ✅ Tests in dedicated directory: `tests/utils/{utils}.test.ts`
- ❌ No business logic
- ❌ No database access
- ❌ No external API calls

**Example:**
```
utils/
├── validation.utils.ts
├── formatting.utils.ts
└── utils.ts                    # Generic utilities

tests/utils/
├── validation.utils.test.ts
└── formatting.utils.test.ts
```

**File Template:**
```typescript
// validation.utils.ts

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate phone number (US format)
 */
export function isValidPhoneNumber(phone: string): boolean {
  return /^\+?1?\d{10,14}$/.test(phone);
}

/**
 * Validate UUID format
 */
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
```

---

### `/pubsub/` - Pub/Sub (Optional)

**Purpose:** Event subscribers and publishers

**Rules:**
- ✅ **Subscribers:** `_{event}.sub.ts`
- ✅ **Publishers:** `_{event}.pub.ts`
- ✅ Always start with underscore (internal)
- ✅ Tests in dedicated directory: `tests/pubsub/{file}.test.ts`

**Example:**
```
pubsub/
├── _createUser.sub.ts          # Subscription
└── _emitNewUser.pub.ts         # Publisher

tests/pubsub/
├── _createUser.sub.test.ts
└── _emitNewUser.pub.test.ts
```

---

### `/topics/` - Topic Definitions (Optional)

**Purpose:** Define Pub/Sub topics

**Example:**
```
topics/
├── userEvents.topic.ts
└── dealEvents.topic.ts
```

---

### `/crons/` - Scheduled Jobs (Optional)

**Purpose:** Cron job definitions

**Rules:**
- ✅ **Naming:** `{jobName}.cron.ts`
- ✅ Tests in dedicated directory: `tests/crons/{cron}.test.ts`

**Example:**
```
crons/
├── dailyCleanup.cron.ts
└── hourlySync.cron.ts

tests/crons/
├── dailyCleanup.cron.test.ts
└── hourlySync.cron.test.ts
```

---

### `/buckets/` - Object Storage (Optional)

**Purpose:** Object storage bucket definitions

**Example:**
```
buckets/
├── userAvatars.bucket.ts
└── dealImages.bucket.ts
```

---

### `/middleware/` - Custom Middleware (Optional)

**Purpose:** Service-specific middleware

**Example:**
```
middleware/
├── auth.middleware.ts
├── logging.middleware.ts
└── rate-limit.middleware.ts
```

---

## Common Libraries

### Encore Core Libraries: `/apps/encore-ts/libs/core/`

**Purpose:** Shared utilities following Encore principles

**Structure:**
```
libs/core/
├── databases/
│   ├── redis/
│   │   └── redis.service.ts
│   ├── mongo/
│   │   ├── mongo_core.service.ts
│   │   └── mongo_orm.service.ts
│   └── drizzle/
│
├── middleware/
│   ├── error.middleware.ts
│   └── auth.middleware.ts
│
├── runtime_utils/
│   ├── shutdown_handler.ts
│   └── startup_handler.ts
│
├── types/
│   └── common.types.ts
│
└── utils/
    ├── validation.utils.ts
    └── formatting.utils.ts
```

**Rules:**
- ✅ Must follow Encore principles
- ✅ Must be framework-agnostic
- ✅ Must be well-documented
- ✅ Must have tests
- ❌ No service-specific logic
- ❌ No hardcoded values

---

## File Organization Best Practices

### 1. Dedicated Test Directory

**✅ CORRECT:**
```
services/
├── user.service.ts
└── notification.service.ts

tests/services/
├── user.service.test.ts
└── notification.service.test.ts
```

**❌ WRONG:**
```
services/
├── user.service.ts
├── user.service.test.ts       # Tests should not be colocated
├── notification.service.ts
└── notification.service.test.ts
```

**Why?** Dedicated test directory with mirrored structure = clear separation of concerns, easier to exclude from production builds, consistent pattern across all services

---

### 2. Logical Grouping

Group related files together:

```
# Good grouping
services/
├── user.service.ts           # User operations
├── user.service.test.ts
├── user-notification.service.ts  # User notifications
├── user-notification.service.test.ts
├── user-profile.service.ts   # User profile
└── user-profile.service.test.ts
```

---

### 3. README Files

Every service and sub-package needs a README:

```markdown
# User Service

## Purpose
Manages user accounts, authentication, and profiles.

## Responsibilities
- User CRUD operations
- Profile management
- Role assignment
- Account activation/deactivation

## API Endpoints
### Public
- POST /user - Create user (ADMIN only)
- GET /user/:id - Get user profile
- PUT /user/:id - Update user
- DELETE /user/:id - Soft delete user

### Private
- POST /internal/user/sync - Sync users from external system

## Dependencies
- PostgreSQL (user data)
- Redis (session cache)
- AI Gateway (profile analysis)

## Environment Variables
- None (uses Encore secrets)

## Local Development
\`\`\`bash
cd services/user
encore run
\`\`\`

## Tests
\`\`\`bash
pnpm encore:test
\`\`\`
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Mixed Concerns

```
# ❌ WRONG - Business logic in controller
controllers/
└── userCreate.controller.ts    # Contains validation + DB access

# ✅ CORRECT - Separated concerns
controllers/
└── userCreate.controller.ts    # HTTP only
services/
└── user.service.ts             # Business logic
repositories/
└── user.repository.ts          # Database access
```

---

### ❌ Anti-Pattern 2: Colocated Test Files

```
# ❌ WRONG - Tests colocated with source
services/
├── user.service.ts
├── user.service.test.ts       # Test file next to source
├── notification.service.ts
└── notification.service.test.ts

controllers/
├── userCreate.controller.ts
└── userCreate.controller.test.ts  # Test file next to source

# ✅ CORRECT - Tests in dedicated directory
services/
├── user.service.ts
└── notification.service.ts

tests/
├── services/
│   ├── user.service.test.ts
│   └── notification.service.test.ts
└── controllers/
    └── userCreate.controller.test.ts
```

**Why?** Dedicated test directories with mirrored structure provide clear separation, easier exclusion from production builds, and consistent patterns across all services.

---

### ❌ Anti-Pattern 3: Generic Folders

```
# ❌ WRONG
helpers/
utils/
tools/
lib/
common/
shared/     # At service level

# ✅ CORRECT
utils/      # Only this, specific purpose files
```

---

### ❌ Anti-Pattern 4: Deep Nesting

```
# ❌ WRONG - Too deep
services/
└── user/
    └── operations/
        └── crud/
            └── create/
                └── user-create.service.ts

# ✅ CORRECT - Flat structure
services/
└── user.service.ts
```

---

### ❌ Anti-Pattern 5: Mixing Public and Private

```
# ❌ WRONG - Mixed in same folder
controllers/
├── userCreate.controller.ts        # Public
├── internalUserSync.controller.ts  # Private (missing underscore!)
└── userGet.controller.ts           # Public

# ✅ CORRECT - Clear naming
controllers/
├── userCreate.controller.ts        # Public
├── _internalUserSync.controller.ts # Private (with underscore)
└── userGet.controller.ts           # Public
```

---

## Migration Guide

### From Unstructured to Structured

**Step 1: Identify file types**
```bash
# List all TypeScript files
find . -name "*.ts" -type f
```

**Step 2: Create folder structure**
```bash
mkdir -p controllers services repositories db schemas interfaces utils
```

**Step 3: Move files**
```bash
# Move controllers
mv *Controller.ts controllers/
mv *controller.ts controllers/

# Move services
mv *Service.ts services/
mv *service.ts services/

# Move repositories
mv *Repository.ts repositories/
mv *repository.ts repositories/
```

**Step 4: Fix imports**
```typescript
// Old
import { userService } from "./userService";

// New
import { userService } from "../services/user.service";
```

**Step 5: Rename files to conventions**
```bash
# Controllers
mv UserCreateController.ts userCreate.controller.ts
mv user-create-controller.ts userCreate.controller.ts

# Services
mv UserService.ts user.service.ts
mv user_service.ts user.service.ts

# Private controllers
mv internalUserSync.controller.ts _internalUserSync.controller.ts
```

---

## Summary

### Structure Checklist

Before committing, verify:

- [ ] All controllers in `/controllers/` (or `/modules/{module}/controllers/`)
- [ ] All services in `/services/` (or `/modules/{module}/services/`)
- [ ] All repositories in `/repositories/` (or `/modules/{module}/repository/`)
- [ ] All schemas in `/schemas/` (or `/modules/{module}/schemas/`)
- [ ] All interfaces in `/interfaces/` (or `/modules/{module}/interfaces/`)
- [ ] Tests in dedicated `/tests/` directory, mirroring source structure
- [ ] Private files start with `_`
- [ ] README.md exists
- [ ] encore.service.ts exists
- [ ] If using modules: `supportModules: true` in service config
- [ ] If using modules: API paths follow `/service-name/module-name/endpoint-logic`
- [ ] No business logic in controllers
- [ ] No database access in services
- [ ] No deep folder nesting (max 2 levels)

### Quick Reference

#### Small Service Structure

| Content | Location | Example |
|---------|----------|---------|
| HTTP endpoints | `/controllers/` | `userCreate.controller.ts` |
| Business logic | `/services/` | `user.service.ts` |
| Database access | `/repositories/` | `user.repository.ts` |
| Database config | `/db/` | `db.ts`, `migrations/` |
| Database schemas | `/schemas/` | `user.schema.ts` |
| Type definitions | `/interfaces/` | `user.interfaces.ts` |
| Utilities | `/utils/` | `validation.utils.ts` |
| Tests | `/tests/` (mirrors source) | `tests/services/user.service.test.ts` |
| Pub/Sub | `/pubsub/` | `_createUser.sub.ts` |
| Cron jobs | `/crons/` | `dailyCleanup.cron.ts` |
| Object storage | `/buckets/` | `userAvatars.bucket.ts` |
| Config | Root | `encore.service.ts` |
| Documentation | Root | `README.md` |

#### Large Service with Modules

| Content | Location | Example |
|---------|----------|---------|
| Module controllers | `/modules/{module}/controllers/` | `aiAgentGet.controller.ts` |
| Module services | `/modules/{module}/services/` | `ai_agent.service.ts` |
| Module repositories | `/modules/{module}/repository/` | `ai_agent.repository.ts` |
| Module schemas | `/modules/{module}/schemas/` | `schema.ts` |
| Module interfaces | `/modules/{module}/interfaces/` | `interfaces.ts` |
| Shared interfaces | `/common/interfaces/` | `interface.ts` |
| Shared utilities | `/common/utils/` | `helpers.ts` |
| Database config | `/db/` | `db.ts`, `migrations/` |
| Config | Root | `encore.service.ts` |
| Documentation | Root | `README.md` |

#### API Path Patterns

| Service Type | Path Pattern | Example |
|--------------|--------------|---------|
| Standard Service | `/service-name/endpoint-logic` | `/user/core/me` |
| Module-Based Service | `/service-name/module-name/endpoint-logic` | `/ai-common-management/agent-catalog/ai-agent` |
| Module-Based (GCP) | `/service-name/module-name/endpoint-logic` | `/ai-common-management/gcp-keys/gcp-key` |

---

**Remember: Structure is not bureaucracy—it's clarity. A well-organized codebase is a joy to work with. A chaotic one is a nightmare to maintain.**
