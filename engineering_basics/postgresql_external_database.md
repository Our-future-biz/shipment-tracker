# PostgreSQL External Database Connection

## Connecting to Existing PostgreSQL Databases with Drizzle ORM

This guide explains how to connect to existing PostgreSQL databases (external or legacy databases) in your Encore microservice using Drizzle ORM. This approach is ideal when you need to integrate with databases outside of Encore's managed infrastructure.

### Table of Contents

1. [When to Use External Database Connections](#when-to-use-external-database-connections)
2. [Database Connection Setup](#database-connection-setup)
3. [Schema Definition with Drizzle](#schema-definition-with-drizzle)
4. [Repository Implementation](#repository-implementation)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

---

### When to Use External Database Connections

Use external database connections when:

* **Integrating with legacy systems** - You need to read/write to existing company databases
* **Multi-service architecture** - Multiple services need to access the same database
* **Gradual migration** - Moving from monolithic to microservices architecture
* **Read-only access** - Connecting to production replicas or analytics databases
* **Third-party databases** - Integrating with external vendor databases

**Examples:**
- Connecting to UGC (User Generated Content) database
- Accessing legacy order management systems
- Reading from data warehouses
- Integrating with external CRM systems

---

### Database Connection Setup

#### Step 1: Store Connection String as Secret

First, save your PostgreSQL connection string as an Encore secret:

**Connection String Format:**
```
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME
```

**Example Connection Strings:**
```bash
# Production read-only replica
postgresql://readonly_user:secure_password@pg-core-us-200-prod-ro.gds.prod.gcp.groupondev.com:5432/ugc_database

# Staging database
postgresql://dev_user:dev_password@staging-db.company.com:5432/my_service_db

# Local development
postgresql://postgres:postgres@localhost:5432/local_dev_db
```

**How to Add Secret:**

Using Encore CLI:
```bash
# For local development
encore secret set --type local UGC_DATABASE_URL

# For development (staging) environment
encore secret set --type dev UGC_DATABASE_URL

# For production
encore secret set --type prod UGC_DATABASE_URL

# For preview/PR environments
encore secret set --type pr UGC_DATABASE_URL

# For multiple environments at once
encore secret set --type dev,local UGC_DATABASE_URL
```

The `--type` flag defines which environment types the secret applies to. Supported types:
- `local` - Local development environment
- `development` (shorthand: `dev`) - Development environment
- `production` (shorthand: `prod`) - Production environment
- `preview` (shorthand: `pr`) - Preview/PR environments

You can also pipe the secret from a file:
```bash
encore secret set --type prod UGC_DATABASE_URL < connection-string.txt
```

**Security Notes:**
- Never hardcode connection strings in your code
- Use read-only credentials when possible
- Rotate credentials regularly
- Use different credentials for each environment

#### Step 2: Initialize Database Connection

Create a database configuration file in your service:

```typescript
// db/ugc/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { secret } from "encore.dev/config";
import pg from "pg";
import * as ugcSchema from "@/_tribe_b2c/deal-reviews/schemas/ugc";

// Load database URL from Encore secrets
const UGC_DATABASE_URL = secret("UGC_DATABASE_URL");

// Create PostgreSQL connection pool
const pool = new pg.Pool({
  connectionString: UGC_DATABASE_URL(),
  // Optional: Configure pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not available
});

// Export Drizzle database instance with schema
export const ugcDb = drizzle(pool, { schema: ugcSchema });
```

**Key Points:**
- Uses `drizzle-orm/node-postgres` adapter for PostgreSQL
- Connection string loaded securely from Encore secrets
- Connection pooling managed by `pg.Pool`
- Schema imported for type-safe queries
- Single database instance exported for use across service

**Advanced Pool Configuration:**
```typescript
const pool = new pg.Pool({
  connectionString: UGC_DATABASE_URL(),
  max: 20,                          // Maximum pool size
  min: 5,                           // Minimum pool size
  idleTimeoutMillis: 30000,        // How long a client can be idle before closing
  connectionTimeoutMillis: 10000,  // Timeout for acquiring connection
  statement_timeout: 30000,        // Query timeout in milliseconds
  query_timeout: 30000,            // Another query timeout setting
});

// Optional: Handle pool errors
pool.on('error', (err) => {
  log.error(err, 'Unexpected database pool error');
});
```

---

### Schema Definition with Drizzle

#### Step 3: Define Database Schema

Drizzle ORM provides type-safe database access by defining schemas that mirror your database structure.

**Basic Schema Example:**

```typescript
// schemas/ugc.ts
import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

// Define reviews table schema
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  deal_id: text("deal_id").notNull(),
  user_id: text("user_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  verified_purchase: boolean("verified_purchase").default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  deleted_at: timestamp("deleted_at"),
});

// Define review_votes table schema
export const reviewVotes = pgTable("review_votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  review_id: uuid("review_id").notNull(),
  user_id: text("user_id").notNull(),
  vote_type: text("vote_type").notNull(), // 'helpful' or 'not_helpful'
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Export types for use in application
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewVote = typeof reviewVotes.$inferSelect;
export type NewReviewVote = typeof reviewVotes.$inferInsert;
```

**Advanced Schema with Relations:**

```typescript
// schemas/ugc.ts
import { pgTable, uuid, text, timestamp, integer, varchar, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }).notNull(),
  profile_data: jsonb("profile_data"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Reviews table with foreign keys
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  deal_id: text("deal_id").notNull(),
  rating: integer("rating").notNull(),
  title: varchar("title", { length: 200 }),
  comment: text("comment"),
  status: varchar("status", { length: 50 }).default("pending"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Define relations for better query composition
export const usersRelations = relations(users, ({ many }) => ({
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.user_id],
    references: [users.id],
  }),
}));

// Export types
export type User = typeof users.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
```

**Common Column Types:**

| Drizzle Type | PostgreSQL Type | Example Usage |
|--------------|-----------------|---------------|
| `uuid()` | UUID | `id: uuid("id").primaryKey()` |
| `text()` | TEXT | `comment: text("comment")` |
| `varchar(length)` | VARCHAR(n) | `email: varchar("email", { length: 255 })` |
| `integer()` | INTEGER | `rating: integer("rating")` |
| `boolean()` | BOOLEAN | `is_active: boolean("is_active")` |
| `timestamp()` | TIMESTAMP | `created_at: timestamp("created_at")` |
| `jsonb()` | JSONB | `metadata: jsonb("metadata")` |
| `decimal()` | DECIMAL | `price: decimal("price", { precision: 10, scale: 2 })` |

**Schema Modifiers:**

```typescript
// Required field
deal_id: text("deal_id").notNull(),

// Unique constraint
email: text("email").unique(),

// Default value
status: text("status").default("pending"),

// Primary key
id: uuid("id").primaryKey(),

// Foreign key reference
user_id: uuid("user_id").references(() => users.id),

// Auto-generated timestamp
created_at: timestamp("created_at").defaultNow(),

// Multiple constraints
rating: integer("rating").notNull().default(5),
```

#### Step 4: Create TypeScript Interfaces

Define interfaces for your data models:

```typescript
// interfaces/ugc.interface.ts
import type { Review, NewReview } from "@/_tribe_b2c/deal-reviews/schemas/ugc";

// Use inferred types from schema
export type ReviewModel = Review;

// Or extend with additional properties
export interface ReviewWithUser extends Review {
  user_email: string;
  user_name: string;
}

// DTOs for API endpoints
export interface CreateReviewRequest {
  deal_id: string;
  rating: number;
  comment?: string;
}

export interface UpdateReviewRequest {
  rating?: number;
  comment?: string;
  status?: "pending" | "approved" | "rejected";
}

export interface ReviewFilterRequest {
  deal_id?: string;
  user_id?: string;
  min_rating?: number;
  max_rating?: number;
  status?: string;
  page?: number;
  limit?: number;
}
```

---

### Repository Implementation

#### Step 5: Create Repository Class

Implement repository pattern for data access:

```typescript
// repositories/ugc-review.repository.ts
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { ugcDb } from "@/_tribe_b2c/deal-reviews/db/ugc/db";
import { reviews } from "@/_tribe_b2c/deal-reviews/schemas/ugc";
import type { Review, NewReview } from "@/_tribe_b2c/deal-reviews/schemas/ugc";
import type { ReviewFilterRequest } from "@/_tribe_b2c/deal-reviews/interfaces/ugc.interface";

export class UgcReviewRepository {
  /**
   * Get review by ID
   */
  async getById(id: string): Promise<Review | null> {
    const result = await ugcDb
      .select()
      .from(reviews)
      .where(eq(reviews.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get all reviews for a deal
   */
  async getByDealId(dealId: string): Promise<Review[]> {
    return await ugcDb
      .select()
      .from(reviews)
      .where(eq(reviews.deal_id, dealId))
      .orderBy(desc(reviews.created_at));
  }

  /**
   * Create new review
   */
  async create(data: NewReview): Promise<Review> {
    const result = await ugcDb
      .insert(reviews)
      .values(data)
      .returning();

    return result[0];
  }

  /**
   * Update existing review
   */
  async update(id: string, data: Partial<NewReview>): Promise<Review | null> {
    const result = await ugcDb
      .update(reviews)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(reviews.id, id))
      .returning();

    return result[0] || null;
  }

  /**
   * Soft delete review
   */
  async delete(id: string): Promise<boolean> {
    const result = await ugcDb
      .update(reviews)
      .set({ deleted_at: new Date() })
      .where(eq(reviews.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Advanced filtering with pagination
   */
  async getByFilter(filter: ReviewFilterRequest): Promise<{
    data: Review[];
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions = [];

    // Build where conditions
    if (filter.deal_id) {
      conditions.push(eq(reviews.deal_id, filter.deal_id));
    }
    if (filter.user_id) {
      conditions.push(eq(reviews.user_id, filter.user_id));
    }
    if (filter.min_rating) {
      conditions.push(gte(reviews.rating, filter.min_rating));
    }
    if (filter.max_rating) {
      conditions.push(lte(reviews.rating, filter.max_rating));
    }
    if (filter.status) {
      conditions.push(eq(reviews.status, filter.status));
    }

    // Combine conditions with AND
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Pagination
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await ugcDb
      .select({ count: sql<number>`count(*)` })
      .from(reviews)
      .where(whereClause);

    // Get paginated data
    const data = await ugcDb
      .select()
      .from(reviews)
      .where(whereClause)
      .orderBy(desc(reviews.created_at))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total: Number(countResult.count),
      page,
      limit,
    };
  }

  /**
   * Get review statistics for a deal
   */
  async getStatsByDealId(dealId: string): Promise<{
    total_reviews: number;
    average_rating: number;
    rating_distribution: Record<number, number>;
  }> {
    const stats = await ugcDb
      .select({
        total: sql<number>`count(*)`,
        avg_rating: sql<number>`avg(${reviews.rating})`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.deal_id, dealId),
          eq(reviews.deleted_at, null)
        )
      );

    const distribution = await ugcDb
      .select({
        rating: reviews.rating,
        count: sql<number>`count(*)`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.deal_id, dealId),
          eq(reviews.deleted_at, null)
        )
      )
      .groupBy(reviews.rating);

    return {
      total_reviews: Number(stats[0]?.total || 0),
      average_rating: Number(stats[0]?.avg_rating || 0),
      rating_distribution: Object.fromEntries(
        distribution.map(d => [d.rating, Number(d.count)])
      ),
    };
  }
}

// Export singleton instance
export const ugcReviewRepository = new UgcReviewRepository();
```

**Common Drizzle Query Patterns:**

```typescript
// SELECT with WHERE
const result = await ugcDb
  .select()
  .from(reviews)
  .where(eq(reviews.id, reviewId));

// SELECT with multiple conditions (AND)
const result = await ugcDb
  .select()
  .from(reviews)
  .where(
    and(
      eq(reviews.deal_id, dealId),
      gte(reviews.rating, 4)
    )
  );

// SELECT with OR conditions
import { or } from "drizzle-orm";
const result = await ugcDb
  .select()
  .from(reviews)
  .where(
    or(
      eq(reviews.status, "approved"),
      eq(reviews.status, "pending")
    )
  );

// SELECT with LIKE
import { like } from "drizzle-orm";
const result = await ugcDb
  .select()
  .from(reviews)
  .where(like(reviews.comment, "%great%"));

// SELECT with JOIN
const result = await ugcDb
  .select({
    review: reviews,
    user: users,
  })
  .from(reviews)
  .leftJoin(users, eq(reviews.user_id, users.id));

// INSERT
const result = await ugcDb
  .insert(reviews)
  .values({
    deal_id: "123",
    user_id: "456",
    rating: 5,
    comment: "Great deal!",
  })
  .returning();

// UPDATE
const result = await ugcDb
  .update(reviews)
  .set({ rating: 4, updated_at: new Date() })
  .where(eq(reviews.id, reviewId))
  .returning();

// DELETE (hard delete)
await ugcDb
  .delete(reviews)
  .where(eq(reviews.id, reviewId));

// Aggregate functions
const stats = await ugcDb
  .select({
    total: sql<number>`count(*)`,
    average: sql<number>`avg(${reviews.rating})`,
    max: sql<number>`max(${reviews.rating})`,
  })
  .from(reviews);

// GROUP BY
const grouped = await ugcDb
  .select({
    deal_id: reviews.deal_id,
    count: sql<number>`count(*)`,
  })
  .from(reviews)
  .groupBy(reviews.deal_id);

// ORDER BY with pagination
const paginated = await ugcDb
  .select()
  .from(reviews)
  .orderBy(desc(reviews.created_at))
  .limit(20)
  .offset(40); // Page 3
```

---

### Best Practices

#### 1. Connection Management

```typescript
// ✅ GOOD: Single database instance per service
export const ugcDb = drizzle(pool, { schema: ugcSchema });

// ❌ BAD: Creating new connection for each query
function getDb() {
  const pool = new pg.Pool({ connectionString: UGC_DATABASE_URL() });
  return drizzle(pool);
}
```

#### 2. Error Handling

```typescript
import { APIError } from "encore.dev/api";
import { log } from "encore.dev/log";

async getReview(id: string): Promise<Review | null> {
  try {
    const result = await ugcDb
      .select()
      .from(reviews)
      .where(eq(reviews.id, id))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    log.error(error, "Failed to fetch review", { id });
    throw APIError.internal("Database query failed");
  }
}
```

#### 3. Type Safety

```typescript
// ✅ GOOD: Use inferred types from schema
import type { Review, NewReview } from "@/schemas/ugc";

async function createReview(data: NewReview): Promise<Review> {
  const result = await ugcDb.insert(reviews).values(data).returning();
  return result[0];
}

// ❌ BAD: Using any or unknown types
async function createReview(data: any): Promise<any> {
  return await ugcDb.insert(reviews).values(data).returning();
}
```

#### 4. Transaction Support

```typescript
import { APIError } from "encore.dev/api";

async transferReviewOwnership(
  reviewId: string,
  oldUserId: string,
  newUserId: string
): Promise<void> {
  try {
    await ugcDb.transaction(async (tx) => {
      // Update review owner
      await tx
        .update(reviews)
        .set({ user_id: newUserId, updated_at: new Date() })
        .where(
          and(
            eq(reviews.id, reviewId),
            eq(reviews.user_id, oldUserId)
          )
        );

      // Create audit log
      await tx
        .insert(auditLogs)
        .values({
          action: "review_ownership_transfer",
          review_id: reviewId,
          old_user_id: oldUserId,
          new_user_id: newUserId,
        });
    });
  } catch (error) {
    log.error(error, "Transaction failed", { reviewId });
    throw APIError.internal("Failed to transfer review ownership");
  }
}
```

#### 5. Query Optimization

```typescript
// ✅ GOOD: Select only needed columns
const reviews = await ugcDb
  .select({
    id: reviews.id,
    rating: reviews.rating,
    created_at: reviews.created_at,
  })
  .from(reviews);

// ❌ BAD: Select all columns when not needed
const reviews = await ugcDb.select().from(reviews); // Returns all columns

// ✅ GOOD: Use indexes for filtering
const recentReviews = await ugcDb
  .select()
  .from(reviews)
  .where(
    and(
      eq(reviews.deal_id, dealId), // Indexed column
      gte(reviews.created_at, new Date("2024-01-01"))
    )
  );
```

#### 6. Connection Pool Monitoring

```typescript
// Add pool monitoring
pool.on('connect', () => {
  log.trace('New database connection established');
});

pool.on('error', (err) => {
  log.error(err, 'Database pool error');
});

pool.on('remove', () => {
  log.trace('Database connection removed from pool');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('Closing database pool');
  await pool.end();
});
```

---

### Troubleshooting

#### Common Issues

**1. Connection Refused**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
- Verify database host and port are correct
- Check if VPN is required for database access
- Ensure firewall rules allow connection
- Verify database is running

**2. Authentication Failed**

```
Error: password authentication failed for user "username"
```

**Solutions:**
- Verify username and password in connection string
- Check if credentials need to be URL encoded
- Ensure user has proper permissions
- Verify database name is correct

**3. SSL/TLS Issues**

```
Error: The server does not support SSL connections
```

**Solutions:**
```typescript
// Add SSL configuration to connection
const pool = new pg.Pool({
  connectionString: UGC_DATABASE_URL(),
  ssl: {
    rejectUnauthorized: false, // For self-signed certificates
  },
});

// Or disable SSL if not supported
const pool = new pg.Pool({
  connectionString: UGC_DATABASE_URL(),
  ssl: false,
});
```

**4. Connection Pool Exhausted**

```
Error: Connection terminated unexpectedly
```

**Solutions:**
```typescript
// Increase pool size
const pool = new pg.Pool({
  connectionString: UGC_DATABASE_URL(),
  max: 30, // Increase from default 10
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Ensure connections are properly released
// Use transactions properly
// Monitor active connections
```

**5. Query Timeout**

```
Error: Query read timeout
```

**Solutions:**
```typescript
// Add query timeout
const pool = new pg.Pool({
  connectionString: UGC_DATABASE_URL(),
  statement_timeout: 60000, // 60 seconds
  query_timeout: 60000,
});

// Optimize slow queries
// Add appropriate indexes
// Consider pagination for large result sets
```

#### Debugging Tips

```typescript
// Enable query logging in development
import { drizzle } from "drizzle-orm/node-postgres";

export const ugcDb = drizzle(pool, {
  schema: ugcSchema,
  logger: true, // Log all SQL queries (development only)
});

// Test connection
async function testConnection() {
  try {
    const result = await ugcDb.execute(sql`SELECT NOW()`);
    log.info("Database connection successful", result);
  } catch (error) {
    log.error(error, "Database connection failed");
  }
}

// Monitor pool status
function checkPoolStatus() {
  log.info("Pool status", {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
}
```

---

### Complete Example: Deal Reviews Service

Here's a complete example integrating all concepts:

```typescript
// db/ugc/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { secret } from "encore.dev/config";
import pg from "pg";
import * as ugc from "@/_tribe_b2c/deal-reviews/schemas/ugc";

const UGC_DATABASE_URL = secret("UGC_DATABASE_URL");

const pool = new pg.Pool({
  connectionString: UGC_DATABASE_URL(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const ugcDb = drizzle(pool, { schema: ugc });

// schemas/ugc.ts
import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  deal_id: text("deal_id").notNull(),
  user_id: text("user_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

// repositories/ugc-review.repository.ts
import { eq, desc } from "drizzle-orm";
import { ugcDb } from "@/_tribe_b2c/deal-reviews/db/ugc/db";
import { reviews } from "@/_tribe_b2c/deal-reviews/schemas/ugc";
import type { Review, NewReview } from "@/_tribe_b2c/deal-reviews/schemas/ugc";

export class UgcReviewRepository {
  async getById(id: string): Promise<Review | null> {
    const result = await ugcDb
      .select()
      .from(reviews)
      .where(eq(reviews.id, id))
      .limit(1);
    return result[0] || null;
  }

  async getByDealId(dealId: string): Promise<Review[]> {
    return await ugcDb
      .select()
      .from(reviews)
      .where(eq(reviews.deal_id, dealId))
      .orderBy(desc(reviews.created_at));
  }

  async create(data: NewReview): Promise<Review> {
    const result = await ugcDb
      .insert(reviews)
      .values(data)
      .returning();
    return result[0];
  }
}

export const ugcReviewRepository = new UgcReviewRepository();

// services/ugc.service.ts
import { ugcReviewRepository } from "@/_tribe_b2c/deal-reviews/repositories/ugc-review.repository";
import type { Review, NewReview } from "@/_tribe_b2c/deal-reviews/schemas/ugc";

export class UgcService {
  async getReviewsByDeal(dealId: string): Promise<Review[]> {
    return await ugcReviewRepository.getByDealId(dealId);
  }

  async createReview(data: NewReview): Promise<Review> {
    return await ugcReviewRepository.create(data);
  }
}

export const ugcService = new UgcService();

// controllers/reviews.controller.ts
import { api } from "encore.dev/api";
import { ugcService } from "@/_tribe_b2c/deal-reviews/services/ugc.service";
import type { Review, NewReview } from "@/_tribe_b2c/deal-reviews/schemas/ugc";

export const getReviewsByDeal = api(
  { expose: true, method: "GET", path: "/reviews/:dealId" },
  async ({ dealId }: { dealId: string }): Promise<{ reviews: Review[] }> => {
    const reviews = await ugcService.getReviewsByDeal(dealId);
    return { reviews };
  }
);

export const createReview = api(
  { expose: true, auth: true, method: "POST", path: "/reviews" },
  async (data: NewReview): Promise<Review> => {
    return await ugcService.createReview(data);
  }
);
```

---

### Additional Resources

**Drizzle ORM Documentation:**
- [Official Drizzle Docs](https://orm.drizzle.team/docs/overview)
- [PostgreSQL Adapter](https://orm.drizzle.team/docs/get-started-postgresql)
- [Query Examples](https://orm.drizzle.team/docs/select)

**Encore Resources:**
- [Secrets Management](https://encore.dev/docs/primitives/secrets)
- [Database Guide](https://encore.dev/docs/primitives/databases)

**PostgreSQL:**
- [Connection String Format](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [pg Pool Documentation](https://node-postgres.com/apis/pool)

This guide provides everything you need to connect to external PostgreSQL databases in your Encore microservices with type safety and best practices.

