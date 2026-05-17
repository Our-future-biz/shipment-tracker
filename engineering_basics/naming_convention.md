# Naming Convention

## Overview

Naming conventions are **non-negotiable** in a professional codebase. They ensure that every developer can instantly understand the purpose, scope, and type of any file, class, function, or variable without reading documentation. This document defines strict naming rules for all code elements in the Encore TypeScript monorepo.

**These conventions are mandatory.** Code reviews will reject PRs that violate these standards.

---

## Table of Contents

1. [Repo-wide Directory and Scope Rules](#repo-wide-directory-and-scope-rules)
2. [File Naming](#file-naming)
3. [TypeScript Naming](#typescript-naming)
4. [Database Naming](#database-naming)
5. [API Endpoint Naming](#api-endpoint-naming)
6. [Variable and Function Naming](#variable-and-function-naming)
7. [Class Naming](#class-naming)
8. [Constants and Enums](#constants-and-enums)
9. [Common Anti-Patterns](#common-anti-patterns)
10. [Best Practices](#best-practices)

---

## Repo-wide Directory and Scope Rules

Five rules govern directory names, npm package scopes, and structural naming across the entire monorepo. These apply to **all new code** and guide incremental migration of existing code.

### Rule 1 — One npm scope: `@groupon/*`

All workspace packages use the `@groupon/*` scope. No `@grpn/*`, `@repo/*`, or unscoped packages.

```jsonc
// ✅ CORRECT
{ "name": "@groupon/encore-client" }
{ "name": "@groupon/lib" }

// ❌ WRONG
{ "name": "@grpn/encore-client" }
{ "name": "@repo/lib" }
{ "name": "encore-client" }           // unscoped
```

### Rule 2 — One casing: kebab-case for directories

All directories use kebab-case. No snake_case, camelCase, or PascalCase.

```
✅  third-party-apis/  api-parsing-and-formatting/  branch-helper/
❌  3partyApis/  api_parsing_and_formating/  branch_helper/
```

**Exception:** Tribe/system grouping prefixes (`_tribe_b2b`, `_core_system`, `_playground_and_poc`) use underscores as a visual grouping convention — this is intentional and allowed.

### Rule 3 — One underscore meaning: visual grouping only

Leading underscores in directory names mean **organizational grouping** (tribes, system categories). They are not used for any other purpose.

```
✅  _tribe_b2b/salesforce/   _core_system/user/
❌  _helpers/  _internal/  _deprecated/
```

### Rule 4 — One app suffix rule: `<domain>-<stack>`

Application directories follow `<domain>-<stack>` in kebab-case.

```
✅  admin-react-fe   encore-ts   support-angular-fe
❌  adminReactFe   encore_ts   Admin-React-FE
```

### Rule 5 — No unqualified grab-bag names

Top-level `utils/`, `lib/`, `common/`, `shared/`, `core/`, `helpers/` directories are not allowed unless they have a clear parent scope. Each must have a purpose documented in its `index.ts` or README.

```
✅  libs/core/  (scoped under libs, has README with charter)
✅  services/_tribe_b2b/salesforce/utils/  (scoped under a specific service)
❌  utils/  (top-level, no context)
❌  common/  (top-level, no context)
```

### Migration status

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 0 — Typo fixes | Done | Directory renames for typos and casing |
| Phase 1 — npm scope | Done | All packages now `@groupon/*` |
| Phase 2 — Service dir kebab-case | Planned | ~38 service/workflow dirs (per-tribe PRs) |
| Phase 3 — Grab-bag audit | Planned | ~135 grab-bag dirs audit |

---

## File Naming

### General Rules

**Primary rule:** File names must describe what they contain and use appropriate suffixes.

**Format:** `{name}.{type}.ts`

### Service Files

**Format:** `snake_case.service.ts`

```typescript
// ✅ CORRECT
user.service.ts
deal_review.service.ts
payment_processor.service.ts
ai_embedding_generator.service.ts

// ❌ WRONG
UserService.ts          // PascalCase not allowed
deal-review.service.ts  // kebab-case not allowed
userService.ts          // camelCase not allowed
service.ts              // No descriptive name
```

### Controller Files

**Format:** `{model}{Operation}.controller.ts` (camelCase)

**Public Controllers:**
```typescript
// ✅ CORRECT
userCreate.controller.ts
dealUpdate.controller.ts
orderGet.controller.ts
merchantDelete.controller.ts
reviewList.controller.ts

// ❌ WRONG
user-create.controller.ts    // kebab-case not allowed for controllers
UserCreate.controller.ts     // PascalCase not allowed
createUser.controller.ts     // Wrong order (operation before model)
user.controller.ts           // No operation specified
```

**Private Controllers (Internal APIs):**

**MANDATORY:** Private controllers **MUST** start with underscore `_`

```typescript
// ✅ CORRECT
_internalUserCreate.controller.ts
_systemHealthCheck.controller.ts
_internalDealSync.controller.ts
_debugStatus.controller.ts

// ❌ WRONG
internalUserCreate.controller.ts   // Missing underscore
_internal-user-create.controller.ts // kebab-case not allowed
_InternalUserCreate.controller.ts  // PascalCase not allowed
```

**Why underscore?**
- Signals to Encore: "This is private"
- Signals to developers: "Don't call from outside"
- Prevents accidental external exposure
- Makes code reviews easier

### Repository Files

**Format:** `{model}.repository.ts` (snake_case)

```typescript
// ✅ CORRECT
user.repository.ts
deal-review.repository.ts
merchant-profile.repository.ts
payment-transaction.repository.ts

// ❌ WRONG
UserRepository.ts           // PascalCase not allowed
user_repository.ts          // snake_case not allowed
userRepo.ts                 // Abbreviations not allowed
repository.ts               // No model name
```

### Schema Files

**Format:** `{model}.schema.ts` (snake_case)

```typescript
// ✅ CORRECT
user.schema.ts
deal.schema.ts
merchant-profile.schema.ts

// Relations files
user.relations.ts
deal.relations.ts
```

### Utility Files

**Format:** `{purpose}.utils.ts` or `{model}.utils.ts` (snake_case)

```typescript
// ✅ CORRECT
string.utils.ts
date.utils.ts
user.utils.ts
validation.utils.ts
formatting.utils.ts

// Generic utilities
utils.ts

// ❌ WRONG
StringUtils.ts              // PascalCase not allowed
string_utils.ts             // snake_case not allowed
helper.ts                   // Use 'utils' not 'helper'
```

### Interface/Type Files

**Format:** `{model}.interfaces.ts` or `interfaces.ts` (snake_case)

```typescript
// ✅ CORRECT
user.interfaces.ts
deal.interfaces.ts
interfaces.ts              // Universal DTOs

// ❌ WRONG
user.types.ts              // Use 'interfaces' not 'types'
UserInterfaces.ts          // PascalCase not allowed
```

### Test Files

**Format:** `{filename}.test.ts` (same name as tested file + `.test`)

```typescript
// ✅ CORRECT
user.service.ts          → user.service.test.ts
userCreate.controller.ts → userCreate.controller.test.ts
user.repository.ts       → user.repository.test.ts
string.utils.ts          → string.utils.test.ts

// ❌ WRONG
user.service.ts          → user.spec.ts          // Use .test not .spec
user.service.ts          → userService.test.ts   // Must match original name
user.service.ts          → test-user-service.ts  // Wrong format
```

### Configuration Files

**Format:** Depends on type

```typescript
// ✅ CORRECT
encore.service.ts          // Encore service config
drizzle.config.ts          // Drizzle configuration
db.ts                      // Database connection

// ❌ WRONG
encoreService.ts           // Use snake_case
EncoreService.ts           // No PascalCase
config.ts                  // Too generic
```

### PubSub Files

**Format:** `{topic}.{type}.ts` with underscore for private

```typescript
// ✅ CORRECT - Subscriptions (private)
_createUser.sub.ts
_dealUpdated.sub.ts
_orderCompleted.sub.ts

// ✅ CORRECT - Publishers (private)
_emitNewUser.pub.ts
_emitDealUpdate.pub.ts

// ❌ WRONG
createUser.sub.ts          // Missing underscore (should be private)
_create-user.sub.ts        // kebab-case not allowed
_CreateUser.sub.ts         // PascalCase not allowed
```

### Cron Files

**Format:** `{jobName}.cron.ts` (camelCase for job name)

```typescript
// ✅ CORRECT
dailyCleanup.cron.ts
hourlySync.cron.ts
weeklyReport.cron.ts

// ❌ WRONG
daily-cleanup.cron.ts      // kebab-case not allowed for cron
DailyCleanup.cron.ts       // PascalCase not allowed
```

### Bucket/Storage Files

**Format:** `{bucketName}.bucket.ts` (camelCase)

```typescript
// ✅ CORRECT
userAvatars.bucket.ts
dealImages.bucket.ts
invoices.bucket.ts

// ❌ WRONG
user-avatars.bucket.ts     // kebab-case not allowed for buckets
```

---

## TypeScript Naming

### Interfaces

**Format:** `PascalCase` with descriptive names

**API Interfaces:** `{Model}{Operation}{Type}`

```typescript
// ✅ CORRECT - API Interfaces
interface UserCreateRequest {
  name: string;
  email: string;
}

interface UserCreateResponse {
  user: User;
}

interface DealUpdateRequest {
  title?: string;
  price?: number;
}

interface DealUpdateResponse {
  deal: Deal;
}

// ✅ CORRECT - Domain Interfaces
interface User {
  id: string;
  name: string;
  email: string;
}

interface PaymentProcessor {
  process(amount: number): Promise<void>;
}

// ❌ WRONG
interface userCreateRequest { }      // camelCase not allowed
interface IUserCreateRequest { }     // No 'I' prefix
interface UserCreate { }             // Missing Request/Response suffix
interface CreateUserRequest { }      // Wrong order (operation before model)
interface user { }                   // camelCase not allowed for types
```

### Types

**Format:** `PascalCase`

```typescript
// ✅ CORRECT
type UserId = string;
type UserRole = "ADMIN" | "USER" | "GUEST";
type PaymentStatus = "pending" | "completed" | "failed";
type Optional<T> = T | undefined;

// ❌ WRONG
type userId = string;              // camelCase not allowed
type USERID = string;              // SCREAMING_CASE not allowed
type user_id = string;             // snake_case not allowed
```

### Classes

**Format:** `PascalCase` with type suffix

```typescript
// ✅ CORRECT - Services
class UserService { }
class DealReviewService { }
class PaymentProcessorService { }

// ✅ CORRECT - Repositories
class UserRepository { }
class DealRepository { }

// ✅ CORRECT - Utils/Helpers
class StringUtils { }
class ValidationUtils { }

// ✅ CORRECT - Other classes
class EmailSender { }
class CacheManager { }

// ❌ WRONG
class userService { }              // camelCase not allowed
class User_Service { }             // snake_case not allowed
class user_service { }             // snake_case not allowed
class Service { }                  // Too generic
class UserSvc { }                  // Abbreviations not allowed
```

### Enums

**Format:** `PascalCase` for enum name, `SCREAMING_SNAKE_CASE` for values

```typescript
// ✅ CORRECT
enum UserRole {
  ADMIN = "ADMIN",
  USER_ADMIN = "USER_ADMIN",
  USER = "USER",
  GUEST = "GUEST",
}

enum PaymentStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

// ❌ WRONG
enum userRole { }                  // camelCase not allowed
enum USER_ROLE { }                 // SCREAMING_SNAKE_CASE not allowed for enum name
enum UserRole {
  admin = "admin",                 // lowercase not allowed for enum values
  Admin = "Admin",                 // PascalCase not allowed for enum values
}
```

---

## Database Naming

### Tables

**Format:** `snake_case` (singular)

```sql
-- ✅ CORRECT
user
deal
merchant_profile
payment_transaction
deal_review
user_preference

-- ❌ WRONG
User                     -- PascalCase not allowed
users                    -- Plural not recommended
user-profile             -- Kebab-case not allowed
UserProfile              -- PascalCase not allowed
```

**Why singular?**
- Consistency with ORM patterns
- Clearer in code: `user.name` not `users.name`
- Better for relationships

### Columns

**Format:** `snake_case`

```sql
-- ✅ CORRECT
id
user_id
created_at
updated_at
deleted_at
email_address
first_name
last_name
is_active
is_deleted
phone_number
profile_photo_url

-- ❌ WRONG
userId                   -- camelCase not allowed
ID                       -- UPPERCASE not allowed
user-id                  -- kebab-case not allowed
createdAt                -- camelCase not allowed
EmailAddress             -- PascalCase not allowed
```

### Indexes

**Format:** `{table}_{column}_{type}`

```sql
-- ✅ CORRECT
user_email_idx
user_created_at_idx
user_deleted_at_idx
deal_merchant_id_idx
deal_created_at_idx

-- For unique indexes
user_email_unique

-- ❌ WRONG
idx_user_email           -- Wrong order
user_email               -- No suffix
userEmailIdx             -- camelCase not allowed
```

### Foreign Keys

**Format:** `{source_table}_{target_table}_fkey`

```sql
-- ✅ CORRECT
deal_merchant_fkey       -- deal.merchant_id references merchant.id
review_user_fkey         -- review.user_id references user.id
order_user_fkey          -- order.user_id references user.id

-- ❌ WRONG
fk_deal_merchant         -- Wrong order
deal_merchant            -- No suffix
```

---

## API Endpoint Naming

### Public API Endpoints

**Format:** `{model}{Operation}` (camelCase, no underscore)

```typescript
// ✅ CORRECT
export const userCreate = api({ ... });
export const userGet = api({ ... });
export const userUpdate = api({ ... });
export const userDelete = api({ ... });
export const userList = api({ ... });
export const dealSearch = api({ ... });
export const orderProcess = api({ ... });

// ❌ WRONG
export const createUser = api({ ... });      // Wrong order
export const _userCreate = api({ ... });     // Underscore for public API
export const UserCreate = api({ ... });      // PascalCase not allowed
export const user_create = api({ ... });     // snake_case not allowed
export const create = api({ ... });          // No model name
```

### Private API Endpoints

**Format:** `_{model}{Operation}` (camelCase with leading underscore)

```typescript
// ✅ CORRECT
export const _internalUserCreate = api({ ... });
export const _systemHealthCheck = api({ ... });
export const _internalDealSync = api({ ... });
export const _debugStatus = api({ ... });

// ❌ WRONG
export const internalUserCreate = api({ ... });   // Missing underscore
export const _internal_user_create = api({ ... }); // snake_case not allowed
export const _InternalUserCreate = api({ ... });  // PascalCase not allowed
```

### API Paths

**Format:** `/path/to/resource` (snake_case)

```typescript
// ✅ CORRECT
path: "/user"
path: "/user/:id"
path: "/user/me"
path: "/deal/search"
path: "/merchant-profile/:id"
path: "/payment-transaction/process"

// Private API paths
path: "/internal/user/create"
path: "/system/health"
path: "/debug/status"

// ❌ WRONG
path: "/User"                     // PascalCase not allowed
path: "/user_profile"             // snake_case not allowed
path: "/userProfile"              // camelCase not allowed
path: "/users"                    // Plural not recommended (use /user for list)
```

---

## Variable and Function Naming

### Variables

**Format:** `camelCase`

```typescript
// ✅ CORRECT - General variables
const userId = "123";
const userName = "John Doe";
const isActive = true;
const hasPermission = false;
const emailAddress = "user@example.com";
const createdAt = new Date();

// ✅ CORRECT - Arrays
const users = [];
const dealIds = [];
const paymentTransactions = [];

// ✅ CORRECT - Objects
const user = { id: "123", name: "John" };
const config = { apiKey: "..." };

// ❌ WRONG
const UserId = "123";            // PascalCase not allowed
const user_id = "123";           // snake_case not allowed
const USERID = "123";            // SCREAMING_SNAKE_CASE not allowed
const id = "123";                // Too generic
```

### Functions

**Format:** `camelCase` with verb prefix

```typescript
// ✅ CORRECT - Action verbs
function createUser() { }
function updateDeal() { }
function deleteOrder() { }
function getUserById() { }
function fetchDealList() { }
function validateEmail() { }
function processPayment() { }
function sendNotification() { }

// ✅ CORRECT - Boolean functions (is/has/can/should)
function isActive() { }
function hasPermission() { }
function canDelete() { }
function shouldRetry() { }

// ❌ WRONG
function CreateUser() { }        // PascalCase not allowed
function create_user() { }       // snake_case not allowed
function user() { }              // No verb
function get() { }               // Too generic
function doStuff() { }           // Vague name
```

### Async Functions

**Format:** Same as regular functions

```typescript
// ✅ CORRECT
async function fetchUser() { }
async function createDeal() { }
async function processPayment() { }

// ❌ WRONG
async function getUserAsync() { }     // No 'Async' suffix needed
async function asyncGetUser() { }     // No 'async' prefix needed
```

---

## Class Naming

### Private Fields and Methods

**Format:** Use `#` prefix for true private members

```typescript
// ✅ CORRECT
class UserService {
  #client: HttpClient;
  #redis: Redis;
  #apiKey: string;

  #validateData(data: any): boolean {
    return true;
  }

  #processInternal(): void {
    // Private method
  }

  // Public method
  public createUser(): void {
    this.#validateData({});
  }
}

// ❌ WRONG
class UserService {
  private client: HttpClient;      // Use # instead
  _client: HttpClient;             // Use # instead
  __client: HttpClient;            // Use # instead

  private validateData() { }       // Use # instead
  _validateData() { }              // Use # instead
}
```

**Why `#`?**
- True privacy (not accessible even with reflection)
- TypeScript and JavaScript standard
- Enforced by the runtime
- Clear intention

### Method Naming

**Format:** `camelCase` with verb prefix

```typescript
// ✅ CORRECT
class UserRepository {
  async findById(id: string): Promise<User | null> { }
  async findByEmail(email: string): Promise<User | null> { }
  async create(data: NewUser): Promise<User> { }
  async update(id: string, data: Partial<User>): Promise<User> { }
  async delete(id: string): Promise<void> { }
  async softDelete(id: string): Promise<void> { }
  async restore(id: string): Promise<User> { }
}

// ❌ WRONG
class UserRepository {
  async FindById() { }             // PascalCase not allowed
  async find_by_id() { }           // snake_case not allowed
  async getUser() { }              // Inconsistent naming (use find)
  async byId() { }                 // No verb
}
```

---

## Constants and Enums

### Constants

**Format:** `SCREAMING_SNAKE_CASE` for true constants

```typescript
// ✅ CORRECT - Module-level constants
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT = 5000;
const API_BASE_URL = "https://api.example.com";
const DEFAULT_PAGE_SIZE = 10;
const MAX_UPLOAD_SIZE_MB = 50;

// ✅ CORRECT - Configuration objects
const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
} as const;

// ❌ WRONG
const maxRetryAttempts = 3;      // camelCase not allowed for constants
const MaxRetryAttempts = 3;      // PascalCase not allowed for constants
const max_retry_attempts = 3;    // Use SCREAMING_SNAKE_CASE
```

### Readonly Values

**Format:** `camelCase` for readonly but not constant values

```typescript
// ✅ CORRECT
class UserService {
  private readonly serviceName = "user-service";
  private readonly version = "1.0.0";

  constructor(private readonly config: Config) { }
}

// Configuration that might change between instances
const config = {
  apiKey: process.env.API_KEY,
  timeout: parseInt(process.env.TIMEOUT || "5000"),
} as const;
```

---

## Common Anti-Patterns

### ❌ Anti-Pattern 1: Inconsistent Prefixes

```typescript
// ❌ WRONG - Mixing prefixes
interface IUser { }              // No 'I' prefix
type TUserId = string;           // No 'T' prefix
enum EUserRole { }               // No 'E' prefix
abstract class ABaseService { }  // No 'A' prefix

// ✅ CORRECT - No prefixes
interface User { }
type UserId = string;
enum UserRole { }
abstract class BaseService { }
```

### ❌ Anti-Pattern 2: Abbreviations

```typescript
// ❌ WRONG
const usr = getUser();
const addr = getAddress();
const qty = getQuantity();
const btn = document.querySelector('.btn');
const ctrl = new Controller();
const repo = new Repository();

// ✅ CORRECT
const user = getUser();
const address = getAddress();
const quantity = getQuantity();
const button = document.querySelector('.button');
const controller = new Controller();
const repository = new Repository();
```

**Exception:** Well-known abbreviations are OK
```typescript
// ✅ OK - Common abbreviations
const id = "123";
const url = "https://...";
const html = "<div>...</div>";
const api = new API();
const http = new HTTP();
const db = new Database();
```

### ❌ Anti-Pattern 3: Generic Names

```typescript
// ❌ WRONG - Too generic
function handle() { }
function process() { }
function execute() { }
function run() { }
function doStuff() { }
const data = getData();
const result = getResult();
const temp = getTempValue();

// ✅ CORRECT - Specific names
function handleUserCreation() { }
function processPayment() { }
function executeDealUpdate() { }
function runMigration() { }
function synchronizeDealData() { }
const userData = getUserData();
const paymentResult = processPayment();
const temporaryEmail = generateTempEmail();
```

### ❌ Anti-Pattern 4: Redundant Naming

```typescript
// ❌ WRONG
class UserClass { }              // Class suffix redundant
interface UserInterface { }      // Interface suffix redundant
type UserType = { };             // Type suffix redundant
const userVariable = "John";     // Variable suffix redundant
const userArray = [];            // Array suffix obvious from type

// ✅ CORRECT
class User { }
interface User { }
type User = { };
const user = "John";
const users = [];                // Plural indicates array
```

### ❌ Anti-Pattern 5: Hungarian Notation

```typescript
// ❌ WRONG - Type prefixes (Hungarian notation)
const strName = "John";
const intAge = 25;
const boolIsActive = true;
const arrUsers = [];
const objUser = {};
const fnCallback = () => {};

// ✅ CORRECT - Let TypeScript handle types
const name: string = "John";
const age: number = 25;
const isActive: boolean = true;
const users: User[] = [];
const user: User = {};
const callback: () => void = () => {};
```

---

## Best Practices

### 1. Be Descriptive but Concise

```typescript
// ❌ TOO SHORT
const u = getUser();
const d = new Date();
const fn = () => {};

// ❌ TOO LONG
const userDataFromDatabaseIncludingAllRelatedEntities = getUser();
const currentDateAndTimeFormatted = new Date();

// ✅ JUST RIGHT
const user = getUser();
const currentDate = new Date();
const handleUserClick = () => {};
```

### 2. Use Domain Language

```typescript
// ✅ CORRECT - Business domain terms
class MerchantService { }
class DealRepository { }
interface PaymentTransaction { }
const merchantId = "123";
const dealStatus = "active";

// ❌ WRONG - Generic terms
class BusinessService { }
class ItemRepository { }
interface Transaction { }
const entityId = "123";
const status = "active";
```

### 3. Consistent Verb Usage

**CRUD Operations - Use these verbs:**
- **Create:** `create`, `add`, `insert`
- **Read:** `get`, `find`, `fetch`, `list`, `search`
- **Update:** `update`, `modify`, `change`
- **Delete:** `delete`, `remove`, `destroy`

```typescript
// ✅ CORRECT - Consistent verbs
function createUser() { }
function getUser() { }
function updateUser() { }
function deleteUser() { }

// ❌ WRONG - Inconsistent verbs
function createUser() { }
function retrieveUser() { }        // Use 'get' not 'retrieve'
function modifyUser() { }          // Use 'update' not 'modify'
function removeUser() { }          // Use 'delete' not 'remove'
```

### 4. Boolean Naming

Use question prefixes: `is`, `has`, `can`, `should`, `will`, `did`

```typescript
// ✅ CORRECT
const isActive = true;
const hasPermission = false;
const canEdit = true;
const shouldRetry = false;
const willExpire = true;
const didComplete = false;

// ❌ WRONG
const active = true;               // Missing 'is'
const permission = false;          // Missing 'has'
const editable = true;             // Use 'canEdit'
```

### 5. Collections Naming

```typescript
// ✅ CORRECT - Plural for arrays
const users: User[] = [];
const deals: Deal[] = [];
const ids: string[] = [];

// ✅ CORRECT - Map/Record naming
const userMap: Map<string, User> = new Map();
const userById: Record<string, User> = {};
const idToUser: Map<string, User> = new Map();

// ❌ WRONG
const userList: User[] = [];      // Redundant 'List'
const userArray: User[] = [];     // Redundant 'Array'
const usersMap: Map<...> = ...;   // Wrong position of 'Map'
```

---

## Summary

### Quick Reference Table

| Element | Format | Example |
|---------|--------|---------|
| **Files** |
| Service | snake_case.service.ts | `user.service.ts` |
| Controller (public) | camelCase.controller.ts | `userCreate.controller.ts` |
| Controller (private) | _camelCase.controller.ts | `_internalUserCreate.controller.ts` |
| Repository | snake_case.repository.ts | `user.repository.ts` |
| Schema | snake_case.schema.ts | `user.schema.ts` |
| Utils | snake_case.utils.ts | `string.utils.ts` |
| Test | {filename}.test.ts | `user.service.test.ts` |
| **TypeScript** |
| Interface | PascalCase | `UserCreateRequest` |
| Type | PascalCase | `UserId` |
| Class | PascalCase | `UserService` |
| Enum | PascalCase | `UserRole` |
| Enum Value | SCREAMING_SNAKE_CASE | `USER_ADMIN` |
| Function | camelCase | `createUser` |
| Variable | camelCase | `userId` |
| Constant | SCREAMING_SNAKE_CASE | `MAX_RETRY_ATTEMPTS` |
| Private field | #camelCase | `#client` |
| **Database** |
| Table | snake_case (singular) | `user` |
| Column | snake_case | `created_at` |
| Index | {table}_{column}_idx | `user_email_idx` |
| Foreign Key | {source}_{target}_fkey | `deal_user_fkey` |
| **API** |
| Public Endpoint | camelCase | `userCreate` |
| Private Endpoint | _camelCase | `_internalUserCreate` |
| API Path | snake_case | `/user/:id` |

### Naming Checklist

Before committing code, verify:

- [ ] All file names follow conventions
- [ ] Private controllers start with `_`
- [ ] Classes use PascalCase with type suffix
- [ ] Functions use camelCase with verbs
- [ ] Variables use camelCase
- [ ] Constants use SCREAMING_SNAKE_CASE
- [ ] Database tables use snake_case (singular)
- [ ] Database columns use snake_case
- [ ] No abbreviations (except common ones)
- [ ] No generic names (data, result, temp)
- [ ] No Hungarian notation
- [ ] Boolean variables start with is/has/can/should
- [ ] Arrays use plural names
- [ ] Private class members use `#` prefix

---

**Remember: Naming is not just about convention—it's about communication. Good names make code self-documenting. Bad names create confusion and bugs.**
