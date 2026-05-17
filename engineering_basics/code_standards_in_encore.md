# Code Standards in Encore

## ⚠️ Warning: These Standards Are Non-Negotiable

**This document defines the absolute boundaries of acceptable code in Groupon's Stack 2.0 / Encore ecosystem.** Violating these standards is not a matter of style preference—it's a matter of professional competence.

**Stack 2.0 is built on discipline.** We protect the quality, speed, and maintainability of our platform aggressively.

---

## 🔴 The Stack 2.0 Manifesto

> **"Time to stop fixing legacy, and start building our legacy."**

> **We are not here to repeat how things have been done for the past ten years, nor to hide behind endless corporate rules. Those are empty excuses without real outcomes or justification. Our focus is on building, delivering, and challenging the status quo to create meaningful results.**

This is our north star. Every decision, every line of code, every architecture choice must serve this purpose.

**Stack 2.0 Goals:**
- 🚀 **2-hour microservice creation** - From idea to production
- ⚡ **10-minute production hotfixes** - Fix and deploy in minutes
- 🎯 **95% TypeScript** - One language, one way
- 🤖 **AI-first** - Built for intelligent automation
- 🌿 **Branch-as-environment** - Every branch = isolated staging
- 📊 **Infrastructure as Code** - Zero manual provisioning

---

## 1. Single Responsibility Per Layer (ABSOLUTE RULE)

This is **THE MOST IMPORTANT** rule in our codebase. Break this, and you break everything.

### Controller Layer

**✅ ALLOWED:**
- Receive HTTP requests
- Validate request structure (TypeScript types, Encore validators)
- Check authorization (`authorization.validatePermission()`)
- Call service layer methods
- Return HTTP responses
- Throw `APIError` for request-level errors

**❌ FORBIDDEN:**
- Database queries (NEVER!)
- Business logic (ZERO!)
- External API calls (NO!)
- Data transformation beyond simple mapping
- Complex calculations
- Loops over data
- Any use of repository classes

**Example - CORRECT:**

```typescript
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    // ✅ Authorization check
    await authorization.validatePermission({
      requiredRoles: [UserRole.ADMIN]
    });

    // ✅ Delegate to service
    return await userService.createUser(params);
  }
);
```

**Example - WRONG (Will be rejected in code review):**

```typescript
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    // ❌ WRONG: Database query in controller
    const existing = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, params.email));

    // ❌ WRONG: Business logic in controller
    if (existing.length > 0) {
      throw APIError.alreadyExists("User exists");
    }

    // ❌ WRONG: Direct database insert in controller
    const [user] = await db
      .insert(userTable)
      .values(params)
      .returning();

    return { user };
  }
);

// THIS CODE WILL BE REJECTED. DO NOT WRITE THIS.
```

---

### Service Layer

**✅ ALLOWED:**
- Business logic and rules
- Orchestration of multiple operations
- Service-to-service calls (`~encore/clients`)
- Data transformation and mapping
- Permission checks (business-level, not HTTP-level)
- External API calls
- Pub/Sub publishing
- Calling repository methods

**❌ FORBIDDEN:**
- Direct database queries (use repositories!)
- HTTP request/response handling
- Reading HTTP headers
- Parsing request bodies
- Setting HTTP status codes

**Example - CORRECT:**

```typescript
class UserService {
  async createUser(params: UserCreateRequest): Promise<UserCreateResponse> {
    // ✅ Business validation
    if (!this.#isValidEmail(params.email)) {
      throw APIError.invalidArgument("Invalid email format");
    }

    // ✅ Check business rule
    const existing = await userRepository.findByEmail(params.email);
    if (existing) {
      throw APIError.alreadyExists("User with this email already exists");
    }

    // ✅ Orchestrate operations
    const user = await userRepository.create(params);

    // ✅ Call other service
    await auditlog._create({
      action: "CREATE",
      entity: "USER",
      entityId: user.id,
      data: { email: user.email },
    });

    // ✅ Publish event
    await userCreatedTopic.publish({
      userId: user.id,
      email: user.email,
    });

    return { user };
  }

  // ✅ Private helper method
  #isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
```

**Example - WRONG:**

```typescript
class UserService {
  async createUser(params: UserCreateRequest): Promise<UserCreateResponse> {
    // ❌ WRONG: Direct database query in service
    const [user] = await db
      .insert(userTable)
      .values(params)
      .returning();

    return { user };
  }
}

// THIS IS WRONG. USE REPOSITORY!
```

---

### Repository Layer

**✅ ALLOWED:**
- Database queries (Drizzle ORM ONLY)
- Transaction management
- Data persistence operations (CRUD)
- Complex SQL queries
- Batch operations
- Database error handling

**❌ FORBIDDEN:**
- Business logic (ZERO!)
- Business rule validation
- Calling other services
- Publishing events
- External API calls
- Complex data transformation

**Example - CORRECT:**

```typescript
class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(userTable)
        .where(and(
          eq(userTable.email, email),
          isNull(userTable.deletedAt)
        ))
        .limit(1);

      return user || null;
    } catch (error) {
      log.error(error, "Database error in findByEmail", { email });
      throw APIError.internal("Failed to fetch user");
    }
  }
}
```

**Example - WRONG:**

```typescript
class UserRepository {
  async create(data: NewUser): Promise<User> {
    // ❌ WRONG: Business validation in repository
    if (!data.email.includes("@")) {
      throw APIError.invalidArgument("Invalid email");
    }

    // ❌ WRONG: Calling another service
    await auditlog._create({...});

    const [user] = await db.insert(userTable).values(data).returning();
    return user;
  }
}

// THIS IS WRONG. REPOSITORIES ONLY DO DATABASE OPERATIONS!
```

---

## 2. Interfaces Everywhere (MANDATORY)

**RULE:** Every API request and response must be a **named, exported interface**. No exceptions.

### ✅ CORRECT:

```typescript
export interface UserCreateRequest {
  name: string;
  email: string & IsEmail;
  roles?: UserRole[];
}

export interface UserCreateResponse {
  user: User;
  message?: string;
}

export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return await userService.createUser(params);
  }
);
```

### ❌ WRONG:

```typescript
// ❌ Anonymous type
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: { name: string; email: string }): Promise<{ user: any }> => {
    return await userService.createUser(params);
  }
);

// THIS WILL BE REJECTED IN CODE REVIEW
```

### Interface Naming Convention

**Format:** `{Model}{Operation}{Request/Response}`

**Examples:**
- ✅ `UserCreateRequest`, `UserCreateResponse`
- ✅ `DealUpdateRequest`, `DealUpdateResponse`
- ✅ `OrderGetRequest`, `OrderGetResponse`
- ❌ `CreateUserReq`, `UserResp`
- ❌ `UserData`, `UserInfo`

---

## 3. Validation: Use Encore or Zod, NEVER Manual

**RULE:** All validation must be declarative using Encore validators or Zod schemas. Manual validation in services is **FORBIDDEN**.

### ✅ CORRECT - Encore Validators:

```typescript
import type { IsEmail, MinLen, MaxLen, Min, Max } from "encore.dev/validate";

export interface UserCreateRequest {
  name: string & MinLen<1> & MaxLen<100>;
  email: string & IsEmail;
  age: number & Min<18> & Max<120>;
}
```

### ✅ CORRECT - Zod Validation:

```typescript
import { z } from "zod";

export const UserCreateRequestValidator = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
});

export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    const validation = UserCreateRequestValidator.safeParse(params);

    if (!validation.success) {
      throw new APIError(ErrCode.InvalidArgument, "Validation failed")
        .withDetails({ errors: validation.error.errors });
    }

    return await userService.createUser(validation.data);
  }
);
```

### ❌ WRONG - Manual Validation:

```typescript
// ❌ NEVER DO THIS
async createUser(params: UserCreateRequest): Promise<UserCreateResponse> {
  if (!params.name) {
    throw APIError.invalidArgument("Name is required");
  }

  if (!params.email) {
    throw APIError.invalidArgument("Email is required");
  }

  if (params.name.length > 100) {
    throw APIError.invalidArgument("Name too long");
  }

  // ... more manual validation
}

// THIS IS FORBIDDEN. USE VALIDATORS!
```

---

## 4. Error Handling Standards

### Use APIError, Nothing Else

**✅ CORRECT:**

```typescript
import { APIError } from "encore.dev/api";

// Predefined error types
throw APIError.notFound("User not found");
throw APIError.invalidArgument("Invalid email format");
throw APIError.permissionDenied("Insufficient permissions");
throw APIError.alreadyExists("User already exists");
throw APIError.internal("Database connection failed");

// With details
throw new APIError(ErrCode.InvalidArgument, "Validation failed")
  .withDetails({
    field: "email",
    reason: "Invalid format",
  });
```

### ❌ WRONG:

```typescript
// ❌ Generic Error
throw new Error("User not found");

// ❌ HTTP-specific error in service
throw { statusCode: 404, message: "Not found" };

// ❌ Silent failure
if (!user) {
  return null; // DON'T DO THIS!
}
```

---

## 5. Public vs Private APIs (STRICT RULES)

### Public APIs (External Access)

**Requirements:**
- ✅ **MUST** use `expose: true`
- ✅ **MUST** use `auth: true`
- ✅ **MUST** check authorization for sensitive operations
- ✅ File name: `{operation}.controller.ts`
- ✅ Endpoint name: No underscore prefix

**Example:**

```typescript
// File: userCreate.controller.ts
export const userCreate = api(
  {
    method: "POST",
    path: "/user",
    expose: true,   // ✅ REQUIRED
    auth: true,     // ✅ REQUIRED
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    await authorization.validatePermission({
      requiredRoles: [UserRole.ADMIN]
    });
    return await userService.createUser(params);
  }
);
```

### Private APIs (Internal Only)

**Requirements:**
- ✅ **MUST** use `expose: false`
- ✅ **MUST** use `auth: false` (typically)
- ✅ **MUST** prefix filename with `_`
- ✅ **MUST** prefix endpoint name with `_`
- ✅ File name: `_{operation}.controller.ts`

**Example:**

```typescript
// File: _internalUserCreate.controller.ts
export const _internalUserCreate = api(
  {
    method: "POST",
    path: "/user/internal/create",
    expose: false,  // ✅ REQUIRED
    auth: false,    // ✅ TYPICAL
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return await userService.createUser(params);
  }
);
```

### ❌ WRONG - Common Mistakes:

```typescript
// ❌ Public API without auth
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: false },
  // ... SECURITY VULNERABILITY!
);

// ❌ Private API exposed publicly
export const _internalUserCreate = api(
  { method: "POST", path: "/user/internal", expose: true, auth: false },
  // ... THIS DEFEATS THE PURPOSE!
);

// ❌ Private API without underscore prefix
export const internalUserCreate = api(
  { method: "POST", path: "/user/internal", expose: false },
  // ... WRONG NAMING!
);
```

---

## 6. Naming Conventions (MANDATORY)

### Files

| Type | Format | Example |
|------|--------|---------|
| Controller (public) | `camelCase.controller.ts` | `userCreate.controller.ts` |
| Controller (private) | `_camelCase.controller.ts` | `_internalUserCreate.controller.ts` |
| Service | `snake_case.service.ts` | `user.service.ts` |
| Repository | `snake_case.repository.ts` | `user.repository.ts` |
| Interface | `interfaces.ts` | `interfaces.ts` |
| Schema | `schema.ts` | `schema.ts` |
| Test | `{filename}.test.ts` | `user.service.test.ts` |

### Code Elements

| Type | Format | Example |
|------|--------|---------|
| Interface/Type | `PascalCase` | `UserCreateRequest` |
| Class | `PascalCase` | `UserService` |
| Function/Variable | `camelCase` | `createUser`, `userId` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_PAGE_SIZE` |
| Private field | `#camelCase` | `#cache`, `#client` |
| Database table | `snake_case` singular | `user`, `user_profile` |
| Database column | `snake_case` | `created_at`, `user_id` |

### ❌ WRONG - Common Mistakes:

```typescript
// ❌ Wrong interface naming
interface CreateUserRequest {}  // Should be: UserCreateRequest
interface UserReq {}            // Should be: UserCreateRequest

// ❌ Wrong file naming
user_service.ts                 // Should be: user.service.ts
UserCreate.controller.ts        // Should be: userCreate.controller.ts

// ❌ Wrong variable naming
const UserId = "123";           // Should be: userId
const MAX_page_size = 100;      // Should be: MAX_PAGE_SIZE

// ❌ Wrong database naming
userProfile                     // Should be: user_profile
createdAt                       // Should be: created_at
```

---

## 7. Database Standards (ABSOLUTE RULES)

### Schema Requirements

**Every table MUST have:**

```typescript
export const tableName = pgTable("table_name", {
  // ✅ REQUIRED: UUID primary key
  id: uuid("id").primaryKey().defaultRandom(),

  // ✅ REQUIRED: Standard timestamps
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),

  // Your fields here...
});
```

### ❌ FORBIDDEN:

```typescript
// ❌ Auto-increment ID
id: serial("id").primaryKey(),

// ❌ Missing timestamps
// No createdAt, updatedAt, deletedAt

// ❌ camelCase columns
userName: text("userName"), // Should be: user_name

// ❌ No soft delete column
// Missing deletedAt
```

### Repository Requirements

**Every repository method MUST:**
- Use Drizzle ORM (no raw SQL strings)
- Handle soft deletes correctly
- Include proper error handling
- Log all operations
- Return typed results

```typescript
// ✅ CORRECT
async findById(id: string, includeDeleted = false): Promise<User | null> {
  try {
    const conditions = includeDeleted
      ? [eq(userTable.id, id)]
      : [eq(userTable.id, id), isNull(userTable.deletedAt)];

    const [user] = await db
      .select()
      .from(userTable)
      .where(and(...conditions))
      .limit(1);

    return user || null;
  } catch (error) {
    log.error(error, "Database error in findById", { id });
    throw APIError.internal("Failed to fetch user");
  }
}
```

---

## 8. Security Standards (NON-NEGOTIABLE)

### Authentication & Authorization

**RULE 1:** All public APIs **MUST** have `auth: true`

```typescript
// ✅ CORRECT
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    // ...
  }
);
```

**RULE 2:** Sensitive operations **MUST** check authorization

```typescript
// ✅ CORRECT
export const userDelete = api(
  { method: "DELETE", path: "/user/:id", expose: true, auth: true },
  async (params: { id: string }): Promise<void> => {
    // ✅ REQUIRED authorization check
    await authorization.validatePermission({
      requiredRoles: [UserRole.ADMIN, UserRole.USER_ADMIN],
    });

    await userService.softDeleteUser(params.id);
  }
);
```

**RULE 3:** NEVER log sensitive data

```typescript
// ❌ WRONG
log.info("User created", {
  password: params.password,  // NEVER LOG PASSWORDS!
  apiKey: params.apiKey,      // NEVER LOG KEYS!
});

// ✅ CORRECT
log.info("User created", {
  userId: user.id,
  email: user.email,  // Public info only
});
```

---

## 9. Logging Standards

### What to Log

**✅ DO log:**
- Important operations (create, update, delete)
- Authorization checks
- Service-to-service calls
- Errors with context
- Performance metrics

**❌ DON'T log:**
- Passwords, tokens, API keys
- Personal Identifiable Information (PII) unnecessarily
- Credit card numbers
- Social security numbers
- Medical information

### Logging Format

```typescript
import log from "encore.dev/log";

// ✅ CORRECT: Structured logging with context
log.info("User created", {
  userId: user.id,
  email: user.email,
  operation: "create",
  duration: Date.now() - startTime,
});

// ✅ CORRECT: Error logging with context
log.error(error, "Failed to create user", { email: params.email });

// ❌ WRONG: String concatenation
log.info("User " + user.id + " created");

// ❌ WRONG: Missing context
log.error("Error occurred");
```

---

## 10. Testing Standards (MANDATORY)

### Test Coverage Requirements

| Layer | Minimum Coverage | Target Coverage |
|-------|------------------|-----------------|
| Services | 80%              | 90%             |
| Repositories | 70%              | 80%             |
| Controllers | 70%              | 80%             |
| Utilities | 0%               | 10% (Optional) | 

### Test Organization

**RULE:** Tests **MUST** be in dedicated test directories that mirror source structure

```
✅ CORRECT:
/services/user/
  ├── services/
  │   └── user.service.ts
  └── tests/
      └── services/
          └── user.service.test.ts

❌ WRONG:
/services/user/
  └── services/
      ├── user.service.ts
      └── user.service.test.ts    # Tests should not be colocated
```

### Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("UserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createUser", () => {
    it("should create user successfully", async () => {
      // Arrange
      const mockUser = { id: "123", email: "test@example.com" };
      vi.mocked(userRepository.create).mockResolvedValue(mockUser);

      // Act
      const result = await userService.createUser({ email: "test@example.com" });

      // Assert
      expect(result.user).toEqual(mockUser);
      expect(userRepository.create).toHaveBeenCalledWith({ email: "test@example.com" });
    });

    it("should throw error if email exists", async () => {
      // ...
    });
  });
});
```

---

## 11. Code Review Checklist

Before submitting code, verify:

### Architecture
- [ ] Controllers only validate and delegate
- [ ] Services contain business logic
- [ ] Repositories only do database operations
- [ ] No database queries in services
- [ ] No business logic in repositories

### APIs
- [ ] Public APIs use `expose: true, auth: true`
- [ ] Private APIs use `expose: false` and `_` prefix
- [ ] Authorization checks implemented
- [ ] All inputs validated

### Types
- [ ] All requests/responses are named interfaces
- [ ] No `any` types
- [ ] Proper TypeScript types throughout

### Naming
- [ ] Files follow naming conventions
- [ ] Variables use camelCase
- [ ] Constants use UPPER_SNAKE_CASE
- [ ] Database columns use snake_case

### Database
- [ ] UUID primary keys
- [ ] Standard timestamps (created_at, updated_at, deleted_at)
- [ ] Soft delete implemented
- [ ] Proper indexes defined

### Security
- [ ] No secrets in code
- [ ] No sensitive data logged
- [ ] Authorization checks in place
- [ ] Input validation implemented

### Testing
- [ ] Tests in dedicated /tests directory, mirroring source structure
- [ ] Minimum coverage met
- [ ] Tests pass consistently

### Documentation
- [ ] JSDoc comments for public methods
- [ ] Clear error messages
- [ ] README updated if needed

---

## 12. Consequences of Violations

![SpaceCat](../.gitbook/assets/ChatGPT_10_03_26-min.png)

This is not about one bad commit.
This is about a consistent lifestyle choice of writing code that screams “I did not read anything ever.”

We don’t punish mistakes.
We do punish a visible trend of weaponized laziness in a shared codebase.

### Level 1 – Localized Disaster

 - You had a bad day. Or week. Or sprint. It happens.

 - Your PR is rejected with extreme prejudice in code review.

 - You rewrite the code so it matches the standards and basic human logic.

 - You get a short, uncomfortably honest explanation of what you broke and what the standard actually is.

 - After this point, we assume you can read.



###  Level 2 – Trend Confirmed

 - We start seeing a pattern: same problems, same style, same “it works on my machine” energy.

 - Mandatory 1:1 with your tech lead: half coaching, half forensic interview.

 - Deep dive into your past commits to see how much damage we’ve already merged.

 - Your future PRs get VIP treatment at the Pain Airport: long queues, no fast track, full-body scanner for every “small change”.

 - You’re on the radar now.


###  Level 3 – Official Menace to the Codebase

 - At this point it’s clear: this is not an accident, this is your brand.

 - You are banned from the Encore codebase and put into read-only zoo exhibit mode.

 - Your name is added to the Hall of Shame, next to legends like “Hardcoded password in prod” and “Deleted the DB to ‘start fresh’”.

 - You are publicly whipped in team channels via memes, screenshots, and lovingly curated examples of “what not to do”.

 - You may be reassigned to projects that smell like 2012 and XML and never-ending “temporary” hotfixes.

 - You’re still employed. Just… less trusted around things that matter.


###  When It’s Not Funny Anymore – Not a joke anymore

- If the pattern keeps going even after all of this, it stops being entertainment and becomes a serious performance issue.

- Your coding habits directly affect your performance review, responsibilities, and growth.

- We escalate through the normal management + HR pipeline: formal feedback, improvement plans, documented expectations.

- In truly extreme, heroic cases of refusing to care, this can end in termination – not for one bad PR, but for a long-term “I don’t give a damn” attitude.

- We are serious about these standards. They exist to protect our platform, our users, and our team.


---

## 13. Exception Process

**Can these rules be broken?** Only in extreme circumstances.

### Process for Exception
1. Document the exceptional case
2. Explain why the standard doesn't apply
3. Propose alternative approach
4. Get approval from:
   - Tech Lead
   - Architecture Review Board
   - Security Team (if security-related)

### Example Valid Exception
> "We need to call an external API directly in a controller because it's a webhook
> handler that needs to respond within 3 seconds, and adding service layer would
> exceed latency requirements."

### Example Invalid Exception
> "I don't like repositories, they're too much boilerplate."

---

## 14. Continuous Improvement

These standards will evolve. When you discover:
- A better pattern
- A common pitfall
- An unclear rule
- A missing standard

**Create a PR to update this document.**

But remember: **standards exist for a reason**. Don't propose changes just because something is difficult. Propose changes when something is demonstrably wrong.

---

## Summary: The Non-Negotiable Rules

1. ✅ **Layered architecture:** Controller → Service → Repository
2. ✅ **No database queries** outside repositories
3. ✅ **No business logic** in controllers or repositories
4. ✅ **Named interfaces** for all requests/responses
5. ✅ **Validation** using Encore validators or Zod
6. ✅ **Public APIs** must have `auth: true`
7. ✅ **Private APIs** must have `_` prefix and `expose: false`
8. ✅ **Naming conventions** must be followed exactly
9. ✅ **Tests** must be in dedicated test directories mirroring source structure
10. ✅ **Security** standards must be followed

**Break these rules, and your code will be rejected. Repeatedly break these rules, and you will be removed from the project.**

---

## Stack 2.0 Integration

### Temporal Workflows

For complex, long-running business processes, use Temporal:

**When to use Temporal:**
- ✅ Multi-step processes (order processing, lead enrichment)
- ✅ Long-running operations (hours, days, weeks)
- ✅ Requires state persistence and automatic retries
- ✅ Needs compensation/rollback (Saga pattern)
- ✅ AI/ML pipelines with evaluation loops

**See:** [Temporal Workflow Patterns](temporal_workflow_patterns.md)

### GitHub & CI/CD

**Mandatory GitHub Rules:**

**Branch Naming:** `<Tribe>/<Initiative>/<Ticket>-description`
```bash
✅ b2b-tribe/AIDG-100/AIDG-223-fix-media-pipeline
❌ fix-bug
```

**Commit Messages:** `[TICKET] Description`
```bash
✅ [AIDG-223] Fix media pipeline for PNG images
❌ Fixed bug
```

**Branch-as-Environment:**
- Every branch = isolated staging environment
- Test before merge
- Automatic deployment on push

**See:** [GitHub Workflows & Branch-as-Environment](../monorepo-and-config/github-workflows-and-branching.md)

### AI Development

All AI integration must use the **AI Gateway service**:

```typescript
import { ai_gateways } from "~encore/clients";

const response = await ai_gateways.openAI({
  model: "gpt-4o",
  messages: [{ role: "user", content: "..." }],
});
```

**Never create direct OpenAI connections.**

**See:** [AI Integration Guide](../core-libraries-and-functions/openai-integration-guide.md)

---

## Resources

### Documentation

- **Stack 2.0 Overview:** `/_documentation/README.md`
- **Detailed Standards:** `/_documentation/engineering_basics/`
- **Cursor Rules:** `.cursor/rules/encore-ts-standards.mdc`
- **Example Services:** `/apps/encore-ts/services/_core_system/`

### Support

- **GChat Channels:**
  -  Unified for everything [Encore Hub](https://chat.google.com/room/AAQAQEAUoTo?cls=7)
  - Open for all questions with
    - `encore-development` - Encore-specific questions
    - `temporal-support` - Workflow orchestration
    - `ai-development` - AI/LLM integration

- **Contact:**
  - Tomáš Zaruba - Stack 2.0 Principal, Stack Owner,
  - Josef Sima - B2B Tribe Leader

---

**Remember: Excellence is not negotiable. These standards ensure we build software that lasts. Stack 2.0 makes Groupon engineering leaner, faster, and future-proof.**
