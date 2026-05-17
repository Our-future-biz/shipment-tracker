# How to Add New API Tests to Groupon Encore Backend

## Overview

This guide walks you through the process of creating new API integration tests for the Groupon Encore Backend using Playwright and the `@groupon/encore-client` package. The test suite includes role-based authentication, multi-environment support, and type-safe API client integration.

## Prerequisites

Before adding new tests, ensure you have:

*   ✅ Node.js 18+ and pnpm installed
*   ✅ Access to preview, staging, or production environment
*   ✅ Familiarity with TypeScript and Playwright basics
*   ✅ Understanding of REST API testing concepts
*   ✅ Knowledge of the `@groupon/encore-client` package

## Step-by-Step Guide

### Step 1: Understand the Test Structure

The `api` test project follows this structure:

```
api/
├── config/
│   └── envs/          # Environment-specific configurations
├── tests/             # Test specifications (organized by API domain)
├── test-data/         # Test data and user roles
├── utils/             # Helper functions (auth, client initialization)
└── playwright.config.ts
```

**Key Concepts:**

*   **Test Files**: Organized by API domain (authentication, user, booster, mad, etc.)
*   **EncoreClientAuth**: Wrapper for initializing authenticated API clients
*   **Token Generation**: Automatic token generation per user role via `generateApiToken()`
*   **Environment Configuration**: Multi-environment support (preview, staging, production)
*   **Type Safety**: Full TypeScript support with `@groupon/encore-client`

### Step 2: Decide What You're Testing

Before writing code, identify:

| Question | Example Answer |
| :--- | :--- |
| **What API endpoint are you testing?** | User profile endpoint (`/user/me`) |
| **Which service/domain does it belong to?** | User management |
| **What user role is needed?** | ADMIN |
| **Does it modify data?** | No - read-only |
| **What's the expected response?** | User object with email and roles |
| **Which environments support it?** | All (preview, staging, production) |

### Step 3: Choose the Right Test Location

Create your test file in the appropriate domain directory under `tests/`:

*   `tests/authentication/` - Authentication and user creation flows
*   `tests/user/` - User management endpoints
*   `tests/booster/` - Booster service endpoints
*   `tests/mad/` - MAD (Merchant Acquisition/Deal) API endpoints
*   `tests/<your-domain>/` - Create new directory for new API domains

**File Naming Convention:** `<feature>.api.test.ts`

**Example:** `tests/user/user-profile.api.test.ts`

### Step 4: Create Your Test File

Create a new test file following the standard structure:

**Example: Basic Test Structure**

```typescript
// tests/user/user-profile.api.test.ts
import type Client from "@groupon/encore-client";
import { expect, test } from "@playwright/test";
import { env as ENV } from "../../config/envs/env";
import { EncoreClientAuth } from "../../utils/encore-client-auth";

test.describe("User - Profile", () => {
  let encoreClient: Client;

  test.beforeAll(async () => {
    encoreClient = await new EncoreClientAuth(ENV.url, ENV.token).init();
  });

  test("should return user profile data", async () => {
    const response = await encoreClient.user.me();

    expect(response).toHaveProperty("user");
    expect(response.user).toHaveProperty("email");
    expect(response.user).toHaveProperty("roles");
  });
});
```

### Step 5: Add Role-Based Authentication

Use `generateApiToken()` to create tokens for different user roles:

**Example: Test with Specific Role**

```typescript
import { expect, test } from "@playwright/test";
import { env as ENV } from "../../config/envs/env";
import { getTestAccount, USER_ROLES } from "../../test-data/users";
import { EncoreClientAuth } from "../../utils/encore-client-auth";
import { generateApiToken } from "../../utils/global-setup";

test.describe("User - Get Current User Data", () => {
  test("should return valid Content Editor user data", async () => {
    // Step 1: Generate token for specific role
    const editorToken = await generateApiToken(USER_ROLES.CONTENT_EDITOR);

    // Step 2: Initialize client with role-specific token
    const encoreClient = await new EncoreClientAuth(ENV.url, editorToken).init();

    // Step 3: Get expected account data
    const editorAccount = getTestAccount(USER_ROLES.CONTENT_EDITOR);

    // Step 4: Make API call
    const response = await encoreClient.user.me();

    // Step 5: Verify response
    expect(response).toHaveProperty("user");
    expect(response.user.email).toBe(editorAccount.email);
    expect(response.user.roles).toContain(USER_ROLES.CONTENT_EDITOR);
  });
});
```

**Available Roles:**

*   `USER_ROLES.ADMIN` - Full administrative access
*   `USER_ROLES.CONTENT_EDITOR` - Content editing permissions
*   `USER_ROLES.CONTENT_MODERATOR` - Content moderation permissions

**How Token Generation Works:**

*   **Preview Environment**: Creates a new test user and retrieves an authentication token
*   **Staging/Production**: Uses existing API key to generate an authentication token
*   Tokens are automatically managed per environment

### Step 6: Handle Environment-Specific Tests

Use `test.skip()` to conditionally run tests based on environment:

**Example: Environment-Specific Test**

```typescript
import { expect, test } from "@playwright/test";
import { env as ENV } from "../../config/envs/env";
import { EncoreClientAuth } from "../../utils/encore-client-auth";

test.describe("Authentication - Create User", () => {
  let encoreClient: Client;

  test.beforeAll(async () => {
    // Skip if not in preview environment
    test.skip(ENV.target !== "preview", "This test is only available in preview environment");
    encoreClient = await new EncoreClientAuth(ENV.url, ENV.token).init();
  });

  test("should create account with valid credentials", async () => {
    const response = await encoreClient.authentication.createUserInPreviewEnvironment({
      email: "test@example.com",
      name: "Test User",
    });

    expect(response).toHaveProperty("token");
    expect(response).toHaveProperty("expiresAt");
  });
});
```

### Step 7: Add Error Handling

Handle API errors using the `APIError` class from `@groupon/encore-client`:

**Example: Error Handling**

```typescript
import { expect, test } from "@playwright/test";
import { env as ENV } from "../../config/envs/env";
import { INVALID_AUTHENTICATION } from "../../test-data/users";
import { EncoreClientAuth } from "../../utils/encore-client-auth";
import { APIError } from "../../utils/global-setup";

test.describe("User - Authentication Errors", () => {
  test("should return error for invalid authentication", async () => {
    const invalidClient = await new EncoreClientAuth(ENV.url, INVALID_AUTHENTICATION.auth).init();

    try {
      const response = await invalidClient.user.me();
      expect(response, "Response should be undefined").toBeUndefined();
    } catch (error) {
      if (error instanceof APIError) {
        expect((error as { code: string }).code).toBe("unauthenticated");
        expect(error.message).toBeDefined();
      }
    }
  });
});
```

### Step 8: Run and Debug Your Test

**Run Locally**

```bash
# Set environment and run your specific test
ENV=preview API_BASE_URL=<api-url> pnpm test tests/user/user-profile.api.test.ts

# Run tests in a specific directory
ENV=staging-us pnpm test tests/user/

# Run tests matching a pattern
ENV=preview API_BASE_URL=<api-url> pnpm test --grep "should return user profile"

# Run with UI mode (interactive)
ENV=preview API_BASE_URL=<api-url> pnpm test:ui

# Run with single worker (useful for debugging)
ENV=preview API_BASE_URL=<api-url> pnpm test:ci
```

**View Test Reports**

```bash
# View HTML report
pnpm report
```

### Step 9: Review and Refine

Before submitting your test, verify:

| Checklist Item | ✓ |
| :--- | :--- |
| Test file follows naming convention (`*.api.test.ts`) | □ |
| Test is in the correct domain directory | □ |
| Uses `EncoreClientAuth` for client initialization | □ |
| Uses `generateApiToken()` for role-based auth when needed | □ |
| Includes proper error handling | □ |
| Uses environment-specific logic with `test.skip()` if needed | □ |
| Test passes locally and in CI | □ |
| Test can run multiple times (idempotent) | □ |
| No hardcoded credentials or sensitive data | □ |
| Test has clear comments and descriptive names | □ |
| Response assertions are comprehensive | □ |

## Common Test Patterns

### Pattern 1: Simple API Read Test

```typescript
test.describe("User - Profile", () => {
  let encoreClient: Client;

  test.beforeAll(async () => {
    encoreClient = await new EncoreClientAuth(ENV.url, ENV.token).init();
  });

  test("should return user profile", async () => {
    const response = await encoreClient.user.me();

    expect(response).toHaveProperty("user");
    expect(response.user.email).toBeDefined();
  });
});
```

### Pattern 2: Role-Based Testing

```typescript
test.describe("User - Role Verification", () => {
  test("should return correct roles for Admin", async () => {
    const adminToken = await generateApiToken(USER_ROLES.ADMIN);
    const client = await new EncoreClientAuth(ENV.url, adminToken).init();
    const account = getTestAccount(USER_ROLES.ADMIN);

    const response = await client.user.me();

    expect(response.user.roles).toContain(USER_ROLES.ADMIN);
    expect(response.user.email).toBe(account.email);
  });

  test("should return correct roles for Content Editor", async () => {
    const editorToken = await generateApiToken(USER_ROLES.CONTENT_EDITOR);
    const client = await new EncoreClientAuth(ENV.url, editorToken).init();

    const response = await client.user.me();

    expect(response.user.roles).toContain(USER_ROLES.CONTENT_EDITOR);
    expect(response.user.roles).not.toContain(USER_ROLES.ADMIN);
  });
});
```

### Pattern 3: Error Handling Test

```typescript
test.describe("Authentication - Error Cases", () => {
  test("should handle invalid credentials", async () => {
    const invalidClient = await new EncoreClientAuth(ENV.url, "invalid-token").init();

    try {
      await invalidClient.user.me();
      // If we reach here, the test should fail
      expect(true).toBe(false);
    } catch (error) {
      if (error instanceof APIError) {
        expect(error.code).toBe("unauthenticated");
      }
    }
  });
});
```

### Pattern 4: Environment-Specific Test

```typescript
test.describe("Preview - User Creation", () => {
  test.beforeAll(async () => {
    test.skip(ENV.target !== "preview", "Preview environment only");
  });

  test("should create user in preview", async () => {
    const client = await new EncoreClientAuth(ENV.url, ENV.token).init();
    const response = await client.authentication.createUserInPreviewEnvironment({
      email: "test@example.com",
      name: "Test User",
    });

    expect(response.token).toBeDefined();
  });
});
```

### Pattern 5: Multi-Step API Flow

```typescript
test.describe("User - Complete Flow", () => {
  test("should complete user workflow", async () => {
    // Step 1: Authenticate
    const token = await generateApiToken(USER_ROLES.ADMIN);
    const client = await new EncoreClientAuth(ENV.url, token).init();

    // Step 2: Get user profile
    const profile = await client.user.me();
    expect(profile.user).toBeDefined();

    // Step 3: Perform another operation with same client
    const deals = await client.booster.searchAndResolveDeals({
      searchQuery: "test",
      country: "US",
      offset: 0,
      count: 10,
    });
    expect(deals.deals).toBeDefined();
  });
});
```

## Best Practices

**✅ DO**

*   Use `EncoreClientAuth` for client initialization
*   Use `generateApiToken()` for role-based authentication
*   Add comprehensive response assertions
*   Handle errors using `APIError` class
*   Use environment-specific logic with `test.skip()` when needed
*   Organize tests by API domain in separate directories
*   Use descriptive test names that explain what is being tested
*   Add comments for complex test steps
*   Use `getTestAccount()` to get expected test data
*   Test locally before pushing to CI

**❌ DON'T**

*   Don't hardcode credentials or sensitive data
*   Don't skip error handling
*   Don't write tests that depend on each other
*   Don't commit environment files or tokens
*   Don't use hardcoded API URLs (use `ENV.url`)
*   Don't skip environment checks for environment-specific features
*   Don't make assumptions about response structure without assertions
*   Don't use `any` types - leverage TypeScript from `@groupon/encore-client`

## Troubleshooting

### Test Fails with "Token not found"

**Cause:** Token generation failed or environment not configured

**Solution:**

*   Ensure `ENV` variable is set correctly
*   Check environment config file exists in `config/envs/`
*   Verify API credentials are valid in `test-data/users.ts`
*   For preview: Ensure user creation endpoint is accessible
*   For staging/production: Verify API keys are correct

### Test Fails with "APIError: unauthenticated"

**Cause:** Invalid or expired token

**Solution:**

*   Regenerate token using `generateApiToken()`
*   Check token expiration
*   Verify user account exists in the environment
*   Ensure API key is valid (for staging/production)

### Test Fails with "Config file does not exist"

**Cause:** Environment configuration file missing

**Solution:**

*   Ensure `ENV` variable matches available config files
*   Check that `config/envs/<env>.env` exists
*   Verify environment name is correct (preview, staging-us, production)

### Client Initialization Fails

**Cause:** Invalid base URL or token

**Solution:**

*   Verify `API_BASE_URL` is set correctly
*   Check that `ENV.url` returns a valid URL
*   Ensure token is generated before client initialization
*   For staging: Use `initWithAPIKey()` if using API key authentication

### Tests Are Flaky

**Cause:** Network issues or timing problems

**Solution:**

*   Add retry logic in Playwright config (already configured)
*   Use appropriate timeouts for slow endpoints
*   Check network connectivity to API
*   Verify API is stable and not under heavy load

## Additional Resources

*   [Playwright Documentation: Fast and reliable end-to-end testing for modern web apps | Playwright](https://playwright.dev/)
*   **Project README**: `apps/test/api/README.md`
*   **Example Tests**:
    *   `tests/authentication/create-user-in-preview.api.test.ts`
    *   `tests/user/user-me.api.test.ts`
    *   `tests/booster/search-and-resolve-deals.api.test.ts`
    *   `tests/mad/inferpds.api.test.ts`

## 🔗 Related Documentation

*   [Testing: Github Web End-to-End Workflow](../monorepo-and-config/e2e-tests-workflow.md)
*   [Testing: Encore Github Triggers](../monorepo-and-config/github-pipeline-triggers.md)

