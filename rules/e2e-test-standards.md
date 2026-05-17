# E2E Test Standards — Playwright

This document defines best practices for writing E2E tests in `apps/test/web-e2e/`.
Use `tests/admin-react-fe/deal-detail/content-tab/title-section/` as the golden example
(along with `deal-detail/DealDetail.pom.ts` and `deal-detail/DealDetail.fixture.ts`).

## Architecture Overview

Everything is co-located by feature. No top-level `pages/`, `sections/`, or `fixtures/` directories.

```
apps/test/web-e2e/
├── tests/
│   ├── admin-react-fe/
│   │   ├── deal-detail/                             # One directory per page
│   │   │   ├── DealDetail.pom.ts                    # Page object (navigation, tabs, loading)
│   │   │   ├── DealDetail.fixture.ts                # Fixture (auth, nav, cleanup)
│   │   │   ├── content-tab/                         # One directory per tab
│   │   │   │   ├── title-section/                   # One directory per section
│   │   │   │   │   ├── TitleSection.pom.ts          # Section object (fields, validation, expand)
│   │   │   │   │   └── TitleSection.test.ts         # Tests
│   │   │   │   ├── description-section/
│   │   │   │   │   └── DescriptionSection.test.ts
│   │   │   │   └── ...
│   │   │   ├── overview-tab/
│   │   │   │   └── OverviewTab.test.ts
│   │   │   └── settings-tab/
│   │   │       └── SettingsTab.test.ts
│   │   └── create-deal/
│   │       ├── CreateDealModal.pom.ts
│   │       ├── SelectMerchantModal.pom.ts
│   │       └── CreateDeal.test.ts
│   └── aidg-react-fe/
│       └── aidg-preview/
│           ├── AIDGHome.pom.ts
│           ├── AIDGPreview.pom.ts
│           └── AIDGPreviewP0Flows.test.ts
├── utils/                 # Shared utilities (auth, deal pool, lifecycle)
└── test-data/             # Test constants and user config

packages/lib/src/test-ids/  # Shared test-id constants (FE + E2E contract)
```

### File Naming Convention

All files use `<PascalCaseName>.<type>.ts` format:

| Type | Suffix | Example |
|------|--------|---------|
| Page object | `.pom.ts` | `DealDetail.pom.ts` |
| Section object | `.pom.ts` | `TitleSection.pom.ts` |
| Fixture | `.fixture.ts` | `DealDetail.fixture.ts` |
| Test | `.test.ts` | `TitleSection.test.ts` |

Folder names use kebab-case: `deal-detail/`, `content-tab/`, `title-section/`.

### Co-location Principles

- **Page object** lives in the page directory: `deal-detail/DealDetail.pom.ts`
- **Fixture** lives in the page directory: `deal-detail/DealDetail.fixture.ts`
- **Section objects** live in their section directory: `title-section/TitleSection.pom.ts`
- **Tests** live next to their section/page object: `title-section/TitleSection.test.ts`
- Each page, tab, and section gets its own directory

### Pages vs Sections

Both use the `.pom.ts` suffix — same pattern (locators + methods for a piece of UI). The difference is scope:

- **Page object** — cross-section concerns: navigation, tab switching, loading states.
  Example: `DealDetail.pom.ts`. Lives at the page directory level.
- **Section object** — section-specific concerns: field interactions, validation, expand/collapse.
  Example: `TitleSection.pom.ts`. Lives next to its test in the section directory.

Do not put section-specific methods in page objects.

### Cross-feature imports

If a test needs a page object from another feature (e.g., navigating from deal-list to deal-detail),
import it explicitly: `import { DealDetailPage } from "../../deal-detail/DealDetail.pom"`.
This makes cross-feature dependencies visible.

## 1. Selectors — Use Shared Test IDs

**Never use CSS classes, DOM structure, or heading text to locate elements.**
Use `data-testid` attributes with constants shared between frontend and E2E.

### The Contract

Test ID constants live in `packages/lib/src/test-ids/` and are imported by both:
- **Frontend components**: `import { TITLE_SECTION_TEST_IDS } from "@groupon/lib/test-ids"`
- **E2E section objects**: same import

This guarantees compile-time breakage if a test ID is renamed or removed.

### Creating Test IDs for a New Section

1. Create `packages/lib/src/test-ids/<section-name>.ts`:
```ts
export const MY_SECTION_TEST_IDS = {
  section: "my-section",
  titleInput: "my-section-title-input",
  titleError: "my-section-title-error",
  titleCounter: "my-section-title-counter",
} as const;
```

2. Export from `packages/lib/src/test-ids/index.ts`
3. Add `data-testid={MY_SECTION_TEST_IDS.titleInput}` to the React component
4. Use `page.getByTestId(MY_SECTION_TEST_IDS.titleInput)` in the section object

### Important: Ensure Components Forward `data-testid`

Many components don't accept `data-testid` by default. Before writing tests, verify the
component forwards the prop to a DOM element. If not, add it:

```ts
// In the component's interface
interface MyComponentProps {
  "data-testid"?: string;
}

// In the component's destructuring
const MyComponent = ({ "data-testid": testId, ...props }: MyComponentProps) => {
  return <div data-testid={testId}>...</div>;
};
```

Check the full chain — if `ComponentA` passes `data-testid` to `ComponentB`, ensure `ComponentB`
also forwards it to the DOM. A missing link in the chain means the test ID never reaches the browser.

### Naming Convention

- Kebab-case: `title-field-error`, `gallery-title-char-counter`
- Prefix with section for uniqueness: `title-input` not just `input`
- Suffix with role: `-input`, `-error`, `-counter`, `-button`

### Never Hardcode Test ID Strings in Selectors

When building composite selectors (e.g., filtering by test-id AND data attribute), always use the shared constant — never the raw string:

```ts
// BAD — breaks silently if test-id is renamed in the frontend
page.locator('[data-testid="version-card"][data-status="draft"]');

// GOOD — compile-time safety via shared constant
page.locator(`[data-testid="${TID.versionCard}"][data-status="draft"]`);

// BEST — extract a helper in the POM for reuse
private cardWithStatus = (status: string) =>
  this.page.locator(`[data-testid="${TID.versionCard}"][data-status="${status}"]`);
```

### When Test IDs Don't Exist Yet

If a component lacks test IDs, **add them to the frontend component first**, then write the test.
Do not use fragile fallback selectors (CSS classes, DOM hierarchy, heading regex).

Exception: `getByRole("heading", ...)` is acceptable for detecting locale-specific content
that varies dynamically (e.g., "Short Descriptor" vs "Medium Descriptor").

## 2. Section Objects — One Per UI Section

### Structure

```ts
// tests/.../content-tab/title-section/TitleSection.pom.ts
import { TITLE_SECTION_TEST_IDS as TID } from "@groupon/lib/test-ids";

export class TitleSection {
  readonly page: Page;

  // Locators as public readonly methods — tests can use them for waitFor()
  readonly titleInput = () => this.page.getByTestId(TID.titleInput);
  readonly titleError = () => this.page.getByTestId(TID.titleError);

  // Read
  async getTitle(): Promise<string> { ... }

  // Update (sets up waitForResponse BEFORE blur)
  async updateTitle(value: string) { ... }

  // Verify (uses Playwright auto-retry assertions)
  async verifyTitle(expected: string) {
    await expect(this.titleInput()).toContainText(expected, { timeout: 5000 });
  }

  // Validation (uses Playwright auto-retry assertions)
  async expectTitleError(substring: string) {
    await expect(this.titleError()).toContainText(substring, { ignoreCase: true, timeout: 5000 });
  }
  async expectNoTitleError() {
    await expect(this.titleError()).toBeHidden({ timeout: 5000 });
  }

  // Generic helpers
  async clearFieldAndBlur(input: Locator) { ... }
}
```

### Rules

- Locators are public readonly methods — tests can use them directly for `waitFor()` or raw assertions
- **Verify methods must use Playwright auto-retry assertions** (`toContainText`, `toBeHidden`, etc.)
  not one-shot reads like `expect(await getText()).toContain(...)` which fail on timing
- **Expect methods for validation** — provide `expectTitleError(substring)` and `expectNoTitleError()`
  so tests are one-liners instead of a 3-step waitFor + getError + assert pattern
- Provide `clearFieldAndBlur(locator)` as a generic helper — validation tests reuse it
- Set up `waitForResponse` BEFORE the action that triggers it (e.g., before blur)
- Never expose raw selectors — everything goes through `getByTestId()`

## 3. Fixtures — Eliminate Boilerplate

Use Playwright's `test.extend()` to create fixtures that handle auth, navigation, and cleanup.
Tests should receive ready-to-use section objects.

```ts
// tests/.../deal-detail/DealDetail.fixture.ts
export const test = base.extend<{
  dealContext: DealTestContext;
  dealDetailPage: DealDetailPage;
  titleSection: TitleSection;
}>({
  dealContext: async ({}, use, testInfo) => {
    const context = await setupDealTest(testInfo);
    await use(context);
    await context.cleanup();
  },
  dealDetailPage: async ({ page, dealContext }, use) => {
    await AuthenticateUser(page, USER_ROLES.CONTENT_EDITOR);
    const dealDetailPage = new DealDetailPage(page);
    await page.goto(`/deals/detail?uuid=${dealContext.dealUid}`);
    await dealDetailPage.isLoaded();
    await dealDetailPage.gotoContentTab(dealContext.dealUid);
    await use(dealDetailPage);
  },
  titleSection: async ({ page, dealDetailPage: _nav }, use) => {
    // _nav dependency ensures navigation completed before section is used
    await use(new TitleSection(page));
  },
});
```

### Fixture dependency ordering

Use parameter naming to document dependencies:
- `dealDetailPage: _nav` — the fixture isn't used directly, it just forces navigation to complete
- Always declare dependencies explicitly — Playwright runs fixtures in dependency order

### Test becomes minimal

```ts
import { test, expect } from "../../DealDetail.fixture";

test("should edit title", async ({ titleSection }) => {
  const original = await titleSection.getTitle();
  const suffix = `[E2E ${Date.now()}]`;
  await titleSection.updateTitle(`${original.slice(0, 80)} ${suffix}`);
  await titleSection.verifyTitle(suffix);
});
```

### Tests that need page-level access

Some tests need `page` or `dealDetailPage` directly (e.g., reload, keyboard shortcuts).
Declare them in the test signature:

```ts
test("should persist after reload", async ({ page, dealDetailPage, titleSection, dealContext }) => {
  // ... edit ...
  await page.reload();
  await dealDetailPage.isLoaded();
  await dealDetailPage.gotoContentTab(dealContext.dealUid);
  // ... verify ...
});
```

Do NOT use dynamic imports to re-create page objects after reload — use the fixture instance.

## 4. Async Patterns — No Artificial Waits

### Banned

- `page.waitForTimeout()` — never use fixed sleeps
- `page.waitForLoadState("networkidle")` — deal pages have continuous background fetches (version polling, sync status, websocket heartbeats) that prevent networkidle from ever resolving. Use `domcontentloaded` + wait for a specific element instead.
- `setTimeout` / `sleep` in test code
- Polling loops with arbitrary intervals

### Required

- `locator.waitFor({ state: "visible" })` — wait for elements
- `page.waitForResponse(predicate)` — wait for API calls
- `expect(locator).toContainText(text, { timeout })` — Playwright auto-retry assertions
- `Promise.race([...])` — when multiple outcomes are possible (e.g., "Edit anyway" banner OR input)

### Page Reload Pattern

After `page.reload()`, wait for a specific element — not networkidle:
```ts
await page.reload({ waitUntil: "domcontentloaded" });
const contentTab = page.getByRole("tab", { name: /content/i });
await contentTab.waitFor({ state: "visible", timeout: 30000 });
await contentTab.click();
```

### Autosave Pattern

Set up the response listener BEFORE triggering the action:
```ts
// Correct — listener is ready before blur fires the PATCH
const saveResponse = this.page.waitForResponse(
  resp => resp.url().includes("/deals") && resp.request().method() === "PATCH",
  { timeout: 5000 },
);
await input.blur();
await saveResponse.catch(() => {});
```

### "Edit Anyway" Banner

Some deals show a "Still syncing..." banner. Handle it with a race:
```ts
const first = await Promise.race([
  titleInput.waitFor({ state: "visible", timeout: 20000 }).then(() => "input" as const),
  editAnywayButton.waitFor({ state: "visible", timeout: 20000 }).then(() => "editAnyway" as const),
]);
if (first === "editAnyway") {
  await editAnywayButton.click();
  await titleInput.waitFor({ state: "visible", timeout: 10000 });
}
```

## 5. Self-Verifying POM Actions

**Every POM action must verify its outcome.** A click that doesn't produce the expected result is silently lost — the test hangs waiting for a state that never comes.

### Pattern: Action + Verification in a Retry Loop

```ts
// BAD — fire and forget. If the click misses (element re-rendered), test hangs.
async clickSendForApproval() {
  await this.sendButton().click();
}

// GOOD — retries the full action until the outcome is observed.
async sendForApprovalAndVerify() {
  await expect(async () => {
    const btn = this.sendButton().first();
    await expect(btn).toBeEnabled({ timeout: 5000 });
    await btn.click();
    await this.waitForCardWithStatus("waiting", 10000);
  }).toPass({ timeout: 30000 });
}
```

### Pattern: Expand + Click Action Button

Card expansion can fail silently (element detached, animation interrupted). Always verify the action button appeared:

```ts
// BAD — if expand fails, button never appears, test hangs
async approveVersion() {
  await this.expandCard("waiting");
  await this.approveButton().click();
}

// GOOD — retries expand+click until the button is found and clicked
async approveVersion() {
  await expect(async () => {
    await this.expandCard("waiting");
    const btn = this.approveButton().first();
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
  }).toPass({ timeout: 30000 });
}
```

### Pattern: Cross-User Propagation

When one user makes a change and another user needs to see it, a single reload is not enough — the backend may not have propagated the change yet:

```ts
// BAD — single reload, fails if backend is slow
await moderatorPage.reload();
await versioning.waitForCardWithStatus("waiting");

// GOOD — retry reload until the expected state appears
async reloadUntilCardVisible(status: string, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await this.reloadAndGoToContentTab();
    const count = await this.page.locator(`[data-testid="version-card"][data-status="${status}"]`).count();
    if (count > 0) return;
    await this.page.waitForTimeout(2000);
  }
  await this.reloadAndGoToContentTab();
  await this.waitForCardWithStatus(status, 10000);
}
```

## 6. Multi-Role Test Fixtures

### Lazy Context Creation

Multi-role tests (editor + moderator) create 2 browser contexts. Don't fully load the page for both upfront — the moderator context sits idle while the editor acts:

```ts
// BAD — both contexts load the full page during fixture setup (slow, wasteful)
moderatorPage: async ({ browser, dealContext }, use) => {
  const { context, page } = await createAuthenticatedPage(browser, role, dealUid);
  await use(page);
  await context.close();
}

// GOOD — moderator context only does auth + lightweight navigation
moderatorPage: async ({ browser, dealContext }, use) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await AuthenticateUser(page, role);
  await page.goto(`/deals/detail?uuid=${dealUid}`, { waitUntil: "domcontentloaded" });
  await use(page);
  await context.close();
}
```

The test calls `reloadAndGoToContentTab()` when it needs the moderator — by then the backend state is ready.

### Token Refresh After Role Update

In preview environments, `createUserInPreviewEnvironment` returns a JWT with the default role. If you update the role via `userUpdate`, the original JWT still has the old roles. Re-call `createUserInPreviewEnvironment` to get a fresh token:

```ts
// After role update, refresh the token
await adminClient.user.userUpdate(userId, { roles: [userType] });
const refreshed = await encoreClient.authentication.createUserInPreviewEnvironment({
  email: account.email,
  name: account.username,
});
return refreshed.token; // JWT now has the updated roles
```

## 7. Test Data — Deal Pool

Tests use a pre-allocated deal pool (not local draft deals).

- `global-setup.ts` reserves 8 deals via `dealsSearchV2` with `status: ["launched"]` filter — launched deals are guaranteed to have title, options, and merchant data
- If no local deals exist, `syncDealsFromStaging()` fetches and syncs launched deals from staging
- Each parallel worker gets a unique deal via round-robin
- `afterEach` calls `undoAllVersions()` to revert changes
- Pool is cached in `.test-deal-pool.json` (24h TTL) — subsequent runs reuse it instantly
- Minimum pool size is 6 — below this, tests fail rather than share deals (prevents race conditions)

### Pool Performance

- **Filter at query time**: use `status: ["launched"]` in `dealsSearchV2` to get healthy deals directly. Never fetch all deals and health-check each one — that's 4 API calls per deal and most fail.
- **Don't delete the pool file** between runs — it's cached for 24h and reused instantly.
- **Tagged pool (CCT, getaway)** syncs from staging after the general pool is saved — tests that need tagged deals skip gracefully if sync is slow.

## 8. Test Organization

### File Naming

`<SectionName>.test.ts` — one test file per section, PascalCase to match the class name.

### Test Grouping

Use `test.describe()` for top-level grouping. Use section comments (`// === Category ===`) within,
not nested describes — keeps the structure flat and readable:
```
Content Tab - Title Section
  // ==================== Field Editing ====================
  ├── should edit Deal Page Title and autosave
  ├── should edit Gallery Title and autosave
  ├── should expand and edit Descriptor
  ├── should edit locale-specific descriptor
  // ==================== Expand / Collapse ====================
  ├── should toggle expand/collapse
  // ==================== Validation & Character Counter ====================
  ├── should show required error when Title cleared
  ...
```

### What to Test per Section

| Category | What to cover |
|----------|--------------|
| Field editing | Edit each field, verify autosave |
| Expand/collapse | Toggle visibility of hidden fields |
| Validation | Required (clear + blur), max length (exceed limit + blur) |
| Validation recovery | Error disappears when valid input entered |
| Character counter | Format (N/M), red when exceeded |
| Persistence | Edit → reload → verify value survived |
| Interactive widgets | Autocomplete, dropdowns, toggles |

### What NOT to Test in Section E2E

- Versioning/approval workflows (tested separately)
- "Saving..." indicator timing (React rendering concern)
- Paste behavior (unit test territory)
- Real-time counter updates during typing (unit test territory)

## 9. Style Rules

- No `console.log` in tests — Playwright reporter shows pass/fail
- No comments restating what the code does — only "why" comments for non-obvious behavior
- Test names should read as behavior: `"should edit Gallery Title and autosave"`
- Use `Date.now()` suffix for uniqueness: `[E2E ${Date.now()}]`
- Use `.slice(0, N)` to keep edited values within character limits
- No dynamic imports — use fixture instances directly (even after page reload)

## 10. Running Tests

All commands run from `apps/test/web-e2e/`.

The `ENV` variable selects the config file from `config/envs/<ENV>.env` (sets `API_URL`, `WEB_URL`, etc.).

```bash
# Run a specific section (chromium only — fastest for development)
ENV=local npx playwright test tests/admin-react-fe/deal-detail/content-tab/title-section/ --project=chromium

# Run across all browsers (chromium, firefox, webkit)
ENV=local npx playwright test tests/admin-react-fe/deal-detail/content-tab/title-section/

# Run all deal-detail tests
ENV=local npx playwright test tests/admin-react-fe/deal-detail/

# Headed mode — watch in browser
ENV=local npx playwright test tests/... --headed

# Interactive UI mode — step through with Playwright UI
ENV=local npx playwright test tests/... --ui

# Debug mode — Playwright Inspector, step line-by-line
ENV=local npx playwright test tests/... --debug
```

### Available environments

| ENV | Target | When to use |
|-----|--------|-------------|
| `local` | `localhost:3000` + local Encore (`127.0.0.1:4000`) | Local development. Auto-syncs deals from staging if local DB is empty. |
| `preview` | Preview deployment | Encore preview namespaces. |
| `staging` | `admin-staging.groupondev.com` | Staging environment with real data. |
| `production` | Production | Read-only smoke tests only. |

### First-time local setup

1. Start your local frontend (`localhost:3000`) and Encore backend (`127.0.0.1:4000`)
2. Run `npx playwright install` to install browser binaries (one-time)
3. Create `config/envs/local.env.local` (untracked) with your staging API key:
   ```
   STAGING_API_KEY=grpn_...
   ```
   This enables auto-syncing real deals from staging into your local DB.
   Get the key from the staging admin account in `test-data/users.ts`.
4. Run tests with `ENV=local` — deals will auto-sync from staging on first run

## 11. Checklist for New Section Tests

1. [ ] Create test-id constants in `packages/lib/src/test-ids/<section>.ts`
2. [ ] Export from `packages/lib/src/test-ids/index.ts`
3. [ ] Add `data-testid` attributes to frontend components (verify full forwarding chain)
4. [ ] Create section directory and object: `tests/.../<tab>/<section-name>/<SectionName>.pom.ts`
5. [ ] Add section to the page's fixture (e.g. `tests/.../deal-detail/DealDetail.fixture.ts`)
6. [ ] Write tests importing from the fixture
7. [ ] Run across all browsers: `ENV=local pnpm test tests/path/to/test.ts`
8. [ ] Verify zero `waitForTimeout` calls in new code
9. [ ] Verify all locators use `getByTestId()` with shared constants
10. [ ] Verify all assertions use Playwright auto-retry (`toContainText`, `toBeHidden`) not one-shot reads
