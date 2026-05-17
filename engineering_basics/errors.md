# Error Handling in Encore

## 🚨 The Golden Rule of API Errors

**NEVER return HTTP 200 with a body indicating failure.**

```typescript
// ❌ ABSOLUTELY WRONG - NEVER DO THIS!
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    if (!params.email) {
      return {
        status: "failed",        // ❌ WRONG!
        error: "Email required", // ❌ WRONG!
        user: null,
      };
    }
    // ...
  }
);

// This returns HTTP 200 with error message - CATASTROPHIC MISTAKE!
```

**Why is this wrong?**
- ❌ HTTP clients interpret 200 as success
- ❌ Monitoring systems don't detect failures
- ❌ Retry logic doesn't trigger
- ❌ Error tracking tools miss it
- ❌ Frontend has to check every response for hidden errors
- ❌ Violates HTTP standards and REST principles

---

## ✅ The Correct Way: Use APIError

Encore provides `APIError` for proper error handling with correct HTTP status codes.

```typescript
import { APIError } from "encore.dev/api";

// ✅ CORRECT - Throw APIError
export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    if (!params.email) {
      throw APIError.invalidArgument("Email is required");
      // Returns HTTP 400 Bad Request
    }

    const user = await userService.createUser(params);
    return { user }; // HTTP 200 with actual user data
  }
);
```

---

## Table of Contents

1. [APIError Basics](#apierror-basics)
2. [Standard Error Types](#standard-error-types)
3. [Error Handling in Controllers](#error-handling-in-controllers)
4. [Error Handling in Services](#error-handling-in-services)
5. [Error Handling in Repositories](#error-handling-in-repositories)
6. [Error Details and Context](#error-details-and-context)
7. [Logging Errors](#logging-errors)
8. [Global Error Middleware](#global-error-middleware)
9. [Common Anti-Patterns](#common-anti-patterns)
10. [Best Practices](#best-practices)

---

## APIError Basics

### Import

```typescript
import { APIError, ErrCode } from "encore.dev/api";
```

### Basic Usage

```typescript
// Shorthand methods (recommended)
throw APIError.notFound("User not found");
throw APIError.invalidArgument("Invalid email format");
throw APIError.permissionDenied("Insufficient permissions");
throw APIError.alreadyExists("Email already registered");
throw APIError.internal("Database connection failed");
throw APIError.unauthenticated("Invalid credentials");

// Long form (for custom error codes)
throw new APIError(ErrCode.NotFound, "Resource not found");
```

---

## Standard Error Types

### Complete List of Error Codes

| Method | HTTP Status | Error Code | When to Use |
|--------|-------------|------------|-------------|
| `APIError.invalidArgument()` | 400 Bad Request | `invalid_argument` | Invalid input parameters, validation failures |
| `APIError.unauthenticated()` | 401 Unauthorized | `unauthenticated` | Missing or invalid authentication |
| `APIError.permissionDenied()` | 403 Forbidden | `permission_denied` | User lacks required permissions |
| `APIError.notFound()` | 404 Not Found | `not_found` | Resource doesn't exist |
| `APIError.alreadyExists()` | 409 Conflict | `already_exists` | Resource already exists (duplicate) |
| `APIError.resourceExhausted()` | 429 Too Many Requests | `resource_exhausted` | Rate limit exceeded |
| `APIError.failedPrecondition()` | 400 Bad Request | `failed_precondition` | Operation can't be performed in current state |
| `APIError.aborted()` | 409 Conflict | `aborted` | Operation was aborted |
| `APIError.outOfRange()` | 400 Bad Request | `out_of_range` | Parameter out of valid range |
| `APIError.unimplemented()` | 501 Not Implemented | `unimplemented` | Feature not implemented |
| `APIError.internal()` | 500 Internal Server Error | `internal` | Internal server error |
| `APIError.unavailable()` | 503 Service Unavailable | `unavailable` | Service temporarily unavailable |
| `APIError.dataLoss()` | 500 Internal Server Error | `data_loss` | Unrecoverable data loss |

---

## Error Handling in Controllers

### Controller Responsibilities

Controllers should:
- ✅ Validate request parameters
- ✅ Check authorization
- ✅ Throw `APIError` for request-level errors
- ✅ Let service errors bubble up
- ❌ **NOT** catch and suppress errors

### Basic Controller Errors

```typescript
export const userGet = api(
  { method: "GET", path: "/user/:id", expose: true, auth: true },
  async (params: { id: string }): Promise<UserGetResponse> => {
    // ✅ Validation error
    if (!params.id || params.id.trim() === "") {
      throw APIError.invalidArgument("User ID is required");
    }

    // ✅ Delegate to service (errors bubble up naturally)
    return await userService.getUserById(params.id);
  }
);
```

### Authorization Errors

```typescript
export const userDelete = api(
  { method: "DELETE", path: "/user/:id", expose: true, auth: true },
  async (params: { id: string }): Promise<void> => {
    // ✅ Check permissions first
    await authorization.validatePermission({
      requiredRoles: [UserRole.ADMIN, UserRole.USER_ADMIN],
    });

    // This will throw PermissionDenied automatically if user lacks roles

    await userService.deleteUser(params.id);
  }
);
```

### Authentication Errors

```typescript
export const userUpdate = api(
  { method: "PUT", path: "/user/:id", expose: true, auth: true },
  async (params: UserUpdateRequest): Promise<UserUpdateResponse> => {
    const authData = getAuthData();

    if (!authData) {
      throw APIError.unauthenticated("Authentication required");
    }

    // ✅ Resource ownership check
    if (params.id !== authData.userID) {
      throw APIError.permissionDenied("Cannot update other users");
    }

    return await userService.updateUser(params);
  }
);
```

---

## Error Handling in Services

### Service Layer Error Patterns

Services should:
- ✅ Validate business rules
- ✅ Throw descriptive `APIError`
- ✅ Transform repository errors
- ✅ Log errors with context
- ❌ **NOT** return error objects

### Business Rule Validation

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

    // ✅ Age restriction business rule
    if (params.age && params.age < 18) {
      throw APIError.failedPrecondition("User must be 18 or older");
    }

    const user = await userRepository.create(params);
    return { user };
  }

  #isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
```

### Not Found Errors

```typescript
async getUserById(id: string): Promise<UserGetResponse> {
  const user = await userRepository.findById(id);

  // ✅ Explicit not found error
  if (!user) {
    throw APIError.notFound(`User with ID ${id} not found`);
  }

  return { user };
}
```

### State Validation

```typescript
async publishDeal(dealId: string): Promise<void> {
  const deal = await dealRepository.findById(dealId);

  if (!deal) {
    throw APIError.notFound("Deal not found");
  }

  // ✅ Check current state
  if (deal.status === "published") {
    throw APIError.failedPrecondition("Deal is already published");
  }

  // ✅ Check preconditions
  if (!deal.merchantApproved) {
    throw APIError.failedPrecondition("Deal must be approved by merchant first");
  }

  await dealRepository.updateStatus(dealId, "published");
}
```

### Resource Exhaustion

```typescript
async createDeal(params: DealCreateRequest): Promise<DealCreateResponse> {
  // ✅ Check quota
  const dealCount = await dealRepository.countByMerchant(params.merchantId);

  if (dealCount >= MAX_DEALS_PER_MERCHANT) {
    throw APIError.resourceExhausted(
      `Merchant has reached maximum of ${MAX_DEALS_PER_MERCHANT} deals`
    );
  }

  const deal = await dealRepository.create(params);
  return { deal };
}
```

---

## Error Handling in Repositories

### Repository Error Patterns

Repositories should:
- ✅ Catch database errors
- ✅ Transform to appropriate `APIError`
- ✅ Log database errors
- ✅ Preserve error context
- ❌ **NOT** expose database details to callers

### Database Error Transformation

```typescript
class UserRepository {
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

      log.info("User created", { userId: user.id });
      return user;
    } catch (error) {
      log.error(error, "Database error in create", { data });

      // ✅ Handle unique constraint violation
      if (error instanceof Error && error.message.includes("unique constraint")) {
        throw APIError.alreadyExists("User with this email already exists");
      }

      // ✅ Handle foreign key violation
      if (error instanceof Error && error.message.includes("foreign key")) {
        throw APIError.invalidArgument("Referenced resource does not exist");
      }

      // ✅ Generic database error
      throw APIError.internal("Failed to create user");
    }
  }
}
```

### Not Found Handling

```typescript
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
```

### Update with Not Found

```typescript
async update(id: string, data: Partial<User>): Promise<User> {
  try {
    const [updated] = await db
      .update(userTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userTable.id, id),
        isNull(userTable.deletedAt)
      ))
      .returning();

    // ✅ Check if update affected any rows
    if (!updated) {
      throw APIError.notFound(`User with ID ${id} not found`);
    }

    log.info("User updated", { userId: id });
    return updated;
  } catch (error) {
    // ✅ Re-throw APIError as-is
    if (error instanceof APIError) {
      throw error;
    }

    log.error(error, "Database error in update", { id, data });
    throw APIError.internal("Failed to update user");
  }
}
```

---

## Error Details and Context

### Adding Error Details

Use `.withDetails()` to add structured error information:

```typescript
// ✅ Validation error with field details
throw new APIError(ErrCode.InvalidArgument, "Validation failed")
  .withDetails({
    fields: {
      email: "Invalid format",
      age: "Must be at least 18",
    },
  });

// ✅ Permission error with required roles
throw new APIError(ErrCode.PermissionDenied, "Insufficient permissions")
  .withDetails({
    required: ["ADMIN", "USER_ADMIN"],
    current: ["USER"],
  });

// ✅ Resource exhausted with limits
throw new APIError(ErrCode.ResourceExhausted, "Rate limit exceeded")
  .withDetails({
    limit: 100,
    period: "1 hour",
    retryAfter: Date.now() + 3600000,
  });
```

### Error Response Format

When you throw `APIError`, Encore automatically returns:

```json
{
  "code": "invalid_argument",
  "message": "Validation failed",
  "details": {
    "fields": {
      "email": "Invalid format",
      "age": "Must be at least 18"
    }
  }
}
```

---

## Logging Errors

### Error Logging Best Practices

```typescript
import log from "encore.dev/log";

async function createUser(params: UserCreateRequest): Promise<User> {
  try {
    // Attempt operation
    const user = await userRepository.create(params);

    // ✅ Log success with context
    log.info("User created successfully", {
      userId: user.id,
      email: user.email,
    });

    return user;
  } catch (error) {
    // ✅ Log error with full context
    log.error(error, "Failed to create user", { email: params.email });

    // ✅ Re-throw (don't suppress)
    throw error;
  }
}
```

### What to Log

**✅ DO Log:**
- Operation context (what was being attempted)
- Input parameters (sanitized - no passwords!)
- User ID or relevant identifiers
- Error message and stack trace
- Timestamp (automatic with Encore log)

**❌ DON'T Log:**
- Passwords or secrets
- API keys or tokens
- Credit card numbers
- Social security numbers
- Other sensitive PII

### Log Levels

```typescript
// Information: Normal operations
log.info("User logged in", { userId: user.id });

// Warning: Unexpected but handled
log.warn("Cache miss, fetching from database", { key: cacheKey });

// Error: Operation failed
log.error(error, "Failed to send email", { userId });

// Debug: Detailed debugging info (development only)
log.debug("Processing step 3", { intermediateData });
```

---

## Global Error Middleware

### Error Middleware Setup

Every service should use the global error middleware:

```typescript
// encore.service.ts
import { errorMiddleware } from "@core/middleware/error";

export default new Service("service_name", {
  middlewares: [errorMiddleware],
});
```

### Error Middleware Implementation

```typescript
// @core/middleware/error.ts
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";

export const errorMiddleware = async (req: any, next: any) => {
  try {
    return await next(req);
  } catch (error) {
    // ✅ APIError passes through
    if (error instanceof APIError) {
      log.error(error, "API Error", { path: req.path, method: req.method });
      throw error;
    }

    // ✅ Unexpected errors become internal errors
    log.error(error, "Unexpected error", { path: req.path, method: req.method });

    throw APIError.internal("Internal server error");
  }
};
```

---

## Common Anti-Patterns

### ❌ Anti-Pattern 1: Returning Error Objects

```typescript
// ❌ WRONG - Returns HTTP 200 with error
return {
  success: false,
  error: "User not found",
  data: null,
};

// ✅ CORRECT - Throws proper error
throw APIError.notFound("User not found");
```

### ❌ Anti-Pattern 2: Silent Failures

```typescript
// ❌ WRONG - Silently returns null on error
async getUserById(id: string): Promise<User | null> {
  try {
    return await userRepository.findById(id);
  } catch (error) {
    return null; // ❌ Hides the error!
  }
}

// ✅ CORRECT - Let errors bubble up
async getUserById(id: string): Promise<User> {
  const user = await userRepository.findById(id);
  if (!user) {
    throw APIError.notFound("User not found");
  }
  return user;
}
```

### ❌ Anti-Pattern 3: Generic Error Messages

```typescript
// ❌ WRONG - Vague error message
throw APIError.invalidArgument("Invalid input");

// ✅ CORRECT - Specific error message
throw APIError.invalidArgument("Email must be in valid format (user@domain.com)");
```

### ❌ Anti-Pattern 4: Catching Without Re-throwing

```typescript
// ❌ WRONG - Swallows the error
try {
  await userService.createUser(params);
} catch (error) {
  log.error(error, "Error occurred");
  // Error is lost!
}

// ✅ CORRECT - Log and re-throw
try {
  await userService.createUser(params);
} catch (error) {
  log.error(error, "Failed to create user");
  throw error; // ✅ Propagate the error
}
```

### ❌ Anti-Pattern 5: HTTP Status in Response Body

```typescript
// ❌ WRONG - Status in body
return {
  statusCode: 404,
  message: "Not found",
};

// ✅ CORRECT - Use APIError
throw APIError.notFound("Resource not found");
```

### ❌ Anti-Pattern 6: try-catch Everything

```typescript
// ❌ WRONG - Unnecessary try-catch
export const userGet = api(/*...*/,
  async (params: { id: string }): Promise<UserGetResponse> => {
    try {
      return await userService.getUserById(params.id);
    } catch (error) {
      throw APIError.internal("Failed to get user");
      // ❌ Loses original error context!
    }
  }
);

// ✅ CORRECT - Let errors bubble naturally
export const userGet = api(/*...*/,
  async (params: { id: string }): Promise<UserGetResponse> => {
    return await userService.getUserById(params.id);
    // Service throws appropriate APIError already
  }
);
```

---

## Best Practices

### 1. Be Specific with Error Messages

```typescript
// ❌ Vague
throw APIError.invalidArgument("Invalid data");

// ✅ Specific
throw APIError.invalidArgument("Email must contain @ symbol and domain");
```

### 2. Use Appropriate Error Types

```typescript
// ❌ Wrong error type
throw APIError.internal("User not found");

// ✅ Correct error type
throw APIError.notFound("User not found");
```

### 3. Include Context in Errors

```typescript
// ❌ No context
throw APIError.notFound("Not found");

// ✅ With context
throw APIError.notFound(`Deal with ID ${dealId} not found`);
```

### 4. Don't Expose Internal Details

```typescript
// ❌ Exposes database details
throw APIError.internal(`PostgreSQL error: relation "users" does not exist`);

// ✅ Generic message
throw APIError.internal("Failed to access user data");
```

### 5. Let Errors Bubble Up

```typescript
// ✅ Good - Natural error flow
export const userCreate = api(/*...*/,
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return await userService.createUser(params);
    // Service throws APIError.alreadyExists if email exists
    // Service throws APIError.invalidArgument if validation fails
    // These bubble up naturally
  }
);
```

### 6. Validate Early

```typescript
async createUser(params: UserCreateRequest): Promise<User> {
  // ✅ Validate immediately
  if (!params.email) {
    throw APIError.invalidArgument("Email is required");
  }

  if (!params.name || params.name.length < 2) {
    throw APIError.invalidArgument("Name must be at least 2 characters");
  }

  // Continue with business logic
  const user = await userRepository.create(params);
  return user;
}
```

### 7. Use Error Details for Validation

```typescript
// ✅ Multiple validation errors at once
const errors: Record<string, string> = {};

if (!params.email) {
  errors.email = "Email is required";
}
if (!params.name) {
  errors.name = "Name is required";
}
if (params.age && params.age < 18) {
  errors.age = "Must be 18 or older";
}

if (Object.keys(errors).length > 0) {
  throw new APIError(ErrCode.InvalidArgument, "Validation failed")
    .withDetails({ fields: errors });
}
```

---

## Error Handling Checklist

### Controller Level
- [ ] Use `APIError` for all errors
- [ ] Don't catch errors unless adding context
- [ ] Let service errors bubble up
- [ ] Validate inputs with proper error messages
- [ ] Check authorization and throw `permissionDenied`

### Service Level
- [ ] Validate business rules
- [ ] Throw descriptive `APIError`
- [ ] Transform repository errors appropriately
- [ ] Log errors with context
- [ ] Don't return error objects

### Repository Level
- [ ] Catch database errors
- [ ] Transform to appropriate `APIError`
- [ ] Don't expose database details
- [ ] Log database errors
- [ ] Re-throw `APIError` as-is

### General
- [ ] Never return HTTP 200 with error in body
- [ ] Use appropriate error types
- [ ] Include context in error messages
- [ ] Log errors with relevant data
- [ ] Test error scenarios

---

## Summary

### The Core Rules

1. **NEVER return HTTP 200 with failure status in body**
2. **ALWAYS throw `APIError` for failures**
3. **Use appropriate error types** (notFound, invalidArgument, etc.)
4. **Include context** in error messages
5. **Log errors** with relevant information
6. **Let errors bubble up** naturally
7. **Don't catch errors** unless you're adding context

### Quick Reference

```typescript
// ✅ CORRECT Pattern
export const endpoint = api(/*...*/,
  async (params: Request): Promise<Response> => {
    // Validate
    if (!params.id) {
      throw APIError.invalidArgument("ID is required");
    }

    // Delegate (errors bubble naturally)
    return await service.method(params);
  }
);

// ❌ WRONG Pattern - NEVER DO THIS!
export const endpoint = api(/*...*/,
  async (params: Request): Promise<Response> => {
    if (!params.id) {
      return {
        status: "failed",
        error: "ID is required",
      }; // ❌ WRONG!
    }

    return await service.method(params);
  }
);
```

---

## Resources

- **Encore Error Docs:** https://encore.dev/docs/ts/primitives/errors
- **HTTP Status Codes:** https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
- **Internal Standards:** `/_documentation/engineering_basics/code_standards_in_encore.md`

---

## Related Documentation

- [Debugging Production Services](./debugging_production_services.md) - How to debug errors in production environments

---

**Remember: Proper error handling isn't just about code—it's about making your API reliable, debuggable, and maintainable. Use HTTP status codes correctly. Your future self will thank you.**
