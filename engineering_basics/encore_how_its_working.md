# Encore: How It Works (The Developer's Liberation Story)

## The Problem We Used to Have

Imagine you're a backend developer. You want to build an API endpoint. In the traditional world, here's what you had to do:

1. **Write the code** (30 minutes)
2. **Configure the infrastructure** (2 hours):
   - Set up load balancers
   - Configure Kubernetes manifests
   - Write Terraform files
   - Set up service discovery
   - Configure monitoring
   - Set up logging
3. **Deploy** (1 hour):
   - Build Docker images
   - Push to registry
   - Apply K8s configs
   - Debug deployment issues
4. **Debug in production** (2+ hours):
   - Why isn't it scaling?
   - Why can't services find each other?
   - Why is the database connection failing?

**Total time:** 5+ hours for a simple API endpoint. And that's if everything goes right.

---

## The Encore Revolution

Now, here's the same task with Encore:

```typescript
// That's it. Seriously.
import { api } from "encore.dev/api";

export const userCreate = api(
  { method: "POST", path: "/user", expose: true, auth: true },
  async (request: UserCreateRequest): Promise<UserCreateResponse> => {
    return userService.createUser(request);
  }
);

interface UserCreateRequest {
  name: string;
  email: string;
}

interface UserCreateResponse {
  user: User;
  message: string;
}
```

**Deploy time:** 60 seconds.
**Infrastructure config:** 0 lines of YAML.
**Documentation:** Automatically generated.
**Total time:** 5 minutes.

**What just happened?** Encore understood your code and automatically:
- ✅ Created the API endpoint
- ✅ Generated OpenAPI documentation
- ✅ Set up load balancing
- ✅ Configured service discovery
- ✅ Set up monitoring and tracing
- ✅ Deployed to staging and production
- ✅ Generated type-safe clients for other services

---

## The Philosophy: Infrastructure from Code

### Traditional Approach (Infrastructure as Code)

```yaml
# deployment.yaml (100+ lines)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    # ... 50 more lines of YAML
    # ... that nobody really understands
    # ... and breaks when you update K8s
```

### Encore Approach (Infrastructure from Code)

```typescript
// No YAML. Just TypeScript.
import { api } from "encore.dev/api";

export const getUser = api(
  { method: "GET", path: "/user/:id" },
  async ({ id }: { id: string }) => {
    return await db.query`SELECT * FROM users WHERE id = ${id}`;
  }
);
```

Encore **parses your TypeScript code**, understands your intent, and generates everything else.

---

## How Encore Actually Works: A Story

Let's follow a request through the Encore ecosystem:

### Chapter 1: The Developer Writes Code

```typescript
// services/user/controllers/userGet.controller.ts
export const getUser = api(
  { method: "GET", path: "/user/:id", expose: true, auth: true },
  async ({ id }: { id: string }): Promise<UserResponse> => {
    return await userService.getById(id);
  }
);
```

**Behind the scenes:** Encore's static analysis tool reads this file and thinks:

> "Hmm, I see an API endpoint. It's a GET request. It requires authentication.
> It has a path parameter. It returns a UserResponse.
> I need to:
> - Create an HTTP route
> - Add auth middleware
> - Generate API docs
> - Create a type-safe client
> - Set up monitoring"

### Chapter 2: The Compilation

When you run `git push`, Encore Cloud:

1. **Analyzes your code** (statically, without running it)
2. **Generates infrastructure** (AWS/GCP resources)
3. **Creates deployment manifests**
4. **Builds Docker images** (but you never wrote a Dockerfile)
5. **Deploys to your environment**

All in **60 seconds**.

### Chapter 3: The Request

A client makes a request:

```bash
GET https://api.groupon.com/user/123
Authorization: Bearer <token>
```

**Encore's routing layer:**
```
1. Load balancer receives request
2. Routes to user service instance
3. Validates auth token (automatically)
4. Parses path parameter (automatically)
5. Calls your handler
6. Returns response
7. Logs everything (automatically)
8. Updates metrics (automatically)
```

You wrote **zero lines of code** for steps 1-4 and 6-8.

### Chapter 4: Service-to-Service Calls

Now your user service needs to call the email service:

```typescript
// In user service
import { email } from "~encore/clients";

// Type-safe! IDE autocomplete works!
const result = await email.sendWelcome({
  to: user.email,
  name: user.name,
});
```

**Encore automatically:**
- ✅ Generates the client
- ✅ Handles service discovery
- ✅ Adds distributed tracing
- ✅ Implements retries
- ✅ Load balances requests
- ✅ Monitors performance

---

## The Magic Explained: What Makes Encore Different?

### 1. Static Analysis (The Brain)

Encore **reads your TypeScript code** and understands:
- "This is an API endpoint"
- "This needs a database"
- "This publishes to a topic"
- "This runs on a schedule"

**Example:**

```typescript
// Encore sees this...
const db = new SQLDatabase("users", {
  migrations: "./migrations",
});

// ...and thinks:
// "They need a PostgreSQL database named 'users'.
// I'll provision it, run migrations, and give them a connection."
```

### 2. Automatic Infrastructure (The Hands)

Based on what it understood, Encore:
- **Provisions databases** (PostgreSQL automatically managed)
- **Creates pub/sub topics** (no Kafka/RabbitMQ config needed)
- **Sets up cron jobs** (no cron syntax or schedulers)
- **Manages secrets** (environment-specific, encrypted)

**Example:**

```typescript
// You write this...
export const filesBucket = new Bucket("user-files", {
  versioned: false,
  public: true,
});

// Encore creates:
// - S3 bucket (or GCS bucket)
// - IAM policies
// - CDN configuration
// - Public URL generation
```

### 3. Type-Safe Everything (The Safety Net)

Encore generates **TypeScript clients** for all your services:

```typescript
// In service A
export const getUser = api(/*...*/);

// In service B - this is automatically generated!
import { user } from "~encore/clients";

const result = await user.getUser({ id: "123" });
//    ^? UserResponse (full type safety!)
```

If you change the API, **compilation fails** in services that call it. No more runtime errors.

---

## Real-World Example: Building a Feature End-to-End

Let's build a "user registration with email confirmation" feature.

### Old Way (Traditional Stack)

**Time: 2-3 days**

1. Write user service code
2. Write email service code
3. Configure Kafka for async messaging
4. Write Kubernetes manifests (2 services)
5. Configure service mesh
6. Set up databases (2 services)
7. Configure secrets management
8. Set up monitoring dashboards
9. Write integration tests
10. Debug deployment issues

### Encore Way

**Time: 2 hours**

**Step 1: User Service (20 minutes)**

```typescript
// services/user/controllers/register.controller.ts
export const register = api(
  { method: "POST", path: "/auth/register", expose: true, auth: false },
  async (req: RegisterRequest): Promise<RegisterResponse> => {
    // Create user
    const user = await userRepository.create(req);

    // Publish event (pub/sub automatically set up!)
    await userRegisteredTopic.publish({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    return { user, message: "Check your email!" };
  }
);
```

**Step 2: Email Service (20 minutes)**

```typescript
// services/email/pubsub/sendWelcome.sub.ts
import { Subscription } from "encore.dev/pubsub";
import { userRegisteredTopic } from "~encore/clients/user";

const _ = new Subscription(userRegisteredTopic, "send-welcome", {
  handler: async (event) => {
    await emailService.sendWelcome({
      to: event.email,
      name: event.name,
      userId: event.userId,
    });
  },
});
```

**Step 3: Push to Git (60 seconds)**

```bash
git add .
git commit -m "feat: user registration with email"
git push origin main
```

**Done.** 🎉

Encore automatically:
- Created pub/sub infrastructure
- Set up both services
- Connected them
- Deployed to staging
- Generated API docs
- Set up monitoring

---

## The Groupon Scale: How We Use Encore

### Our Setup

```
/groupon-monorepo
     /apps
    /encore-ts                    # Backend microservices
      /services
        /_core_system
          /authentication         # OAuth, sessions
          /user                   # User profiles
          /authorization          # RBAC
          /ai-gateway            # AI providers
          /auditlog              # Compliance logging
        /_core_operations
          /deal-management       # Business logic
          /merchant-ops          # Merchant operations
          /campaigns             # Marketing campaigns
```

**30+ microservices** in one monorepo.

### Scaling Strategy

**Staging:**
- All services on **1 server** (8GB RAM, 4 cores)
- Cheap, fast iteration
- Perfect for testing

**Production:**
- Each service on **dedicated pods**
- Auto-scaling based on load
- Low-traffic services **auto-sleep** (cold start: 15s)
- High-traffic services **always-on** (3+ instances)

**Who configures this?** **Developers**, not DevOps. It's just code:

```typescript
// In encore.service.ts
export default new Service("user", {
  // That's it. Encore handles scaling.
});
```

---

## Why This Matters: The Numbers

### Before Encore (Traditional Stack)

| Task | Time | Who |
|------|------|-----|
| New API endpoint | 4-6 hours | Developer + DevOps |
| Database setup | 2-4 hours | DevOps |
| Service deployment | 1-2 hours | DevOps |
| Monitoring setup | 2-3 hours | DevOps |
| **Total** | **9-15 hours** | **2 people** |

### With Encore

| Task | Time | Who |
|------|------|-----|
| New API endpoint | 30 minutes | Developer |
| Database setup | 5 minutes | Developer |
| Service deployment | Automatic | Encore |
| Monitoring setup | Automatic | Encore |
| **Total** | **35 minutes** | **1 person** |

**Result:** 95% time reduction.

---

## The Learning Curve

### What You Need to Know

**Essential:**
- TypeScript basics
- HTTP APIs (REST)
- Async/await
- Basic SQL

**That's it.**

**What You DON'T Need:**
- ❌ Kubernetes
- ❌ Docker (though it helps)
- ❌ Terraform
- ❌ Service meshes
- ❌ Load balancers
- ❌ Message queues
- ❌ YAML (thank god)

### Onboarding Timeline

**Week 1:** Learn Encore basics
- Read docs: [encore.dev/docs/ts/quick-start](https://encore.dev/docs/ts/quick-start)
- Build a simple CRUD API
- Deploy to staging

**Week 2:** Learn Groupon patterns
- Review code standards
- Study existing services
- Make first contribution

**Week 3:** Full productivity
- Build features independently
- Review others' code
- Ship to production

---

## The "Aha!" Moments

### Moment 1: Service-to-Service Calls

```typescript
// Traditional way: nightmare
const response = await fetch(
  `${process.env.USER_SERVICE_URL}/users/${id}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }
);
const data = await response.json();
// What type is 'data'? Who knows! 🤷

// Encore way: magic
import { user } from "~encore/clients";

const data = await user.getUser({ id });
//    ^? Type: UserResponse (fully typed!)
```

### Moment 2: Database Migrations

```typescript
// Traditional: Write SQL, run scripts, pray
// Encore: Update schema, push code

// Step 1: Update schema
export const userTable = pgTable("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // Add new field
  phoneNumber: text("phone_number"), // ← NEW!
});

// Step 2: Generate migration
// $ npx drizzle-kit generate

// Step 3: Push to git
// $ git push

// Done! Migration runs automatically on deploy.
```

### Moment 3: Pub/Sub Without Kafka

```typescript
// Traditional: Install Kafka, write 500 lines of config
// Encore: 10 lines

import { Topic } from "encore.dev/pubsub";

export const orderPlaced = new Topic<OrderEvent>("orders", {
  deliveryGuarantee: "at-least-once",
});

// Publish
await orderPlaced.publish({ orderId, userId, amount });

// Subscribe
const _ = new Subscription(orderPlaced, "send-receipt", {
  handler: async (event) => {
    await emailService.sendReceipt(event);
  },
});
```

---

## The Groupon Standard: Why Encore Entry Is Restricted

At Groupon, we protect Encore from becoming a mess. Here's why:

### The Test

Before you can contribute to Encore services, you must:

1. **Pass the Encore knowledge test**
   - Understand Encore primitives
   - Know the architecture patterns
   - Demonstrate TypeScript proficiency

2. **Pass the Groupon standards test**
   - Know our layered architecture
   - Understand public vs private APIs
   - Follow naming conventions

### Why?

**One bad service can:**
- ❌ Slow down the entire platform
- ❌ Create security vulnerabilities
- ❌ Make the codebase unmaintainable
- ❌ Cost thousands in wasted compute

**Good services:**
- ✅ Follow standards
- ✅ Are easy to understand
- ✅ Scale efficiently
- ✅ Are secure by default

---

## The Philosophy: Code Is the Source of Truth

### Traditional Stack

```
Code ←→ Infrastructure Config ←→ Documentation ←→ API Clients
  ↓           ↓                       ↓                ↓
These drift apart over time and become inconsistent
```

### Encore

```
Code → Everything Else
  ↓
  └→ Infrastructure (generated)
  └→ Documentation (generated)
  └→ API Clients (generated)
  └→ Monitoring (generated)
```

**One source of truth.** If the code works, everything works.

---

## Real Developer Quotes

> "I spent 5 years fighting Kubernetes. With Encore, I actually write features again."
> — Senior Backend Engineer

> "I deployed my first service in 10 minutes. I thought I was doing something wrong."
> — New Hire, Week 1

> "We went from 1 service per month to 3 services per week. Same team size."
> — Engineering Manager

> "The fact that I don't write YAML anymore brings me joy."
> — Every Developer Ever

---

## Getting Started

### Quick Start (5 minutes)

1. **Read the Quick Start:**
   ```
   https://encore.dev/docs/ts/quick-start
   ```

2. **Clone our monorepo:**
   ```bash
   git clone <groupon-monorepo>
   cd apps/encore-ts
   ```

3. **Study a simple service:**
   ```
   services/_core_system/auditlog
   ```

4. **Read our standards:**
   ```
   _documentation/engineering_basics/
   ```

5. **Build something:**
   ```bash
   encore run
   # Visit http://localhost:9400
   ```

### Next Steps

1. **Master the basics** (Week 1)
   - Controllers, Services, Repositories
   - Public vs Private APIs
   - Database with Drizzle ORM

2. **Learn advanced patterns** (Week 2)
   - Service-to-service calls
   - Pub/Sub messaging
   - Caching with Redis
   - Scheduled jobs

3. **Ship to production** (Week 3)
   - Code review
   - Testing
   - Deployment
   - Monitoring

---

## The Future Is Here

Encore represents the future of backend development:

- **Write less code**, ship more features
- **Focus on business logic**, not infrastructure
- **Type-safe everything**, catch errors at compile time
- **Automatic scaling**, handle any load
- **Built-in observability**, see what's happening

At Groupon, we've embraced this future. We're building faster, more reliably, and with fewer headaches than ever before.

**Welcome to Encore. Welcome to the future.** 🚀

---

## Resources

- **Encore Official Docs:** [encore.dev/docs](https://encore.dev/docs)
- **Groupon Standards:** `/_documentation/engineering_basics/`
- **Example Services:** `/apps/encore-ts/services/`
- **Questions?** GChat: [Encore Hub](https://chat.google.com/room/AAQAQEAUoTo?cls=7)

---

**Remember:** With Encore, you're not just a backend developer anymore. You're a full-stack infrastructure engineer who happens to only write TypeScript. And that's pretty cool. 😎
