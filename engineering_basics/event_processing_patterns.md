# Event Processing Patterns in Encore

## Overview

Event Processing (using Publish/Subscribe pattern) enables asynchronous, event-driven communication between services. In Encore, the event processing system provides a robust mechanism for decoupling services and handling background processing with built-in retry capabilities.

This document defines the **mandatory patterns** for implementing event processing in Encore TypeScript services.

---

## Core Principles

1. **Separate Concerns**: Topics and subscriptions live in dedicated folders
2. **Interface-First**: Define event interfaces in topic files
3. **Controller-Based**: Subscriptions must call controllers, not services directly
4. **Error Handling**: Throw errors to trigger automatic retries
5. **Internal by Default**: Subscription endpoints should be internal (no auth required)
6. **Type Safety**: All events are strongly typed
7. **Idempotency**: **CRITICAL** - Handlers MUST be idempotent (can be invoked multiple times safely)

---

## Folder Structure

### Required Structure

Every service using event processing must have two dedicated folders:

```
/services/{service-name}/
  ├── topics/               # Topic definitions and event interfaces
  │   └── {event}.topic.ts
  └── subscriptions/        # Subscription handlers
      └── {event}.subscription.ts
  └── controllers/          # Controllers called by subscriptions
      └── _{event}Process.controller.ts
  └── services/             # Business logic
      └── {domain}.service.ts
  └── interfaces/           # Shared interfaces
      └── interfaces.ts
```

### Example: Demo Service

```
/services/demo_service/
  ├── topics/
  │   └── demoContentCreated.topic.ts
  ├── subscriptions/
  │   └── demoContentCreated.subscription.ts
  ├── controllers/
  │   └── _processDemoContentCreated.controller.ts
  ├── services/
  │   └── demo.service.ts
  ├── repositories/
  │   └── demoContent.repository.ts
  ├── schemas/
  │   └── demoContent.schema.ts
  └── interfaces/
      └── interfaces.ts
```

---

## Topic Definition

Topics define the events that can be published and consumed. Each topic has:
- Event interface definition
- Topic configuration
- Delivery guarantees

### Pattern

**File:** `topics/{eventName}.topic.ts`

```typescript
import { Topic } from "encore.dev/pubsub";

/**
 * Topic for broadcasting {event name} events
 */
export const {eventName}Topic = new Topic<{EventName}Event>("{event-name-kebab}", {
  deliveryGuarantee: "at-least-once",
});

/**
 * Event interface for {event name}
 *
 * Best Practice: Keep events minimal - only include IDs
 * Subscribers fetch full data as needed
 *
 * IMPORTANT: Subscribers MUST implement idempotent processing
 * Events can be delivered multiple times due to "at-least-once" guarantee
 */
export interface {EventName}Event {
  // Primary identifier(s) only
  id: string;
}
```

### Real Example

**File:** `topics/demoContentCreated.topic.ts`

```typescript
import { Topic } from "encore.dev/pubsub";

/**
 * Topic for broadcasting demo content creation events
 * Subscribers can react to content creation for cache invalidation,
 * notifications, analytics, etc.
 */
export const demoContentCreatedTopic = new Topic<DemoContentCreatedEvent>("demo-content-created", {
  deliveryGuarantee: "at-least-once",
});

export interface DemoContentCreatedEvent {
  contentId: string;
}
```

### Topic Configuration Options

| Option | Values | Description |
|--------|--------|-------------|
| `deliveryGuarantee` | `"at-least-once"` | Messages delivered at least once (may be duplicated) |
| | `"exactly-once"` | Messages delivered exactly once (no duplicates) |

**Recommendation:** Use `"at-least-once"` for most use cases.

**⚠️ CRITICAL: Idempotency Required**

With `"at-least-once"` delivery, events can be delivered multiple times:
- Same event may arrive more than once
- Handler can be invoked multiple times for the same event
- **Your processing MUST be idempotent** (safe to execute multiple times)

Without idempotent handlers, you risk:
- Duplicate data creation
- Multiple notifications sent
- Incorrect state updates
- Data corruption

---

## Subscription Definition

Subscriptions consume events from topics and delegate processing to controllers. They must:
- Call internal controllers (not services directly)
- Handle errors by throwing (triggers retry)
- Be named with underscore prefix
- Configure retry policies

### Pattern

**File:** `subscriptions/{eventName}.subscription.ts`

```typescript
import { Subscription } from "encore.dev/pubsub";
import type { {EventName}Event } from "../topics/{eventName}.topic";
import { {eventName}Topic } from "../topics/{eventName}.topic";
import { {serviceName} } from "~encore/clients";

/**
 * Subscription handler for {event name} events
 * Delegates processing to internal controller
 *
 * This demonstrates the correct pattern:
 * 1. Subscription calls internal controller (not service directly)
 * 2. Throws error on failure to trigger retry
 * 3. Includes retry policy configuration
 */
export const _{eventName}Subscription = new Subscription(
  {eventName}Topic,
  "{event-name-subscription}",
  {
    handler: async (event: {EventName}Event): Promise<{EventName}Response> => {
      // Call internal controller - NOT service directly
      // If processing fails, the service will throw an error automatically
      return await {serviceName}._{processEvent}(event);
    },
    retryPolicy: {
      maxRetries: 10,      // Number of retry attempts
      minBackoff: "10s",   // Minimum wait between retries
      maxBackoff: "10m",   // Maximum wait between retries (exponential backoff)
    },
  }
);

/**
 * Response interface for {event name} processing
 */
export interface {EventName}Response {
  success: boolean;
}
```

### Real Example

**File:** `subscriptions/demoContentCreated.subscription.ts`

```typescript
import { Subscription } from "encore.dev/pubsub";
import type { DemoContentCreatedEvent } from "../topics/demoContentCreated.topic";
import { demoContentCreatedTopic } from "../topics/demoContentCreated.topic";
import { demo_service } from "~encore/clients";

/**
 * Subscription handler for demo content creation events
 * Delegates processing to internal controller
 *
 * This demonstrates the correct pattern:
 * 1. Subscription calls internal controller (not service directly)
 * 2. Throws error on failure to trigger retry
 * 3. Includes retry policy configuration
 */
export const _demoContentCreatedSubscription = new Subscription(
  demoContentCreatedTopic,
  "process-demo-content-created",
  {
    handler: async (event: DemoContentCreatedEvent): Promise<DemoContentCreatedResponse> => {
      // Call internal controller - NOT service directly
      // If processing fails, the service will throw an error automatically
      return await demo_service._processDemoContentCreated(event);
    },
    retryPolicy: {
      maxRetries: 10,
      minBackoff: "10s",
      maxBackoff: "10m",
    },
  }
);

/**
 * Response interface for demo content creation processing
 */
export interface DemoContentCreatedResponse {
  success: boolean;
}
```

### Retry Policy Configuration

| Option | Type | Description |
|--------|------|-------------|
| `maxRetries` | `number` | Maximum number of retry attempts |
| `minBackoff` | `string` | Minimum delay between retries (e.g., "10s", "1m") |
| `maxBackoff` | `string` | Maximum delay between retries (e.g., "10m", "1h") |

**Best Practices:**
- Start with conservative retry settings
- Use exponential backoff (minBackoff → maxBackoff)
- Consider the criticality of the event when setting maxRetries
- For critical events: `maxRetries: 20+`
- For non-critical events: `maxRetries: 3-5`

---

## Controller for Subscription

Subscriptions should always call internal controllers. Controllers validate inputs, perform authorization if needed, and delegate to services.

### Pattern

**File:** `controllers/_{eventName}Process.controller.ts`

```typescript
import { api } from "encore.dev/api";
import { {domain}Service } from "../services/{domain}.service";
import type { {EventName}Response } from "../subscriptions/{eventName}.subscription";
import type { {EventName}Event } from "../topics/{eventName}.topic";

/**
 * Internal controller for processing {event name} events
 * Called by subscription handlers
 *
 * This demonstrates the correct pattern:
 * 1. Prefixed with underscore (_) for internal use
 * 2. expose: false (not exposed to external APIs)
 * 3. auth: false (no auth required for service-to-service)
 * 4. Delegates to service layer for business logic
 */
export const _{processEvent} = api(
  {
    method: "POST",
    path: "/{service-name}/internal/{event-name}/process",
    expose: false,  // Internal only - not exposed to external APIs
    auth: false,    // No auth required (trusted service-to-service communication)
  },
  async (event: {EventName}Event): Promise<{EventName}Response> => {
    // Delegate to service layer for business logic
    // NOTE: Assign to variable first — never `return await` directly (rule: no return await)
    const result = await {domain}Service.process{Event}(event);
    return result;
  }
);
```

### Real Example

**File:** `controllers/_processDemoContentCreated.controller.ts`

```typescript
import { api } from "encore.dev/api";
import { demoService } from "../services/demo.service";
import type { DemoContentCreatedResponse } from "../subscriptions/demoContentCreated.subscription";
import type { DemoContentCreatedEvent } from "../topics/demoContentCreated.topic";

/**
 * Internal controller for processing demo content creation events
 * Called by subscription handlers
 *
 * This demonstrates the correct pattern:
 * 1. Prefixed with underscore (_) for internal use
 * 2. expose: false (not exposed to external APIs)
 * 3. auth: false (no auth required for service-to-service)
 * 4. Delegates to service layer for business logic
 */
export const _processDemoContentCreated = api(
  {
    method: "POST",
    path: "/demo-service/internal/demo-content-created/process",
    expose: false, // Internal only - not exposed to external APIs
    auth: false, // No auth required (trusted service-to-service communication)
  },
  async (event: DemoContentCreatedEvent): Promise<DemoContentCreatedResponse> => {
    // Delegate to service layer for business logic
    const result = await demoService.processDemoContentCreated(event);
    return result;
  }
);
```

### Why Controllers, Not Services?

**⚠️ PRODUCTION REQUIREMENT — Not just a style rule:**

Services are **not deployable units** in Encore. Only `api()` endpoints are. Calling a service class directly from a subscription works locally but **breaks in production** where each service runs as a separate deployable unit.

**Wrong (breaks in production):**
```typescript
import { demoService } from "../services/demo.service";
handler: async (event) => demoService.processDemoContentCreated(event) // NEVER do this
```

**Right:**
```typescript
import { demo_service } from "~encore/clients"; // always via Encore clients
handler: async (event) => demo_service._processDemoContentCreated(event)
```

**Additional reasons:**
1. **Consistency**: All entry points (HTTP, PubSub) go through controllers
2. **Authorization**: Controllers can inject auth checks if needed
3. **Validation**: Controllers handle request validation
4. **Observability**: Better tracing and monitoring at controller layer
5. **Service Isolation**: Services remain decoupled from transport concerns

---

## Publishing Events

Events are published from services using the topic's `publish()` method.

### Pattern

**In Service Layer:**

```typescript
import { {eventName}Topic } from "../topics/{eventName}.topic";
import type { {EventName}Event } from "../topics/{eventName}.topic";

class {Domain}Service {
  async performOperation(params: OperationParams): Promise<OperationResponse> {
    // ... business logic ...

    // Publish event when operation completes
    const event: {EventName}Event = {
      id: result.id,
      timestamp: new Date().toISOString(),
      // ... other event data
    };

    // Publish event asynchronously
    await {eventName}Topic.publish(event);

    return result;
  }
}
```

### Real Example

```typescript
import { staticVideoReady } from "../topics/staticVideoReady.topic";
import type { StaticVideoReadyEvent } from "../topics/staticVideoReady.topic";

class VideoService {
  async createStaticVideo(params: CreateStaticVideoRequest): Promise<CreateStaticVideoResponse> {
    // Create static video processing job
    const result = await this.processVideo(params);

    // Publish event when video is ready
    const event: StaticVideoReadyEvent = {
      videoId: result.id,
    };

    await staticVideoReady.publish(event);

    return result;
  }
}
```

---

## Error Handling & Retries

### Throw Errors to Trigger Retries

When a subscription handler encounters an error, the **service throws an exception** to trigger automatic retry:

```typescript
export const _eventSubscription = new Subscription(eventTopic, "subscription-name", {
  handler: async (event: EventType): Promise<EventProcessedResponse> => {
    // Call internal controller
    // If processing fails, the service will throw an error automatically to trigger retry
    return await serviceName._processEvent(event);
  },
  retryPolicy: {
    maxRetries: 10,
    minBackoff: "10s",
    maxBackoff: "10m",
  },
});

export interface EventProcessedResponse {
  success: boolean;
}
```

**Service Implementation:**

```typescript
class MyService {
  async processEvent(event: EventType): Promise<EventProcessedResponse> {
    // Process the event
    const result = await this.doSomething(event);

    if (!result) {
      // Throw error to trigger retry
      throw APIError.internal("Processing failed");
    }

    // Return success
    return { success: true };
  }
}
```

### Idempotent Handlers (CRITICAL)

**⚠️ REQUIRED: All handlers MUST be idempotent**

Since the event processing system uses `at-least-once` delivery, handlers **WILL** receive duplicate events. This is not a bug - it's how the system guarantees delivery.

**Why events are delivered multiple times:**
- Delivery guarantee: "at-least-once" means events can arrive more than once
- Network issues or timeouts during processing
- Service restarts during event processing
- Retry mechanism after errors

**Your handler will be invoked multiple times with the same event**. Design all handlers to be **idempotent**:

```typescript
class DemoService {
  async processDemoContentCreated(event: DemoContentCreatedEvent): Promise<DemoContentCreatedResponse> {
    // Check if already processed (idempotency)
    const content = await this.demoContentRepository.findById(event.contentId);

    if (!content) {
      // Content doesn't exist, throw error to retry
      throw APIError.notFound(`Content not found: ${event.contentId}`);
    }

    // Check if already processed based on some flag or timestamp
    if (content.processedAt) {
      log.info("Event already processed, skipping", { contentId: event.contentId });
      return { success: true };
    }

    // Process the content
    // ... processing logic ...

    return { success: true };
  }
}
```

### Dead Letter Queue (DLQ)

After `maxRetries` is exhausted, events go to a Dead Letter Queue (DLQ). Monitor DLQs for:
- Systematic failures
- Data quality issues
- Service degradation

**Recommendation:** Set up alerts for DLQ depth.

---

## Complete Example: Demo Content Created Event

This example shows the complete implementation of a PubSub pattern from the demo_service. All files follow the exact patterns we've established.

### 1. Define Topic

**File:** `topics/demoContentCreated.topic.ts`

```typescript
import { Topic } from "encore.dev/pubsub";

/**
 * Topic for broadcasting demo content creation events
 * Subscribers can react to content creation for cache invalidation,
 * notifications, analytics, etc.
 */
export const demoContentCreatedTopic = new Topic<DemoContentCreatedEvent>("demo-content-created", {
  deliveryGuarantee: "at-least-once",
});

/**
 * Event interface for demo content creation
 * This event is published when demo content is created
 *
 * Following minimal-event guidance:
 * - Contains only IDs and metadata
 * - Consumers must fetch full content using contentId
 */
export interface DemoContentCreatedEvent {
  contentId: string;
}
```

### 2. Create Subscription

**File:** `subscriptions/demoContentCreated.subscription.ts`

```typescript
import { Subscription } from "encore.dev/pubsub";
import type { DemoContentCreatedEvent } from "../topics/demoContentCreated.topic";
import { demoContentCreatedTopic } from "../topics/demoContentCreated.topic";
import { demo_service } from "~encore/clients";

/**
 * Subscription handler for demo content creation events
 * Delegates processing to internal controller
 *
 * This demonstrates the correct pattern:
 * 1. Subscription calls internal controller (not service directly)
 * 2. Throws error on failure to trigger retry
 * 3. Includes retry policy configuration
 */
export const _demoContentCreatedSubscription = new Subscription(
  demoContentCreatedTopic,
  "process-demo-content-created",
  {
    handler: async (event: DemoContentCreatedEvent): Promise<DemoContentCreatedResponse> => {
      // Call internal controller - NOT service directly
      // If processing fails, the service will throw an error automatically
      return await demo_service._processDemoContentCreated(event);
    },
    retryPolicy: {
      maxRetries: 10,
      minBackoff: "10s",
      maxBackoff: "10m",
    },
  }
);

/**
 * Response interface for demo content creation processing
 */
export interface DemoContentCreatedResponse {
  success: boolean;
}
```

### 3. Create Controller

**File:** `controllers/_processDemoContentCreated.controller.ts`

```typescript
import { api } from "encore.dev/api";
import { demoService } from "../services/demo.service";
import type { DemoContentCreatedResponse } from "../subscriptions/demoContentCreated.subscription";
import type { DemoContentCreatedEvent } from "../topics/demoContentCreated.topic";

/**
 * Internal controller for processing demo content creation events
 * Called by subscription handlers
 *
 * This demonstrates the correct pattern:
 * 1. Prefixed with underscore (_) for internal use
 * 2. expose: false (not exposed to external APIs)
 * 3. auth: false (no auth required for service-to-service)
 * 4. Delegates to service layer for business logic
 */
export const _processDemoContentCreated = api(
  {
    method: "POST",
    path: "/demo-service/internal/demo-content-created/process",
    expose: false, // Internal only - not exposed to external APIs
    auth: false, // No auth required (trusted service-to-service communication)
  },
  async (event: DemoContentCreatedEvent): Promise<DemoContentCreatedResponse> => {
    // Delegate to service layer for business logic
    const result = await demoService.processDemoContentCreated(event);
    return result;
  }
);
```

### 4. Implement Service Logic

**File:** `services/demo.service.ts`

```typescript
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { DemoContentCreatedResponse } from "../subscriptions/demoContentCreated.subscription";
import type { DemoContentCreatedEvent } from "../topics/demoContentCreated.topic";
import { demoContentRepository } from "../repositories/demoContent.repository";
import type { DemoContent } from "../interfaces/interfaces";

class DemoService {
  /**
   * Process demo content creation events from event processing system
   * This demonstrates:
   * - Idempotent handling (checking if already processed)
   * - Error handling that allows retries (throws errors to trigger retry)
   * - Business logic triggered by events
   */
  async processDemoContentCreated(event: DemoContentCreatedEvent): Promise<DemoContentCreatedResponse> {
    log.info("Processing demo content creation event", {
      contentId: event.contentId,
    });

    // Fetch the full content data (the event only contains the ID)
    const content = await demoContentRepository.getById<DemoContent>(event.contentId);

    if (!content) {
      log.error("Content not found for processing", {
        contentId: event.contentId,
      });
      // Throw error to trigger retry
      throw APIError.notFound(`Content not found: ${event.contentId}`);
    }

    // Here you would implement your business logic
    // Examples:
    // - Invalidate cache
    // - Update search index
    // - Send notifications
    // - Trigger downstream processes
    // - Update analytics

    log.info("Processing new content creation", {
      contentId: event.contentId,
      text: content.text,
    });

    // Example: Update search index, send notifications, etc.
    // await searchIndexService.indexContent(content);
    // await notificationService.notifyContentCreated(content);

    log.info("Successfully processed demo content creation", {
      contentId: event.contentId,
    });

    return { success: true };
  }
}

export const demoService = new DemoService();
```

### 5. Publish Event

**File:** `services/demo.service.ts` (publishing side)

```typescript
import { demoContentCreatedTopic } from "../topics/demoContentCreated.topic";
import type { DemoContentCreatedEvent } from "../topics/demoContentCreated.topic";

class DemoService {
  async createContent(request: CreateDemoContentRequest): Promise<CreateDemoContentResponse> {
    // Create content in database
    const data = await demoContentRepository.create(request);

    // Publish event to notify subscribers
    // Note: Only send IDs - subscribers will fetch full data if needed
    const event: DemoContentCreatedEvent = {
      contentId: data.id,
    };

    await demoContentCreatedTopic.publish(event);

    return { data };
  }
}
```

---

## Complete Example (Alternative): Deal Content Change Event

### 1. Define Topic

**File:** `topics/dealContentChanged.topic.ts`

```typescript
import { Topic } from "encore.dev/pubsub";

/**
 * Event interface for deal content changes
 */
export interface DealContentChangedEvent {
  dealUid: string;
  changeType: "created" | "updated" | "deleted";
  timestamp: string;
  changedBy: string;
}

/**
 * Topic for broadcasting deal content change events
 */
export const dealContentChanged = new Topic<DealContentChangedEvent>("deal-content-changed", {
  deliveryGuarantee: "at-least-once",
});
```

### 2. Create Subscription

**File:** `subscriptions/dealContentChanged.subscription.ts`

```typescript
import { Subscription } from "encore.dev/pubsub";
import { dealService } from "~encore/clients";
import type { DealContentChangedEvent } from "../topics/dealContentChanged.topic";
import { dealContentChanged } from "../topics/dealContentChanged.topic";

/**
 * Process deal content change events
 * Triggers cache invalidation and downstream notifications
 */
export const _dealContentChangedSubscription = new Subscription(
  dealContentChanged,
  "process-deal-content-change",
  {
    handler: async (event: DealContentChangedEvent): Promise<void> => {
      // Call internal controller
      // If processing fails, the service will throw an error automatically
      await dealService._processDealContentChange(event);
    },
    retryPolicy: {
      maxRetries: 15,
      minBackoff: "5s",
      maxBackoff: "5m",
    },
  }
);
```

### 3. Create Controller

**File:** `controllers/_processDealContentChange.controller.ts`

```typescript
import { api } from "encore.dev/api";
import type { DealContentChangedEvent } from "../topics/dealContentChanged.topic";
import { dealService } from "../services/deal.service";

/**
 * Internal controller for processing deal content change events
 * Invalidates caches and triggers downstream updates
 */
export const _processDealContentChange = api(
  {
    method: "POST",
    path: "/deal/internal/content-change/process",
    expose: false,
    auth: false,
  },
  async (event: DealContentChangedEvent): Promise<void> => {
    // Service will throw error automatically if processing fails
    await dealService.processDealContentChange(event);
  }
);
```

### 4. Implement Service Logic

**File:** `services/deal.service.ts`

```typescript
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { DealContentChangedEvent } from "../topics/dealContentChanged.topic";
import { dealRepository } from "../repositories/deal.repository";
import { cacheService } from "@/cache/cache.service";

class DealService {
  async processDealContentChange(event: DealContentChangedEvent): Promise<void> {
    // Check idempotency - skip if already processed
    const isProcessed = await this.checkIfProcessed(event);
    if (isProcessed) {
      log.info("Event already processed, skipping", { event });
      return;
    }

    // Invalidate cache for this deal
    await cacheService.invalidate(`deal:${event.dealUid}`);

    // Trigger any downstream processes based on change type
    if (event.changeType === "deleted") {
      await this.handleDealDeletion(event.dealUid);
    }

    // Mark as processed
    await this.markAsProcessed(event);

    log.info("Successfully processed deal content change", { dealUid: event.dealUid });
  }

  private async checkIfProcessed(event: DealContentChangedEvent): Promise<boolean> {
    // Implementation: Check if event already processed
    return false;
  }

  private async markAsProcessed(event: DealContentChangedEvent): Promise<void> {
    // Implementation: Mark event as processed
  }

  private async handleDealDeletion(dealUid: string): Promise<void> {
    // Implementation: Handle deal deletion logic
  }
}

export const dealService = new DealService();
```

### 5. Publish Event

**File:** `services/deal.service.ts` (publishing side)

```typescript
import { dealContentChanged } from "../topics/dealContentChanged.topic";
import type { DealContentChangedEvent } from "../topics/dealContentChanged.topic";

class DealService {
  async updateDealContent(params: UpdateDealContentRequest): Promise<UpdateDealContentResponse> {
    // Update deal content in database
    const updatedDeal = await dealRepository.update(params.dealUid, params);

    // Publish event to notify subscribers
    const event: DealContentChangedEvent = {
      dealUid: params.dealUid,
      changeType: "updated",
      timestamp: new Date().toISOString(),
      changedBy: params.updatedBy,
    };

    await dealContentChanged.publish(event);

    return { deal: updatedDeal };
  }
}
```

---

## Best Practices

### 1. Event Design

✅ **DO:**
- Keep events minimal - **only include IDs** (best practice)
- Subscribers fetch full data as needed
- Use immutable event structures
- Version events if schema may change
- Document what the ID represents

❌ **DON'T:**
- Include full object data (use ID references instead)
- Include large payloads or nested objects
- Include sensitive data without encryption
- Include computed or derived data
- Change event structure without versioning

**Why Minimal Events?**
- Reduces message size and network overhead
- Avoids data staleness issues
- Allows subscribers to get latest data
- Prevents exposing unnecessary information
- Makes events more reusable

### 2. Naming Conventions

**Topics:**
- Use snake_case: `deal_content_changed`
- Be descriptive: `user-profile-updated` not `user-event`
- Use past tense for events: `order-created` not `create-order`

**Subscriptions:**
- Prefix with underscore: `_dealContentChangedSubscription`
- Describe the action: `_processOrderCreated`

**Controllers:**
- Prefix with underscore: `_processDealContentChange`
- Start with `_process` or `_handle`: `_processVideoReady`

### 3. Error Handling

✅ **DO:**
- Throw errors to trigger retries
- Log all errors with context
- **Implement idempotent handlers (REQUIRED)**
- Set appropriate retry policies
- Monitor Dead Letter Queues
- Check if event already processed before doing work

❌ **DON'T:**
- Swallow errors silently
- Retry forever without limits
- **Assume events arrive only once (they WILL arrive multiple times)**
- Process without idempotency checks
- Create duplicate data or side effects

### 4. Testing

**Test subscriptions with:**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dealService } from "~encore/clients";
import type { DealContentChangedEvent } from "../topics/dealContentChanged.topic";

vi.mock("~encore/clients", () => ({
  dealService: {
    _processDealContentChange: vi.fn(),
  },
}));

describe("Deal Content Changed Subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process deal content change successfully", async () => {
    const event: DealContentChangedEvent = {
      dealUid: "deal-123",
      changeType: "updated",
      timestamp: new Date().toISOString(),
      changedBy: "user-456",
    };

    vi.mocked(dealService._processDealContentChange).mockResolvedValue({
      success: true,
    });

    // Test subscription handler directly
    await expect(
      subscriptionHandler(event)
    ).resolves.not.toThrow();

    expect(dealService._processDealContentChange).toHaveBeenCalledWith(event);
  });

  it("should throw error on processing failure", async () => {
    const event: DealContentChangedEvent = {
      dealUid: "deal-123",
      changeType: "updated",
      timestamp: new Date().toISOString(),
      changedBy: "user-456",
    };

    vi.mocked(dealService._processDealContentChange).mockResolvedValue({
      success: false,
      error: "Database error",
    });

    // Should throw to trigger retry
    await expect(
      subscriptionHandler(event)
    ).rejects.toThrow();
  });
});
```

### 5. Monitoring

**Monitor:**
- Subscription lag (time between publish and process)
- Retry rates
- Dead Letter Queue depth
- Processing duration
- Error rates by event type

**Set alerts for:**
- DLQ depth > 0
- Subscription lag > 5 minutes
- Error rate > 5%
- Processing duration > 30 seconds

---

## Common Patterns

### Pattern 1: Cache Invalidation

```typescript
// Publish event when data changes
await cacheInvalidationTopic.publish({
  cacheKey: `user:${userId}`,
  operation: "invalidate",
});

// Subscribe to invalidate cache
const _cacheInvalidationSubscription = new Subscription(
  cacheInvalidationTopic,
  "invalidate-cache",
  {
    handler: async (event) => {
      await cacheService.invalidate(event.cacheKey);
    },
  }
);
```

### Pattern 2: Async Processing

```typescript
// Publish event for expensive operation
await videoProcessingTopic.publish({
  videoId: video.id,
  operation: "transcode",
});

// Subscribe to process asynchronously
const _videoProcessingSubscription = new Subscription(
  videoProcessingTopic,
  "process-video",
  {
    handler: async (event) => {
      await video._processVideo(event);
    },
    retryPolicy: {
      maxRetries: 20,
      minBackoff: "30s",
      maxBackoff: "30m",
    },
  }
);
```

### Pattern 3: Fan-Out (Multiple Subscribers)

```typescript
// One topic, multiple subscribers
export const orderCreatedTopic = new Topic<OrderCreatedEvent>("order-created", {
  deliveryGuarantee: "at-least-once",
});

// Subscriber 1: Send email
const _orderEmailSubscription = new Subscription(orderCreatedTopic, "send-email", {
  handler: async (event) => await email._sendOrderConfirmation(event),
});

// Subscriber 2: Update inventory
const _orderInventorySubscription = new Subscription(orderCreatedTopic, "update-inventory", {
  handler: async (event) => await inventory._updateStock(event),
});

// Subscriber 3: Analytics
const _orderAnalyticsSubscription = new Subscription(orderCreatedTopic, "track-analytics", {
  handler: async (event) => await analytics._trackOrder(event),
});
```

---

## Migration Guide

### From Direct Service Calls

**Before (❌ Wrong):**
```typescript
// Subscription calling service directly
export const _videoSubscription = new Subscription(videoTopic, "process-video", {
  handler: async (event: VideoEvent): Promise<void> => {
    // WRONG: Calling service directly
    await videoService.processVideo(event);
  },
});
```

**After (✅ Correct):**
```typescript
// Subscription calling controller with response interface
export const _videoSubscription = new Subscription(videoTopic, "process-video", {
  handler: async (event: VideoEvent): Promise<VideoProcessedResponse> => {
    // CORRECT: Calling internal controller
    // Service will throw error automatically if processing fails
    return await video._processVideo(event);
  },
});

export interface VideoProcessedResponse {
  success: boolean;
}
```

### Adding Folder Structure

**Steps:**
1. Create `topics/` folder in service root
2. Create `subscriptions/` folder in service root
3. Move topic definitions to `topics/{event}.topic.ts`
   - Topic definition first, interface at bottom
4. Move subscriptions to `subscriptions/{event}.subscription.ts`
   - Add response interface at bottom of file
5. Create internal controllers in `controllers/_{event}Process.controller.ts`
   - Import response interface from subscription file
   - Return the response type
6. Update service methods to return response with `{ success: true }`
7. Update imports in all files

---

## Troubleshooting

### Subscription Not Processing Events

**Check:**
1. ✅ Topic and subscription are properly exported
2. ✅ Subscription file is in `subscriptions/` folder
3. ✅ Service is running and healthy
4. ✅ No errors in service logs

### Events Being Retried Forever

**Solution:**
- Ensure handler throws errors on failure
- Check `maxRetries` is set appropriately
- Verify DLQ is configured
- Add idempotency checks

### Duplicate Event Processing

**Solution:**
- Implement idempotent handlers
- Use database constraints (unique keys)
- Track processed events in dedicated table
- Check event timestamp/ID before processing

---

## References

### Internal Documentation

- [Controllers & API Endpoints](controllers_api_endpoints.md)
- [Service Architecture Patterns](service_architecture_patterns.md)
- [Error Handling](errors.md)
- [Testing Standards](testing_standards.md)

### External Documentation

- [Encore Pub/Sub Documentation](https://encore.dev/docs/primitives/pubsub)
- [Event-Driven Architecture Patterns](https://martinfowler.com/articles/201701-event-driven.html)

---

## Summary Checklist

When implementing event processing in your service:

- [ ] Create `topics/` and `subscriptions/` folders
- [ ] Define topic first, then event interface at bottom in topic file
- [ ] **Keep event minimal - only include ID(s), not full data**
- [ ] Configure topic with delivery guarantee
- [ ] Create subscription with retry policy
- [ ] Define response interface at bottom of subscription file with `success: boolean`
- [ ] Subscription returns `Promise<Response>` and calls controller
- [ ] Create internal controller (prefixed with `_`)
- [ ] Set `expose: false` and `auth: false` on controller
- [ ] Controller imports response interface from subscription file
- [ ] Controller calls service via `const result = await ...; return result;` — **never `return await`**
- [ ] Subscription calls controller via `~encore/clients` — **never import service class directly**
- [ ] **Service fetches full data using ID from event**
- [ ] Service returns `{ success: true }` on success
- [ ] Service throws errors to trigger retry (APIError.notFound, etc.)
- [ ] Implement idempotent processing in service
- [ ] Add comprehensive error logging
- [ ] Write unit tests for subscription handler
- [ ] Monitor DLQ depth and subscription lag
- [ ] Document event schema in interfaces

---

**Remember: Event processing enables scalable, decoupled architectures. Follow these patterns to ensure reliable event processing.**

