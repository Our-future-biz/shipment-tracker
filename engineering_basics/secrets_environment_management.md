# Secrets & Environment Management

## Overview

Encore provides a robust system for managing secrets, environment variables, and configuration across different deployment environments. This document defines how to properly define, use, and manage sensitive configuration in Encore TypeScript services.

---

## Core Principles

1. **Never hardcode secrets** in source code
2. **Secrets are environment-specific** (local, staging, production)
3. **Secrets are defined once**, accessed many times
4. **Type-safe secret access** using Encore's `secret()` function
5. **Service configuration centralized** in `encore.service.ts`
6. **Environment detection** automatic per deployment

---

## Secret Definition

### Location

**All secrets are defined in:** `encore.service.ts`

This is the root configuration file for each Encore service.

### Basic Secret Declaration

```typescript
import { secret } from "encore.dev/config";

// ==== SERVICE SECRETS ================================

// API Keys
const OPENAI_API_KEY = secret("OPENAI_API_KEY");
const ANTHROPIC_API_KEY = secret("ANTHROPIC_API_KEY");
const STRIPE_SECRET_KEY = secret("STRIPE_SECRET_KEY");

// Database credentials (if not using Encore's built-in DB)
const EXTERNAL_DB_URL = secret("EXTERNAL_DB_URL");

// Third-party services
const SENDGRID_API_KEY = secret("SENDGRID_API_KEY");
const AWS_ACCESS_KEY_ID = secret("AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = secret("AWS_SECRET_ACCESS_KEY");

// Authentication
const JWT_SECRET = secret("JWT_SECRET");
const OAUTH_CLIENT_SECRET = secret("OAUTH_CLIENT_SECRET");
```

### Secret Naming Conventions

**Format:** `{SERVICE}_{RESOURCE}_{TYPE}`

**Examples:**
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `AWS_ACCESS_KEY_ID`
- `REDIS_CONNECTION_URL`
- `GITHUB_WEBHOOK_SECRET`

**Rules:**
- Use UPPERCASE with underscores
- Be descriptive and specific
- Prefix with service name when applicable
- Suffix with type (KEY, SECRET, TOKEN, URL, etc.)

---

## Using Secrets

### Accessing Secret Values

Secrets are **functions** that return the secret value:

```typescript
import { secret } from "encore.dev/config";

const OPENAI_API_KEY = secret("OPENAI_API_KEY");

// ❌ WRONG: Accessing secret directly
const apiKey = OPENAI_API_KEY; // This is a function!

// ✅ CORRECT: Call the secret function
const apiKey = OPENAI_API_KEY(); // Returns the actual value
```

### Using Secrets in Service Configuration

```typescript
import { secret } from "encore.dev/config";
import { Service } from "encore.dev/service";
import { OpenAI } from "openai";
import { Stripe } from "stripe";

// ==== SERVICE SECRETS ================================
const OPENAI_API_KEY = secret("OPENAI_API_KEY");
const STRIPE_SECRET_KEY = secret("STRIPE_SECRET_KEY");

// ==== SERVICE CONSTANTS ==============================

/**
 * OpenAI client instance
 * Configured with API key from secrets
 */
export const openAIClient = new OpenAI({
  apiKey: OPENAI_API_KEY(), // Call the secret function
});

/**
 * Stripe client instance
 * Configured with secret key from environment
 */
export const stripeClient = new Stripe(STRIPE_SECRET_KEY(), {
  apiVersion: "2023-10-16",
});

// ==== ENCORE CONFIG ==================================

export default new Service("payment", {
  middlewares: [errorMiddleware],
});
```

### Using Secrets in Environment Variables

Sometimes external libraries expect environment variables:

```typescript
import { secret } from "encore.dev/config";

// Define secrets
const OPENAI_API_KEY = secret("OPENAI_API_KEY");
const LANGSMITH_API_KEY = secret("LANGSMITH_API_KEY");

// ==== SERVICE CONFIG =================================

// Set environment variables for external libraries
process.env.OPENAI_API_KEY = OPENAI_API_KEY();
process.env.LANGSMITH_API_KEY = LANGSMITH_API_KEY();
process.env.LANGSMITH_TRACING = "true";

// Now external libraries can access these via process.env
```

---

## Setting Secrets

### Environment Types

Encore supports three environment types:

1. **local** - Local development on your machine
2. **development** - Staging/development environment
3. **production** - Production environment

### Setting Secrets via CLI

**Local development:**

```bash
encore secret set --type local OPENAI_API_KEY
# Paste your secret value when prompted
```

**Staging/Development:**

```bash
encore secret set --type development OPENAI_API_KEY
# Paste your secret value when prompted
```

**Production:**

```bash
encore secret set --type production OPENAI_API_KEY
# Paste your secret value when prompted
```

### Setting Multiple Secrets

```bash
# Set multiple secrets for local development
encore secret set --type local OPENAI_API_KEY
encore secret set --type local STRIPE_SECRET_KEY
encore secret set --type local SENDGRID_API_KEY
```

### Viewing Secret Names (Not Values)

```bash
# List all secret names
encore secret list

# View secrets for specific environment
encore secret list --type local
encore secret list --type development
encore secret list --type production
```

**Note:** You **cannot** view secret values after setting them. This is a security feature.

---

## Service Configuration Structure

### Complete encore.service.ts Template

```typescript
import { errorMiddleware } from "@core/middleware/error";
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

// External API Keys
export const OPENAI_API_KEY = secret("OPENAI_API_KEY");
export const ANTHROPIC_API_KEY = secret("ANTHROPIC_API_KEY");

// Database & Cache
const REDIS_URL = secret("REDIS_COMMON_ENCORE");

// Third-party Services
const LANGFUSE_SECRET_KEY = secret("LANGFUSE_SECRET_KEY");
const LANGFUSE_PUBLIC_KEY = secret("LANGFUSE_PUBLIC_KEY");

// Authentication & Authorization
export const SERVICE_ACCOUNT_KEY = secret("ENCORE_SERVICE_ACCOUNT_KEY");

// ==== SERVICE CONSTANTS ===============================================================================================

/**
 * Maximum file upload size in bytes
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Default pagination limit
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Redis client instance
 */
export const redisClient = await new RedisService(
  REDIS_URL(),
  "ai_gateway"
).connect();

/**
 * Public bucket for user profile photos
 */
export const profilePhotosBucket = new Bucket("profile-photos", {
  versioned: false,
  public: true,
});

/**
 * Base URL for external LiteLLM service
 */
export const liteLLMBaseURL = "http://litellm.groupondev.com";

// ==== SERVICE CONFIG =================================================================================================

// Configure external library environment variables
process.env.OPENAI_API_KEY = OPENAI_API_KEY();
process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY();
process.env.LANGSMITH_TRACING = "true";

// ==== ENCORE CONFIG ==================================================================================================

/**
 * AI Gateway Service
 *
 * Aggregates external AI providers and tooling behind a unified gateway.
 * Proxies requests to LiteLLM/OpenAI/Anthropic and integrates LangSmith/LangChain/Langfuse.
 */
export default new Service("ai_gateway", {
  middlewares: [errorMiddleware],
});

// ==== ORR GLOBAL GROUPON SERVICE CONFIG ==============================================================================

/**
 * ORR Management for this service
 * - Required for every Encore Service!
 */
registerService(appMeta(), () =>
  service_management._encoreServiceAdd(
    new GrouponServiceProvider("ai_gateway", {
      name: "AI Gateway",
      description: "Unified AI gateway: proxies to LiteLLM/OpenAI/Anthropic and integrates LangSmith/LangChain/Langfuse.",
      supportModules: true,

      // Common configuration (varies by service category)
      // For tribe-specific configs, see:
      // - B2B Tribe: apps/encore-ts/services/_tribe_b2b/b2b.orr.ts
      // - B2C Tribe: apps/encore-ts/services/_tribe_b2c/b2c.orr.ts
      // - Core Tribe: apps/encore-ts/services/_tribe_core/core.orr.ts
      // - Marketing Tribe: apps/encore-ts/services/_tribe_marketing/marketing.orr.ts
      ..._core_system_config,

      // ORR
      ..._coreORRServiceConfig,
    }).init()
  )
);
```

---

## Service Constants vs Secrets

### Secrets (Sensitive Data)

**Use `secret()` for:**
- API keys
- Authentication tokens
- Database credentials
- Private keys
- OAuth client secrets
- Webhook secrets
- Encryption keys

```typescript
const STRIPE_SECRET_KEY = secret("STRIPE_SECRET_KEY");
const JWT_SECRET = secret("JWT_SECRET");
```

### Constants (Non-Sensitive Configuration)

**Use regular exports for:**
- URLs (non-sensitive)
- Timeouts
- Limits
- Feature flags
- Default values

```typescript
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_TIMEOUT = 30000;
export const EXTERNAL_API_URL = "https://api.example.com";
export const FEATURE_FLAG_AI_ENABLED = true;
```

---

## Complex Secret Usage Patterns

### JSON Secrets

For complex configuration objects:

```typescript
import type { AuthenticationForEncoreCloud } from "@third-party-apis/encore/interfaces/encoreCloudApi.interface";

const ENCORE_CLOUD_CONFIG = secret("ENCORE_CLOUD_USER_MANAGEMENT_API_TS");

// Parse JSON secret
export const encoreCloudAccount = new EncoreAPICloudService(
  "groupon-encore-83x2",
  JSON.parse(ENCORE_CLOUD_CONFIG()) as AuthenticationForEncoreCloud
);
```

**Setting JSON secret:**

```bash
encore secret set --type local ENCORE_CLOUD_USER_MANAGEMENT_API_TS
# Paste JSON:
# {"apiKey": "...", "projectId": "...", "environment": "..."}
```

### Redis Connection

```typescript
import { RedisService } from "@core/databases/redis/redis.service";

const REDIS_URL = secret("REDIS_COMMON_ENCORE");

export const redisClient = await new RedisService(
  REDIS_URL(),
  "service_name"
).connect();
```

### Multiple Database Connections

```typescript
const PRIMARY_DB_URL = secret("PRIMARY_DATABASE_URL");
const ANALYTICS_DB_URL = secret("ANALYTICS_DATABASE_URL");
const CACHE_DB_URL = secret("CACHE_REDIS_URL");

export const primaryDb = createConnection(PRIMARY_DB_URL());
export const analyticsDb = createConnection(ANALYTICS_DB_URL());
export const cacheDb = createRedisClient(CACHE_DB_URL());
```

---

## Environment Detection

### Detecting Current Environment

```typescript
import { appMeta } from "encore.dev";

const meta = appMeta();

// Environment info
console.log("Environment:", meta.environment.name); // "local", "development", "production"
console.log("Environment Type:", meta.environment.type); // "local", "cloud"
console.log("Cloud:", meta.environment.cloud); // "aws", "gcp", "local"

// App info
console.log("App ID:", meta.appID);
console.log("Service:", meta.service);
```

### Conditional Configuration by Environment

```typescript
import { appMeta } from "encore.dev";

const meta = appMeta();
const isProduction = meta.environment.name === "production";
const isDevelopment = meta.environment.name === "development";
const isLocal = meta.environment.type === "local";

// Environment-specific configuration
export const LOG_LEVEL = isProduction ? "error" : "debug";
export const ENABLE_VERBOSE_LOGGING = !isProduction;
export const RATE_LIMIT = isProduction ? 1000 : 10000;

// Feature flags based on environment
export const FEATURES = {
  AI_COMPLETION: isProduction || isDevelopment,
  EXPERIMENTAL_API: isLocal || isDevelopment,
  DEBUG_MODE: isLocal,
};
```

---

## Security Best Practices

### ✅ DO

1. **Always use `secret()` for sensitive data**
   ```typescript
   const API_KEY = secret("API_KEY");
   ```

2. **Never log secret values**
   ```typescript
   log.info("API configured", { hasKey: !!OPENAI_API_KEY() });
   // Not: log.info("API Key", { key: OPENAI_API_KEY() }) ❌
   ```

3. **Use descriptive secret names**
   ```typescript
   const STRIPE_WEBHOOK_SECRET = secret("STRIPE_WEBHOOK_SECRET");
   ```

4. **Set secrets per environment**
   ```bash
   encore secret set --type local STRIPE_SECRET_KEY
   encore secret set --type production STRIPE_SECRET_KEY
   ```

5. **Rotate secrets regularly**
   ```bash
   # Update secret in production
   encore secret set --type production API_KEY
   ```

### ❌ DON'T

1. **Never hardcode secrets**
   ```typescript
   // ❌ NEVER DO THIS
   const API_KEY = "sk-1234567890abcdef";
   ```

2. **Never commit secrets to Git**
   ```typescript
   // ❌ NEVER DO THIS
   const config = {
     apiKey: "secret-value",
   };
   ```

3. **Never expose secrets in logs**
   ```typescript
   // ❌ NEVER DO THIS
   log.info("Using API key", { apiKey: API_KEY() });
   ```

4. **Never pass secrets in URLs**
   ```typescript
   // ❌ NEVER DO THIS
   const url = `https://api.example.com?key=${API_KEY()}`;
   ```

5. **Never share secrets between unrelated services**
   ```typescript
   // ❌ AVOID: Use service-specific secrets
   const SHARED_SECRET = secret("SHARED_SECRET");
   ```

---

## Common Secret Patterns

### API Client Initialization

```typescript
import { OpenAI } from "openai";
import { Anthropic } from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";

const OPENAI_API_KEY = secret("OPENAI_API_KEY");
const ANTHROPIC_API_KEY = secret("ANTHROPIC_API_KEY");

export const openAIClient = new OpenAI({
  apiKey: OPENAI_API_KEY(),
  timeout: 30000,
  maxRetries: 3,
});

export const anthropicClient = new Anthropic({
  apiKey: ANTHROPIC_API_KEY(),
});
```

### Database Connection

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { SQLDatabase } from "encore.dev/storage/sqldb";

// Encore manages PostgreSQL automatically
const database = new SQLDatabase("user_service", {
  migrations: "./db/migrations",
});

export const db = drizzle(database.connectionString);
```

### External Service Authentication

```typescript
import { secret } from "encore.dev/config";
import { GitHubUserManagementService } from "@third-party-apis/github/services/github.service";

const GITHUB_TOKEN = secret("GITHUB_MONOREPO_TOKEN");

export const githubClient = new GitHubUserManagementService(
  GITHUB_TOKEN()
);
```

### Webhook Signature Verification

```typescript
import { secret } from "encore.dev/config";
import crypto from "crypto";

const WEBHOOK_SECRET = secret("STRIPE_WEBHOOK_SECRET");

export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", WEBHOOK_SECRET())
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Testing with Secrets

### Local Testing

For local development, set test secrets:

```bash
# Set test/fake secrets for local development
encore secret set --type local OPENAI_API_KEY
# Enter: "sk-test-fake-key-for-local-development"

encore secret set --type local STRIPE_SECRET_KEY
# Enter: "sk_test_fake_key"
```

### Mocking Secrets in Tests

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the secret module
vi.mock("encore.dev/config", () => ({
  secret: (name: string) => {
    const mockSecrets: Record<string, () => string> = {
      OPENAI_API_KEY: () => "sk-test-fake-key",
      STRIPE_SECRET_KEY: () => "sk_test_fake_key",
    };
    return mockSecrets[name] || (() => "fake-secret");
  },
}));

describe("Service with secrets", () => {
  it("should use mocked secrets", () => {
    // Your test code here
  });
});
```

---

## Troubleshooting

### Secret Not Set Error

**Error message:**
```
Error: Secret "OPENAI_API_KEY" is not set for environment "local"
```

**Solution:**
```bash
encore secret set --type local OPENAI_API_KEY
```

### Secret Not Found in Production

**Error message:**
```
Error: Secret "STRIPE_SECRET_KEY" is not set for environment "production"
```

**Solution:**
```bash
# Set the secret for production
encore secret set --type production STRIPE_SECRET_KEY

# Verify it's set (won't show value)
encore secret list --type production
```

### Incorrect Secret Value

If you set a wrong secret value:

```bash
# Simply set it again with the correct value
encore secret set --type production OPENAI_API_KEY
# Enter the correct value
```

---

## Secret Rotation

### When to Rotate Secrets

- **Immediately** if compromised
- **Regularly** as part of security policy (e.g., every 90 days)
- **After** team member changes
- **When** moving to production

### How to Rotate Secrets

1. **Generate new secret** in external service (e.g., OpenAI dashboard)
2. **Update Encore secret** with new value
   ```bash
   encore secret set --type production OPENAI_API_KEY
   # Enter new key
   ```
3. **Deploy** the service (or it will pick up automatically)
4. **Verify** functionality
5. **Revoke old secret** in external service

---

## Summary Checklist

### Secret Management Checklist

- [ ] All secrets defined in `encore.service.ts`
- [ ] Using `secret()` function from `encore.dev/config`
- [ ] Secrets accessed with function call `SECRET_NAME()`
- [ ] Descriptive secret names following conventions
- [ ] Secrets set for all environments (local, development, production)
- [ ] No hardcoded secrets in source code
- [ ] No secrets in Git repository
- [ ] No secrets logged or exposed
- [ ] Environment-specific configuration handled
- [ ] Documentation includes required secrets

### Configuration Checklist

- [ ] Service constants defined and exported
- [ ] External clients initialized with secrets
- [ ] Environment variables set (if needed by libraries)
- [ ] Service properly registered with ORR
- [ ] Middleware configured
- [ ] Resource instances (Redis, Buckets) initialized

**Remember: Secrets are sensitive. Treat them with care, rotate them regularly, and never expose them.**

