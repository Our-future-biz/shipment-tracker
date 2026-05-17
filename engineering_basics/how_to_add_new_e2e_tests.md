# How to Add New E2E Tests to Groupon Admin

## Overview

This guide walks you through the process of creating new end-to-end tests for the Groupon Admin application using Playwright. The test suite follows the Page Object Model (POM) pattern and includes advanced features like deal pool management, role-based authentication, and multi-environment support.

## Prerequisites

Before adding new tests, ensure you have:

*   ✅ Node.js 22+ and pnpm 9.0.5+ installed
*   ✅ Playwright browsers installed (`pnpm install:browsers`)
*   ✅ Access to preview or staging environment
*   ✅ Familiarity with TypeScript and Playwright basics
*   ✅ Understanding of the Page Object Model pattern

## Step-by-Step Guide

### Step 1: Understand the Test Structure

The `web-e2e` project follows this structure:

```
web-e2e/
├── pages/              # Page Object Models (UI interactions)
├── tests/              # Test specifications
├── test-data/          # Test data and user roles
├── utils/              # Helper functions (auth, deal pool, API client)
└── config/envs/        # Environment configurations
```

**Key Concepts:**

*   **Page Objects**: Encapsulate page interactions and selectors
*   **Test Files**: Contain test scenarios using page objects
*   **Deal Pool**: Manages test data isolation for parallel execution
*   **Authentication**: Role-based auth system for different user types

### Step 2: Decide What You're Testing

Before writing code, identify:

| Question | Example Answer |
| :--- | :--- |
| **What feature are you testing?** | Editing deal titles |
| **Which pages are involved?** | Deal Detail Page, Deal Editor |
| **What user role is needed?** | Content Editor |
| **Does it modify deal data?** | Yes - requires deal pool |
| **What's the expected outcome?** | Title updated, publish button enabled |

### Step 3: Create or Update Page Object

If testing a new page or adding new interactions, create/update a Page Object.

> **Note**: Please create and/or update only necessary elements and pages for the test you target to write.

**Example: Creating a Page Object**

```typescript
// pages/DealDetailPage.ts
import { Page, expect } from "@playwright/test";

export class DealDetailPage {
  readonly page: Page;

  // Centralize all selectors in a locatorMap
  private locatorMap = {
    dealTitle: () => this.page.locator('h1, h2, [data-testid="deal-title"]'),
    contentTab: () => this.page.getByRole("tab", { name: /content/i }),
    titleInput: () => this.page.locator("div")
      .getByRole("combobox").first(),
    publishButton: () => this.page.getByRole("button", { name: /publish/i })
      .or(this.page.getByRole("button", { name: /send for approval/i })),
  };

  constructor(page: Page) {
    this.page = page;
  }

  // Navigation method
  async gotoContentTab(dealId: string) {
    await this.locatorMap.contentTab().click();
    await this.page.waitForLoadState("networkidle");
  }

  // Getter method
  async getTitleFromEditor(): Promise<string> {
    const titleInput = this.locatorMap.titleInput();
    await titleInput.waitFor({ state: "visible" });
    return await titleInput.innerText();
  }

  // Action method
  async updateTitle(newTitle: string) {
    const titleInput = this.locatorMap.titleInput();
    await titleInput.waitFor({ state: "visible" });
    await titleInput.clear();
    await titleInput.fill(newTitle);
    await titleInput.blur(); // Trigger autosave
    await this.page.waitForLoadState("networkidle");
  }

  // Verification method
  async verifyPublishButtonIsEnabled() {
    const publishButton = this.locatorMap.publishButton();
    await expect(publishButton).toBeEnabled();
  }
}
```

**Best Practices for Page Objects:**

*   ✅ Use `locatorMap` to organize all selectors
*   ✅ Use flexible selectors (role-based, multiple options with `.or()`)
*   ✅ Add explicit waits for reliability
*   ✅ Separate navigation, actions, and verifications into methods
*   ✅ Return data from getters, perform actions in methods

### Step 4: Create Your Test File

Create a new test file in the `tests/` directory following the naming convention: `<feature>.e2e.test.ts`

**Example: Basic Test Structure**

```typescript
// tests/edit-deals.e2e.test.ts
import { test } from "@playwright/test";
import { DealDetailPage } from "../pages/DealDetailPage";
import { AuthenticateUser } from "../utils/auth-helpers";
import { USER_ROLES } from "../test-data/users";

test.describe("Edit Deal", () => {
  test.describe("Title", () => {

    test.beforeEach(async ({ page }) => {
      // Authenticate with the appropriate role
      await AuthenticateUser(page, USER_ROLES.CONTENT_EDITOR);
    });

    test("Content Editors should be able to edit deal title", async ({ page }) => {
      const dealDetailPage = new DealDetailPage(page);

      // Step 1: Navigate to the page
      await page.goto(`/deals/detail?uuid=<deal-id>`);

      // Step 2: Perform actions
      const originalTitle = await dealDetailPage.getTitleFromEditor();
      const newTitle = `${originalTitle} [E2E Test ${Date.now()}]`;
      await dealDetailPage.updateTitle(newTitle);

      // Step 3: Verify expectations
      await dealDetailPage.verifyTitleInEditor(newTitle);
      await dealDetailPage.verifyPublishButtonIsEnabled();
    });
  });
});
```

### Step 5: Add Deal Pool Management (If Modifying Deals)

If your test modifies deal data, use the deal pool system to prevent conflicts in parallel execution.

**Example: Test with Deal Pool**

```typescript
import { test } from "@playwright/test";
import { DealDetailPage } from "../pages/DealDetailPage";
import { EncoreClientAuth } from "../utils/encore-client-auth";
import { env as ENV } from "../config/envs/env";
import { USER_ROLES } from "../test-data/users";
import { AuthenticateUser } from "../utils/auth-helpers";
import { getDealForWorker } from "../utils/deal-pool-manager";

test.describe("Edit Deal", () => {
  test.describe("Title", () => {
    let dealUid: string | null = null;

    test.beforeEach(async ({}, testInfo) => {
      // Get deal assigned to this worker
      dealUid = getDealForWorker(testInfo.parallelIndex);
      console.log(`Test using deal: ${dealUid}`);
    });

    test.afterEach(async () => {
      // Restore original state after test
      if (dealUid) {
        try {
          const encoreClient = await new EncoreClientAuth(ENV.api, ENV.token).init();
          await encoreClient.deal.undoAllVersions(dealUid);
          console.log(`✅ Cancelled all versions for deal: ${dealUid}`);
        } catch (error) {
          console.error("Failed to cancel all versions:", error);
        }
      }
      dealUid = null;
    });

    test("should edit deal title", async ({ page }) => {
      test.fail(dealUid === null, "No deal assigned to this worker");

      await AuthenticateUser(page, USER_ROLES.CONTENT_EDITOR);
      const dealId = dealUid as string;

      // Your test logic here...
    });
  });
});
```

**Why Use Deal Pool?**

*   ✅ Prevents conflicts when running tests in parallel
*   ✅ Ensures test data isolation
*   ✅ Automatically managed in global setup/teardown
*   ✅ Each parallel worker gets assigned specific deals

### Step 6: Add Authentication

Use the `AuthenticateUser` helper to authenticate with the appropriate role.

```typescript
import { AuthenticateUser } from "../utils/auth-helpers";
import { USER_ROLES } from "../test-data/users";

test.beforeEach(async ({ page }) => {
  // Choose the role based on what you're testing
  await AuthenticateUser(page, USER_ROLES.CONTENT_EDITOR);
  // Available roles: ADMIN, CONTENT_EDITOR, CONTENT_MODERATOR
});
```

**How It Works:**

*   `AuthenticateUser` retrieves the token for the specified role
*   Token is injected into `localStorage` as `grpn_admin_token`
*   Application automatically authenticates the user

### Step 7: Write Test Steps with Comments

Structure your test with clear steps and comments:

```typescript
test("Content Editors should be able to edit deal title and verify it was changed",
  { tag: [] },
  async ({ page }) => {
    test.fail(dealUid === null, "No deal assigned to this worker");

    await AuthenticateUser(page, USER_ROLES.CONTENT_EDITOR);
    const dealId = dealUid as string;
    const dealDetailPage = new DealDetailPage(page);

    // Step 1: Open deal editor
    await page.goto(`/deals/detail?uuid=${dealId}`);
    await dealDetailPage.isLoaded();
    await dealDetailPage.gotoContentTab(dealId);

    // Step 2: Update deal title
    await dealDetailPage.page.waitForTimeout(1000);
    const originalTitle = await dealDetailPage.getTitleFromEditor();
    const newTitle = `${originalTitle.slice(0, 80)} [E2E Test ${Date.now()}]`;
    await dealDetailPage.updateTitle(newTitle);

    // Step 3: Verify changes
    await dealDetailPage.verifyTitleInEditor(newTitle);
    await dealDetailPage.verifyPublishButtonIsEnabled();
  }
);
```

### Step 8: Run and Debug Your Test

**Run Locally Against Your Development Environment**

To run tests against your local development servers:

```bash
# Run your specific test against local environment
ENV=local pnpm test -- admin-react-fe --project=chromium tests/edit-deals.e2e.test.ts

# Run all tests locally
ENV=local pnpm test -- admin-react-fe --project=chromium
```

**Note**: Make sure your `local.env` file is configured with your local server URLs:
- `WEB_URL=http://localhost:3000` (your local frontend)
- `API_URL=http://127.0.0.1:4000` (your local backend)
- `TARGET=preview`

**Run Against Preview/Staging Environments**

```bash
# Set environment and run your specific test
ENV=preview pnpm test tests/edit-deals.e2e.test.ts

# Run in headed mode (see the browser)
ENV=preview pnpm test:headed tests/edit-deals.e2e.test.ts

# Run in debug mode
ENV=preview pnpm test:debug tests/edit-deals.e2e.test.ts
```

**Use Playwright UI Mode**

```bash
ENV=preview pnpm test:ui
```

This opens an interactive UI where you can:

*   ✅ Run tests step-by-step
*   ✅ Inspect page state
*   ✅ View console logs and network requests
*   ✅ Time-travel through test execution

### Step 9: Review and Refine

Before submitting your test, verify:

| Checklist Item | ✓ |
| :--- | :--- |
| Test follows Page Object Model pattern | □ |
| Uses `AuthenticateUser` for authentication | □ |
| Uses deal pool if modifying deals | □ |
| Includes proper cleanup in `afterEach` | □ |
| Selectors are flexible and resilient | □ |
| Test passes locally and in CI | □ |
| Test can run multiple times (idempotent) | □ |
| No hardcoded credentials or sensitive data | □ |
| Test has clear comments and descriptive names | □ |

## Common Test Patterns

### Pattern 1: Simple UI Validation (No Data Modification)

```typescript
test("should display correct deal information", async ({ page }) => {
  await AuthenticateUser(page, USER_ROLES.ADMIN);

  const dealDetailPage = new DealDetailPage(page);
  await page.goto(`/deals/detail?uuid=known-deal-id`);
  await dealDetailPage.isLoaded();

  await expect(page).toHaveURL(/\/deals\/detail/);
  await dealDetailPage.hasDealInfo();
});
```

### Pattern 2: Data Modification with Cleanup

```typescript
let dealUid: string | null = null;

test.beforeEach(async ({}, testInfo) => {
  dealUid = getDealForWorker(testInfo.parallelIndex);
});

test.afterEach(async () => {
  if (dealUid) {
    const client = await new EncoreClientAuth(ENV.api, ENV.token).init();
    await client.deal.undoAllVersions(dealUid);
  }
  dealUid = null;
});

test("should modify deal", async ({ page }) => {
  // Test logic
});
```

### Pattern 3: Multi-Step User Flow

```typescript
test("should complete full workflow", async ({ page }) => {
  await AuthenticateUser(page, USER_ROLES.CONTENT_EDITOR);

  const dealPage = new DealDetailPage(page);

  // Step 1: Navigate
  await page.goto("/deals/detail?uuid=deal-id");
  await dealPage.isLoaded();

  // Step 2: Perform first action
  await dealPage.gotoContentTab("deal-id");
  await dealPage.updateTitle("New Title");

  // Step 3: Perform second action
  await dealPage.clickPublish();

  // Step 4: Verify final state
  await expect(page).toHaveURL(/\/deals/);
});
```

## Best Practices

**✅ DO**

*   Use flexible selectors with multiple fallback options
*   Add explicit waits for dynamic content
*   Organize selectors in `locatorMap` within page objects
*   Clean up test data in `afterEach` hooks
*   Use role-based authentication via `AuthenticateUser`
*   Add descriptive comments for each test step
*   Use deal pool for tests that modify deals
*   Test locally before pushing to CI

**❌ DON'T**

*   Don't hardcode credentials or sensitive data
*   Don't use brittle selectors (e.g., `.class-name-123`)
*   Don't skip cleanup in `afterEach`
*   Don't modify deals outside the deal pool
*   Don't write tests that depend on each other
*   Don't commit environment files or tokens
*   Don't skip error handling in cleanup logic

## Troubleshooting

### Test Fails with "Deal pool file not found"

**Cause:** Global setup didn't run or failed

**Solution:**

```bash
# Delete existing pool and rerun
rm .test-deal-pool.json
ENV=staging pnpm test
```

### Test Fails with "Token not found for role"

**Cause:** Authentication wasn't set up properly

**Solution:**

*   Ensure ENV variable is set
*   Check environment config file exists in `config/envs/`
*   Verify API credentials are valid

### Selectors Don't Find Elements

**Cause:** UI changed or selector too specific

**Solution:**

*   Use Playwright Inspector to find correct selectors:
    ```bash
    ENV=staging pnpm test:debug
    ```
*   Add multiple selector options with `.or()`:
    ```typescript
    submitButton: () => this.page.getByRole("button", { name: /submit/i })
      .or(this.page.locator('[data-testid="submit-btn"]'))
    ```

### Tests Are Flaky

**Cause:** Race conditions or timing issues

**Solution:**

*   Add explicit waits:
    ```typescript
    await this.page.waitForLoadState("networkidle");
    await element.waitFor({ state: "visible" });
    ```
*   Use Playwright's auto-waiting features
*   Avoid hard-coded timeouts

## Additional Resources

*   [Playwright Documentation: Fast and reliable end-to-end testing for modern web apps | Playwright](https://playwright.dev/)
*   **Project README**: `apps/test/web-e2e/README.md`
*   **GitHub Workflow**: `.github/workflows/e2e-tests.yml`
*   **Example Test**: `tests/edit-deals.e2e.test.ts`

## 🔗 Related Documentation

*   [Testing: Github Web End-to-End Workflow](../monorepo-and-config/e2e-tests-workflow.md)
*   [Testing: Encore Github Triggers](../monorepo-and-config/github-pipeline-triggers.md)
