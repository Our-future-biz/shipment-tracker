# Encore TypeScript Engineering Standards

## Overview

This directory contains the **complete engineering standards and best practices** for developing Encore TypeScript microservices at Groupon. These standards are **mandatory** for all developers and ensure consistency, quality, and maintainability across the entire platform.

---

## 🚨 Important

**These standards are non-negotiable.** They represent the collective knowledge and experience of building scalable microservices at Groupon. Following these standards ensures:

- **Consistency** across 100+ services
- **Quality** in code and architecture
- **Maintainability** for long-term success
- **Security** by default
- **Performance** and scalability

---

## Documentation Structure

### 📘 Core Standards

1. **[Code Standards in Encore](code_standards_in_encore.md)**
   - Core principles (non-negotiable)
   - Single responsibility per layer
   - Fail fast, security by default
   - **Start here if you're new**

2. **[Naming Conventions](naming_convention.md)**
   - File naming rules
   - Code element naming (types, functions, variables)
   - Database naming (tables, columns)
   - Public vs private API naming

3. **[Folder Structure & Naming](folder_structure_and_naming.md)**
   - Small microservice pattern
   - Large microservice pattern (with modules)
   - Folder organization rules
   - Where each file type belongs

---

### 🏗️ Architecture & Patterns

Quick orientation for layer boundaries (Controller -> Service -> Repository):

- [Request Flow Layers](request_flow_layers/README.md)

4. **[Service Architecture & Patterns](service_architecture_patterns.md)**
   - Layered architecture (Controller → Service → Repository)
   - Service communication patterns
   - Data flow patterns
   - Middleware patterns
   - Caching strategies
   - Transaction patterns
   - **Read this to understand the big picture**

5. **[Controllers & API Endpoints](controllers_api_endpoints.md)**
   - Public vs Private APIs
   - Controller responsibilities
   - HTTP methods (GET, POST, PUT, DELETE)
   - Input validation (Encore validators, Zod)
   - Authorization patterns
   - Error handling
   - Response patterns
   - **Essential for API development**

---

### 💾 Data Layer

6. **[Database & Repository Standards](database_repository_standards.md)**
   - Drizzle ORM usage
   - Schema design (UUIDs, timestamps, soft deletes)
   - Migrations (creating, managing, reverting)
   - Repository pattern
   - Query patterns
   - Transaction management
   - Performance optimization
   - **Read this before touching the database**

---

### 🔐 Configuration & Security

7. **[Secrets & Environment Management](secrets_environment_management.md)**
   - Secret definition and usage
   - Environment detection
   - Service configuration (`encore.service.ts`)
   - Security best practices
   - Secret rotation
   - **Critical for security and deployment**

---

### ✅ Testing

8. **[Testing Standards](testing_standards.md)**
   - Vitest framework usage
   - Test file organization (dedicated test directories)
   - Testing controllers, services, repositories
   - Mocking patterns
   - Async testing
   - Integration testing
   - Test coverage goals
   - **Required for quality assurance**

---

### 🚀 Operational Standards

9. **[Service Startup Handler (onStart)](service_startup_handler_onstart.md)**
   - Service initialization patterns
   - Health checks
   - Resource warmup
   - Startup validation

10. **[Graceful Shutdown Handler](graceful_shutdown_handler.md)**
    - Graceful shutdown patterns
    - Resource cleanup
    - Connection draining
    - Signal handling

11. **[DTO Standards](dto.md)**
    - Data Transfer Object patterns
    - Validation strategies
    - Interface design
    - Request/Response patterns

---

## Quick Start Guide

### For New Developers

1. **Read in this order:**
   - [Code Standards](code_standards_in_encore.md) - Core principles
   - [Service Architecture](service_architecture_patterns.md) - Big picture
   - [Controllers](controllers_api_endpoints.md) - API development
   - [Database](database_repository_standards.md) - Data access

2. **Reference as needed:**
   - [Naming Conventions](naming_convention.md)
   - [Folder Structure](folder_structure_and_naming.md)
   - [Secrets](secrets_environment_management.md)
   - [Testing](testing_standards.md)

3. **Explore existing services:**
   - `apps/encore-ts/services/_core_operations/user` - User service example
   - `apps/encore-ts/services/_core_system/ai-gateway` - AI Gateway example
   - `apps/encore-ts/services/_core_system/auditlog` - Audit log example

### For Creating a New Service

**Step-by-step:**

1. **Create service structure** following [Folder Structure](folder_structure_and_naming.md)
2. **Configure `encore.service.ts`** following [Secrets Management](secrets_environment_management.md)
3. **Define database schema** following [Database Standards](database_repository_standards.md)
4. **Create controllers** following [Controller Standards](controllers_api_endpoints.md)
5. **Implement services** following [Architecture Patterns](service_architecture_patterns.md)
6. **Add repositories** following [Repository Standards](database_repository_standards.md)
7. **Write tests** following [Testing Standards](testing_standards.md)
8. **Document in README.md**

---

## Architecture Quick Reference

### Layered Architecture

```
HTTP Request
     ↓
CONTROLLER (validate, authorize, delegate)
     ↓
SERVICE (business logic, orchestration)
     ↓
REPOSITORY (database queries only)
     ↓
DATABASE (PostgreSQL)
```

### Rules

- **Controllers**: NO business logic, NO database access
- **Services**: NO direct database access
- **Repositories**: NO business logic

---

## API Quick Reference

### Public API

```typescript
// File: userCreate.controller.ts
export const userCreate = api(
  {
    method: "POST",
    path: "/user",
    expose: true,   // ✅ Public
    auth: true,     // ✅ Requires auth
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    await authorization.validatePermission({ requiredRoles: [UserRole.ADMIN] });
    return await userService.createUser(params);
  }
);
```

### Private API (Internal)

```typescript
// File: _internalUserCreate.controller.ts
export const _internalUserCreate = api(
  {
    method: "POST",
    path: "/user/internal/create",
    expose: false,  // ✅ Internal only
    auth: false,    // ✅ No auth (trusted)
  },
  async (params: UserCreateRequest): Promise<UserCreateResponse> => {
    return await userService.createUser(params);
  }
);
```

---

## Database Quick Reference

### Schema

```typescript
export const userTable = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),

    // Standard timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
  },
  (table) => ({
    emailIdx: index("user_email_idx").on(table.email),
  })
);
```

### Repository

```typescript
class UserRepository {
  async findById(id: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(userTable)
      .where(and(
        eq(userTable.id, id),
        isNull(userTable.deletedAt) // Soft delete check
      ))
      .limit(1);

    return user || null;
  }
}
```

---

## Testing Quick Reference

```typescript
describe("UserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create user successfully", async () => {
    // Arrange
    vi.mocked(userRepository.create).mockResolvedValue(mockUser);

    // Act
    const result = await userService.createUser(userData);

    // Assert
    expect(result.user).toEqual(mockUser);
  });
});
```

---

## Naming Quick Reference

### Files

- Controllers: `userCreate.controller.ts` (public) or `_internalUserCreate.controller.ts` (private)
- Services: `user.service.ts`
- Repositories: `user.repository.ts`
- Tests: `tests/services/user.service.test.ts` (in dedicated test directory)

### Code

- Types/Interfaces: `PascalCase` → `UserCreateRequest`
- Functions/Variables: `camelCase` → `createUser`
- Constants: `UPPER_SNAKE_CASE` → `MAX_PAGE_SIZE`
- Private fields: `#fieldName` → `#cache`
- Tables/Columns: `snake_case` → `user`, `created_at`

---

## Common Commands

```bash
# Development
pnpm backend                           # Start all services
encore run                             # Alternative

# Database
npx drizzle-kit generate              # Generate migration
encore db shell service_name          # Open database shell

# Testing
pnpm encore:test                      # Run tests (watch)
CI=1 pnpm encore:test                 # Run tests (CI)
VITEST_DIR=services/user pnpm encore:test  # Specific tests

# Secrets
encore secret set --type local SECRET_NAME
encore secret set --type production SECRET_NAME
```

---

## Resources

### Internal Documentation

- **This Directory**: `/_documentation/engineering_basics/`
- **Main README**: `/apps/encore-ts/README.md`
- **Service Examples**: `/apps/encore-ts/services/`

### External Documentation

- [Encore.ts Documentation](https://encore.dev/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)

---

## Getting Help

1. **Read the relevant documentation** in this directory
2. **Check existing services** for patterns and examples
3. **Consult Encore docs** at [encore.dev/docs](https://encore.dev/docs)
4. **Ask in GChat** - [Encore Hub](https://chat.google.com/room/AAQAQEAUoTo?cls=7)

---

## Contributing to Documentation

### When to Update

Update documentation when:
- ✅ Adding new patterns or best practices
- ✅ Discovering common pitfalls
- ✅ Clarifying existing standards
- ✅ Adding examples

### How to Update

1. **Edit the relevant `.md` file**
2. **Follow the existing format and style**
3. **Add examples where helpful**
4. **Update this README if adding new files**
5. **Submit a PR for review**

---

## Document Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-20 | Initial comprehensive documentation | AI Assistant |

---

**Remember: These standards exist to help us build better software together. Follow them, improve them, and help others understand them.**
