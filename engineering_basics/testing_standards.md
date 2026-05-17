# Testing Standards

## Overview

This document defines comprehensive testing standards for Encore TypeScript services. We use **Vitest** as our testing framework, providing fast, modern unit and integration testing with excellent TypeScript support.

---

## Core Principles

1. **Tests are in dedicated test folders**, separate from source files
2. **Tests mirror the structure** they test
3. **Every layer is tested** (controllers, services, repositories)
4. **Tests are fast** and isolated
5. **Mock external dependencies**, not internal ones
6. **Test behavior**, not implementation
7. **Clear test names** describe what they test

---

## Test File Organization

### Dedicated Test Folder Pattern

Tests live in **dedicated test folders**, separate from source code:

```
/services/user/
├── controllers/
│   └── userCreate.controller.ts
├── services/
│   └── user.service.ts
├── repositories/
│   └── user.repository.ts
├── utils/
│   └── validation.utils.ts
└── tests/
    ├── controllers/
    │   └── userCreate.controller.test.ts     ← Test here
    ├── services/
    │   └── user.service.test.ts              ← Test here
    ├── repositories/
    │   └── user.repository.test.ts           ← Test here
    └── utils/
        └── validation.utils.test.ts          ← Test here
```

### File Naming

- Test file: `{filename}.test.ts`
- Located in `tests` folder, mirroring source structure
- Same name as source file + `.test.ts`

**Examples:**
- `user.service.ts` → `user.service.test.ts`
- `userCreate.controller.ts` → `userCreate.controller.test.ts`
- `user.repository.ts` → `user.repository.test.ts`

---

## Testing Framework: Vitest

### Why Vitest?

- **Fast**: Instant hot module replacement
- **Compatible**: Jest-like API
- **TypeScript**: First-class TypeScript support
- **Modern**: ESM native, Vite-powered
- **Parallel**: Tests run in parallel by default

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Feature/Component Name", () => {
  // Setup runs before each test
  beforeEach(() => {
    // Setup code
  });

  // Cleanup runs after each test
  afterEach(() => {
    // Cleanup code
  });

  describe("specific method/function", () => {
    it("should do something specific", () => {
      // Arrange
      const input = "test";

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe("expected");
    });

    it("should handle error case", () => {
      // Test error scenarios
      expect(() => functionUnderTest(null)).toThrow("Error message");
    });
  });
});
```

---

## Testing Controllers

### Controller Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { userCreate } from "../../controllers/userCreate.controller";
import { userService } from "../../services/user.service";
import { authorization } from "~encore/clients";

// Mock dependencies
vi.mock("~encore/clients", () => ({
  authorization: {
    validatePermission: vi.fn(),
  },
}));

vi.mock("../../services/user.service", () => ({
  userService: {
    createUser: vi.fn(),
  },
}));

describe("userCreate controller", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe("successful creation", () => {
    it("should create user with valid data", async () => {
      // Arrange
      const mockUser = {
        id: "user-123",
        name: "John Doe",
        email: "john@example.com",
      };

      vi.mocked(authorization.validatePermission).mockResolvedValue(undefined);
      vi.mocked(userService.createUser).mockResolvedValue({ user: mockUser });

      // Act
      const result = await userCreate({
        name: "John Doe",
        email: "john@example.com",
      });

      // Assert
      expect(result.user).toEqual(mockUser);
      expect(authorization.validatePermission).toHaveBeenCalledWith({
        requiredRoles: [UserRole.ADMIN, UserRole.USER_ADMIN],
      });
      expect(userService.createUser).toHaveBeenCalledWith({
        name: "John Doe",
        email: "john@example.com",
      });
    });
  });

  describe("authorization", () => {
    it("should check user permissions", async () => {
      // Arrange
      vi.mocked(authorization.validatePermission).mockRejectedValue(
        APIError.permissionDenied("Insufficient permissions")
      );

      // Act & Assert
      await expect(
        userCreate({
          name: "John Doe",
          email: "john@example.com",
        })
      ).rejects.toThrow("Insufficient permissions");

      expect(authorization.validatePermission).toHaveBeenCalled();
      expect(userService.createUser).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("should validate email format", async () => {
      // Act & Assert
      await expect(
        userCreate({
          name: "John Doe",
          email: "invalid-email",
        })
      ).rejects.toThrow("Invalid email");
    });

    it("should require name", async () => {
      await expect(
        userCreate({
          name: "",
          email: "john@example.com",
        })
      ).rejects.toThrow("Name is required");
    });
  });
});
```

---

## Testing Services

### Service Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { userService } from "../../services/user.service";
import { userRepository } from "../../repositories/user.repository";
import { authorization } from "~encore/clients";
import { APIError } from "encore.dev/api";

// Mock repository
vi.mock("../../repositories/user.repository", () => ({
  userRepository: {
    create: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

describe("UserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createUser", () => {
    it("should create user successfully", async () => {
      // Arrange
      const userData = {
        name: "John Doe",
        email: "john@example.com",
      };

      const createdUser = {
        id: "user-123",
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue(createdUser);

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result.user).toEqual(createdUser);
      expect(userRepository.findByEmail).toHaveBeenCalledWith("john@example.com");
      expect(userRepository.create).toHaveBeenCalledWith(userData);
    });

    it("should throw error if email already exists", async () => {
      // Arrange
      const existingUser = {
        id: "existing-123",
        name: "Existing User",
        email: "john@example.com",
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(existingUser);

      // Act & Assert
      await expect(
        userService.createUser({
          name: "John Doe",
          email: "john@example.com",
        })
      ).rejects.toThrow(APIError.alreadyExists("User with this email already exists"));

      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it("should handle repository errors", async () => {
      // Arrange
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockRejectedValue(
        new Error("Database connection failed")
      );

      // Act & Assert
      await expect(
        userService.createUser({
          name: "John Doe",
          email: "john@example.com",
        })
      ).rejects.toThrow();

      expect(userRepository.create).toHaveBeenCalled();
    });
  });

  describe("getUserById", () => {
    it("should return user when found", async () => {
      // Arrange
      const user = {
        id: "user-123",
        name: "John Doe",
        email: "john@example.com",
      };

      vi.mocked(userRepository.findById).mockResolvedValue(user);

      // Act
      const result = await userService.getUserById("user-123");

      // Assert
      expect(result).toEqual(user);
      expect(userRepository.findById).toHaveBeenCalledWith("user-123", false);
    });

    it("should throw not found error when user doesn't exist", async () => {
      // Arrange
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(userService.getUserById("non-existent")).rejects.toThrow(
        APIError.notFound("User not found")
      );
    });
  });

  describe("updateUser", () => {
    it("should update user successfully", async () => {
      // Arrange
      const existingUser = {
        id: "user-123",
        name: "Old Name",
        email: "old@example.com",
      };

      const updatedUser = {
        ...existingUser,
        name: "New Name",
      };

      vi.mocked(userRepository.findById).mockResolvedValue(existingUser);
      vi.mocked(userRepository.update).mockResolvedValue(updatedUser);

      // Act
      const result = await userService.updateUser("user-123", {
        name: "New Name",
      });

      // Assert
      expect(result.user).toEqual(updatedUser);
      expect(userRepository.update).toHaveBeenCalledWith("user-123", {
        name: "New Name",
      });
    });

    it("should throw error if user not found", async () => {
      // Arrange
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(
        userService.updateUser("non-existent", { name: "New Name" })
      ).rejects.toThrow(APIError.notFound("User not found"));

      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });
});
```

---

## Testing Repositories

### Repository Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { userRepository } from "../../repositories/user.repository";
import { db } from "../../db/db";
import { userTable } from "../../schemas/schema";
import { eq } from "drizzle-orm";

describe("UserRepository", () => {
  let testUserId: string;

  beforeEach(async () => {
    // Create test data
    const [user] = await db
      .insert(userTable)
      .values({
        name: "Test User",
        email: "test@example.com",
      })
      .returning();

    testUserId = user.id;
  });

  afterEach(async () => {
    // Cleanup test data
    await db.delete(userTable).where(eq(userTable.id, testUserId));
  });

  describe("findById", () => {
    it("should find user by ID", async () => {
      // Act
      const user = await userRepository.findById(testUserId);

      // Assert
      expect(user).toBeDefined();
      expect(user?.id).toBe(testUserId);
      expect(user?.email).toBe("test@example.com");
    });

    it("should return null for non-existent ID", async () => {
      // Act
      const user = await userRepository.findById("non-existent-uuid");

      // Assert
      expect(user).toBeNull();
    });

    it("should exclude soft-deleted users by default", async () => {
      // Arrange
      await userRepository.softDelete(testUserId);

      // Act
      const user = await userRepository.findById(testUserId);

      // Assert
      expect(user).toBeNull();
    });

    it("should include soft-deleted when flag is true", async () => {
      // Arrange
      await userRepository.softDelete(testUserId);

      // Act
      const user = await userRepository.findById(testUserId, true);

      // Assert
      expect(user).toBeDefined();
      expect(user?.deletedAt).toBeDefined();
    });
  });

  describe("findByEmail", () => {
    it("should find user by email", async () => {
      // Act
      const user = await userRepository.findByEmail("test@example.com");

      // Assert
      expect(user).toBeDefined();
      expect(user?.id).toBe(testUserId);
    });

    it("should return null for non-existent email", async () => {
      // Act
      const user = await userRepository.findByEmail("nonexistent@example.com");

      // Assert
      expect(user).toBeNull();
    });
  });

  describe("create", () => {
    let createdUserId: string;

    afterEach(async () => {
      // Cleanup created user
      if (createdUserId) {
        await db.delete(userTable).where(eq(userTable.id, createdUserId));
      }
    });

    it("should create new user", async () => {
      // Act
      const user = await userRepository.create({
        name: "New User",
        email: "new@example.com",
      });

      createdUserId = user.id;

      // Assert
      expect(user.id).toBeDefined();
      expect(user.name).toBe("New User");
      expect(user.email).toBe("new@example.com");
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it("should throw error for duplicate email", async () => {
      // Act & Assert
      await expect(
        userRepository.create({
          name: "Duplicate",
          email: "test@example.com", // Already exists
        })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("should update user", async () => {
      // Act
      const updated = await userRepository.update(testUserId, {
        name: "Updated Name",
      });

      // Assert
      expect(updated.id).toBe(testUserId);
      expect(updated.name).toBe("Updated Name");
      expect(updated.email).toBe("test@example.com");
      expect(updated.updatedAt).toBeDefined();
    });

    it("should throw not found for non-existent user", async () => {
      // Act & Assert
      await expect(
        userRepository.update("non-existent-uuid", { name: "New Name" })
      ).rejects.toThrow("User not found");
    });
  });

  describe("softDelete", () => {
    it("should soft delete user", async () => {
      // Act
      await userRepository.softDelete(testUserId);

      // Assert
      const user = await userRepository.findById(testUserId, true);
      expect(user?.deletedAt).toBeDefined();
    });

    it("should throw error for non-existent user", async () => {
      // Act & Assert
      await expect(
        userRepository.softDelete("non-existent-uuid")
      ).rejects.toThrow();
    });
  });

  describe("search", () => {
    let additionalUserIds: string[] = [];

    beforeEach(async () => {
      // Create additional test users
      const users = await Promise.all([
        db
          .insert(userTable)
          .values({ name: "Alice Smith", email: "alice@example.com" })
          .returning(),
        db
          .insert(userTable)
          .values({ name: "Bob Jones", email: "bob@example.com" })
          .returning(),
      ]);

      additionalUserIds = users.map((u) => u[0].id);
    });

    afterEach(async () => {
      // Cleanup additional users
      if (additionalUserIds.length > 0) {
        await db.delete(userTable).where(inArray(userTable.id, additionalUserIds));
      }
    });

    it("should search users by email", async () => {
      // Act
      const result = await userRepository.search({ email: "alice" });

      // Assert
      expect(result.users.length).toBeGreaterThan(0);
      expect(result.users[0].email).toContain("alice");
    });

    it("should paginate results", async () => {
      // Act
      const result = await userRepository.search({ limit: 1, offset: 0 });

      // Assert
      expect(result.users.length).toBe(1);
      expect(result.total).toBeGreaterThan(1);
    });
  });
});
```

---

## Testing Utilities

### Utility Test Template

```typescript
import { describe, it, expect } from "vitest";
import { validateEmail, formatName } from "../../utils/validation.utils";

describe("Validation Utils", () => {
  describe("validateEmail", () => {
    it("should validate correct email", () => {
      expect(validateEmail("user@example.com")).toBe(true);
      expect(validateEmail("test.user@example.co.uk")).toBe(true);
    });

    it("should reject invalid email", () => {
      expect(validateEmail("invalid")).toBe(false);
      expect(validateEmail("@example.com")).toBe(false);
      expect(validateEmail("user@")).toBe(false);
    });
  });

  describe("formatName", () => {
    it("should format name correctly", () => {
      expect(formatName("john doe")).toBe("John Doe");
      expect(formatName("ALICE SMITH")).toBe("Alice Smith");
    });

    it("should handle edge cases", () => {
      expect(formatName("")).toBe("");
      expect(formatName("   ")).toBe("");
      expect(formatName("single")).toBe("Single");
    });
  });
});
```

---

## Mocking Patterns

### Mocking Encore Clients

```typescript
import { vi } from "vitest";

vi.mock("~encore/clients", () => ({
  userService: {
    getUser: vi.fn(),
    createUser: vi.fn(),
  },
  authorization: {
    validatePermission: vi.fn(),
  },
}));
```

### Mocking Encore Auth

```typescript
import { vi } from "vitest";

vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn(() => ({
    userID: "test-user-123",
    roles: ["ADMIN"],
  })),
}));
```

### Mocking External APIs

```typescript
import { vi } from "vitest";

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: "mocked" }),
  })
);

// Reset after test
afterEach(() => {
  vi.resetAllMocks();
});
```

### Mocking Database

For integration tests, use test database:

```typescript
import { db } from "../../db/db";

// Use transactions for isolation
describe("Integration Test", () => {
  beforeEach(async () => {
    await db.transaction(async (tx) => {
      // Setup test data
    });
  });

  afterEach(async () => {
    // Rollback or cleanup
  });
});
```

---

## Running Tests

### Commands

#### `pnpm test` — recommended for most development

Runs Vitest directly without the Encore CLI. No daemon required.

| Context | Behaviour |
|---|---|
| Local (no `CI` env var) | Watch mode — reruns on file changes |
| CI (`CI=true`) | Runs once, then exits |

```bash
# Watch mode (local development)
pnpm test

# Specific service (watch locally / one-shot in CI)
VITEST_DIR=services/user pnpm test
```

#### `pnpm encore:test` — when Encore runtime is needed

Runs tests through the Encore CLI. Required for tests that rely on Encore-managed resources (databases, pub/sub, secrets). Requires a running Encore daemon.

```bash
# Watch mode
pnpm encore:test

# One-shot
CI=true pnpm encore:test

# Specific directory
VITEST_DIR=services/user pnpm encore:test
```

#### Coverage report

Coverage is **disabled by default** and must be requested explicitly by passing the `--coverage` flag:

```bash
# Generate coverage report
pnpm test --coverage

# Coverage for a specific service
VITEST_DIR=services/user pnpm test --coverage
```

Reports are written to `apps/encore-ts/coverage/`:
- `coverage/index.html` — interactive HTML report, open in browser
- `coverage/lcov.info` — for IDE integrations (e.g. Coverage Gutters extension)

### Watch Mode (Development)

In watch mode, tests automatically re-run when files change:

```bash
pnpm encore:test

# Output:
# ✓ src/services/user/user.service.test.ts (5 tests)
# ✓ src/services/user/repositories/user.repository.test.ts (12 tests)
#
# Test Files  2 passed (2)
#      Tests  17 passed (17)
#   Start at  10:30:45
#   Duration  1.2s
```

---

## Test Naming Conventions

### Describe Blocks

```typescript
// Top level: Feature or component
describe("UserService", () => {
  // Second level: Method or function
  describe("createUser", () => {
    // Third level: Scenario
    describe("when email already exists", () => {
      it("should throw AlreadyExists error", () => {
        // Test implementation
      });
    });
  });
});
```

### Test Names (it blocks)

Use clear, descriptive names:

```typescript
// ✅ Good: Clear and specific
it("should create user with valid email", () => {});
it("should throw error when email is invalid", () => {});
it("should return null when user not found", () => {});

// ❌ Bad: Vague or unclear
it("works", () => {});
it("test user creation", () => {});
it("should work correctly", () => {});
```

---

## Test Coverage

### What to Test

**✅ DO test:**
- All public methods/functions
- Error handling paths
- Edge cases and boundary conditions
- Business logic
- Data transformations
- Authorization checks
- Validation logic

**❌ DON'T test:**
- Third-party library internals
- Trivial getters/setters
- Type definitions
- Constants

### Coverage Goals

- **Services**: 80%+ coverage
- **Repositories**: 70%+ coverage
- **Controllers**: 70%+ coverage
- **Utilities**: 90%+ coverage

---

## Best Practices

### ✅ DO

1. **Write tests first** (TDD when possible)
2. **Keep tests simple and focused**
3. **Use descriptive test names**
4. **Test one thing per test**
5. **Arrange-Act-Assert pattern**
6. **Mock external dependencies**
7. **Clean up after tests**
8. **Test error cases**

### ❌ DON'T

1. **Test implementation details**
2. **Share state between tests**
3. **Make tests depend on execution order**
4. **Use real external APIs**
5. **Skip error cases**
6. **Write flaky tests**
7. **Ignore test failures**

---

## Arrange-Act-Assert Pattern

```typescript
it("should create user successfully", async () => {
  // 🔵 ARRANGE: Set up test data and mocks
  const userData = {
    name: "John Doe",
    email: "john@example.com",
  };
  vi.mocked(userRepository.create).mockResolvedValue(mockUser);

  // 🟢 ACT: Execute the code under test
  const result = await userService.createUser(userData);

  // 🔴 ASSERT: Verify the results
  expect(result.user).toEqual(mockUser);
  expect(userRepository.create).toHaveBeenCalledWith(userData);
});
```

---

## Async Testing

### Testing Promises

```typescript
it("should handle async operations", async () => {
  // Using async/await
  const result = await asyncFunction();
  expect(result).toBe("expected");
});

it("should handle promise rejection", async () => {
  // Testing rejections
  await expect(asyncFunction()).rejects.toThrow("Error message");
});
```

### Testing Timeouts

```typescript
it("should timeout after 5 seconds", async () => {
  await expect(
    longRunningFunction()
  ).rejects.toThrow("Timeout");
}, 6000); // Test timeout in milliseconds
```

---

## Integration Testing

### Testing Full API Flow

```typescript
describe("User Creation Flow (Integration)", () => {
  it("should create user end-to-end", async () => {
    // Call actual controller
    const result = await userCreate({
      name: "Integration Test",
      email: "integration@example.com",
    });

    // Verify in database
    const dbUser = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, result.user.id))
      .limit(1);

    expect(dbUser[0]).toBeDefined();
    expect(dbUser[0].email).toBe("integration@example.com");

    // Cleanup
    await db.delete(userTable).where(eq(userTable.id, result.user.id));
  });
});
```

---

## Troubleshooting Tests

### Tests Failing Locally

```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install

# Clear Vitest cache
rm -rf node_modules/.vitest

# Run tests in CI mode
CI=1 pnpm encore:test
```

### Flaky Tests

```typescript
// ❌ Bad: Test depends on timing
it("should process after delay", async () => {
  setTimeout(() => doSomething(), 100);
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(result).toBe("done");
});

// ✅ Good: Use proper async patterns
it("should process after delay", async () => {
  const result = await processWithDelay();
  expect(result).toBe("done");
});
```

---

## Summary Checklist

### Test File Checklist

- [ ] Test file in dedicated `tests` folder
- [ ] Named `{filename}.test.ts`
- [ ] Imports from vitest (`describe`, `it`, `expect`)
- [ ] Clear describe blocks for organization
- [ ] Descriptive test names using `it("should...")`
- [ ] Arrange-Act-Assert pattern used
- [ ] Mocks cleaned up in `beforeEach`/`afterEach`
- [ ] Tests are isolated and independent
- [ ] Error cases tested
- [ ] Edge cases covered

### Test Quality Checklist

- [ ] Tests pass consistently
- [ ] Tests run fast (< 100ms per test ideally)
- [ ] No hardcoded IDs or test data
- [ ] Mocks are appropriate and minimal
- [ ] Assertions are specific and meaningful
- [ ] Tests document expected behavior
- [ ] Coverage goals met

---

## Related Documentation

- [Debugging Production Services](./debugging_production_services.md) - Debug issues that tests didn't catch
- [Error Handling](./errors.md) - Proper error patterns to test

---

**Remember: Good tests are fast, isolated, repeatable, and meaningful. They document behavior and catch regressions.**

