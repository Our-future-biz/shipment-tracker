# Service Startup Handler (OnStart)

## Service Startup Handler (OnStart)

### Overview

The Service Startup Handler provides a standardized way to initialize services, recover from previous shutdowns, and ensure your application starts in a consistent state. This is crucial for services that manage background jobs, maintain state, or need to perform recovery operations after deployments or restarts.

### Why Use Startup Handlers?

Without proper startup handling, your services might:

- Leave work incomplete from previous runs
- Miss processing queued items
- Start with inconsistent state
- Fail to recover from unexpected shutdowns
- Have timing issues with service dependencies

Startup handlers ensure your services initialize properly and can resume work from where they left off.

### Key Benefits

- **State Recovery**: Resume work that was interrupted during shutdown
- **Job Resumption**: Re-queue background jobs that were in progress
- **Environment Awareness**: Behave differently across environments (dev/staging/prod)
- **Dependency Management**: Ensure services start in the correct order
- **Idempotent Operations**: Safe to run multiple times without side effects

### Basic Concepts

#### 1. Deployment Complete Pattern

The most common pattern uses PubSub subscriptions to the `deploymentComplete` topic:

```typescript
import { deploymentComplete } from "@/_core_system/root/topics/deploymentComplete.topic";
import { Subscription } from "encore.dev/pubsub";
import { yourService } from "~encore/clients";

export const _onStartServer = new Subscription(
  deploymentComplete,
  "your-service-startup",
  {
    handler: async (): Promise<void> => {
      //  Some private API
      await yourService._onStartServer();

      // Or call some same service hosted function
    },
  }
);
```

#### 2. OnStart API Endpoint

Create an internal API endpoint for your startup logic:

```typescript
import { api } from "encore.dev/api";

export interface SuccessResponse {
  success: boolean;
}

export const _onStartServer = api(
  {
    expose: false,
    method: "GET",
    path: "/your-service/on-start",
  },
  async (): Promise<SuccessResponse> => {
    return await yourService.onStartServer();
  }
);
```

#### 3. Service Implementation

Implement the startup logic in your service:

```typescript
import log from "encore.dev/log";

interface SuccessResponse {
  success: boolean;
}

class YourService {
  async onStartServer(): Promise<SuccessResponse> {
    log.info("Service startup initiated");

    // Your initialization logic here
    await this.recoverPendingWork();
    await this.initializeConnections();
    await this.validateSystemState();

    log.info("Service startup completed");
    return { success: true };
  }

  private async recoverPendingWork(): Promise<void> {
    // Recovery logic
  }

  private async initializeConnections(): Promise<void> {
    // Connection setup
  }

  private async validateSystemState(): Promise<void> {
    // Validation logic
  }
}
```

### Real-World Example: Tagging Service

Here's how the tagging service implements startup handling to recover interrupted background jobs:

#### Controller Endpoint

```typescript
// apps/encore-ts/services/tagging/controllers/_onStartServer.controller.ts
import { api } from "encore.dev/api";
import { taggingJobsService } from "../services/tagging-jobs.service";

export interface SuccessResponse {
  success: boolean;
}

export const onStartServer = api(
  {
    expose: false,
    method: "GET",
    path: "/internal/tagging/jobs/on-start",
  },
  async (): Promise<SuccessResponse> => {
    return await taggingJobsService.onStartServer();
  }
);
```

#### PubSub Subscription

```typescript
// ./tagging/pubsub/_onStartServer.subscription.ts
import { deploymentComplete } from "@/_core_system/root/topics/deploymentComplete.topic";
import { ShutdownHandler } from "@core/runtime_utils/shutdown_handler";
import { Subscription } from "encore.dev/pubsub";
import { tagging } from "~encore/clients";
import service from "./encore.service";

export const _onStartServer = new Subscription(
  deploymentComplete,
  "tagging-on-start-server",
  {
    handler: async (): Promise<void> => {
      // Initialize the service
      await tagging.onStartServer();

      // Register shutdown handler after successful startup
      ShutdownHandler.create(
        async (): Promise<void> => {
          await tagging.shutdown();
        },
        { service }
      );
    },
  }
);
```

### Common Startup Patterns

#### 1. Cache Warming

Pre-populate caches with frequently accessed data:

```typescript
import log from "encore.dev/log";
import type { User } from "../schemas/user.schema";
import type { UserRepository } from "../repositories/user.repository";
import type { UserCache } from "../utils/cache.utils";

interface SuccessResponse {
  success: boolean;
}

class CacheService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userCache: UserCache
  ) {}

  async onStartServer(): Promise<SuccessResponse> {
    log.info("Cache service startup: Warming caches");

    try {
      // Warm up critical caches
      await Promise.all([
        this.warmUserCache(),
        this.warmConfigCache(),
        this.warmLocationCache(),
      ]);

      log.info("Cache warming completed successfully");
      return { success: true };
    } catch (error) {
      log.error(error, "Cache warming failed");
      // Don't fail startup for cache warming issues
      return { success: true };
    }
  }

  private async warmUserCache(): Promise<void> {
    const activeUsers = await this.userRepository.getActiveUsers();
    for (const user of activeUsers) {
      await this.userCache.set(user.id, user);
    }
  }

  private async warmConfigCache(): Promise<void> {
    // Config cache warming logic
  }

  private async warmLocationCache(): Promise<void> {
    // Location cache warming logic
  }
}

export const cacheService = new CacheService(userRepository, userCache);
```

#### 2. Connection Initialization

Establish connections to external services:

```typescript
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";

interface SuccessResponse {
  success: boolean;
}

class ExternalService {
  async onStartServer(): Promise<SuccessResponse> {
    log.info("External service startup: Initializing connections");

    try {
      // Initialize HTTP clients
      await this.initializeHttpClients();

      // Connect to message queues
      await this.connectToMessageQueues();

      // Validate external API connectivity
      await this.validateExternalAPIs();

      log.info("External service connections initialized");
      return { success: true };
    } catch (error) {
      log.error(error, "Failed to initialize external connections");
      throw APIError.internal("Failed to initialize external connections");
    }
  }

  private async initializeHttpClients(): Promise<void> {
    // HTTP client initialization
  }

  private async connectToMessageQueues(): Promise<void> {
    // Message queue connection
  }

  private async validateExternalAPIs(): Promise<void> {
    // External API validation
  }
}

export const externalService = new ExternalService();
```

#### 3. State Validation

Verify system state and data integrity:

```typescript
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import type { Database } from "../db/db";

interface SuccessResponse {
  success: boolean;
}

interface OrphanedRecord {
  id: string;
  type: string;
}

class ValidationService {
  constructor(private readonly database: Database) {}

  async onStartServer(): Promise<SuccessResponse> {
    log.info("Validation service startup: Checking system state");

    const issues: string[] = [];

    // Check database connectivity
    try {
      await this.database.healthCheck();
    } catch (error) {
      issues.push("Database connectivity failed");
    }

    // Validate configuration
    if (!this.validateConfig()) {
      issues.push("Configuration validation failed");
    }

    // Check for orphaned records
    const orphanedRecords = await this.findOrphanedRecords();
    if (orphanedRecords.length > 0) {
      log.warn("Found orphaned records", { count: orphanedRecords.length });
      await this.cleanupOrphanedRecords(orphanedRecords);
    }

    if (issues.length > 0) {
      log.error("System validation failed", { issues });
      throw APIError.internal(`Startup validation failed: ${issues.join(", ")}`);
    }

    log.info("System validation completed successfully");
    return { success: true };
  }

  private validateConfig(): boolean {
    // Configuration validation logic
    return true;
  }

  private async findOrphanedRecords(): Promise<OrphanedRecord[]> {
    // Find orphaned records logic
    return [];
  }

  private async cleanupOrphanedRecords(records: OrphanedRecord[]): Promise<void> {
    // Cleanup logic
  }
}

export const validationService = new ValidationService(database);
```

### Environment-Specific Behavior

#### Production/Staging Only Operations

```typescript
import log from "encore.dev/log";
import { appMeta } from "encore.dev";
import { isProduction, isStaging } from "@core/runtime_utils/utils";

interface SuccessResponse {
  success: boolean;
}

class ProductionService {
  async onStartServer(): Promise<SuccessResponse> {
    log.info("Production service startup");

    // Only perform expensive recovery operations in production
    if (!isProduction() && !isStaging()) {
      log.info("Skipping production-only startup operations");
      return { success: true };
    }

    // Expensive operations for production
    await this.performDataMigration();
    await this.syncWithExternalSystems();
    await this.generateReports();

    return { success: true };
  }

  private async performDataMigration(): Promise<void> {
    // Data migration logic
  }

  private async syncWithExternalSystems(): Promise<void> {
    // External sync logic
  }

  private async generateReports(): Promise<void> {
    // Report generation logic
  }
}

export const productionService = new ProductionService();
```

#### Development-Specific Setup

```typescript
import log from "encore.dev/log";
import { appMeta } from "encore.dev";
import { isLocal } from "@core/runtime_utils/utils";

interface SuccessResponse {
  success: boolean;
}

class DevelopmentService {
  async onStartServer(): Promise<SuccessResponse> {
    log.info("Development service startup");

    if (isLocal()) {
      // Development-only setup
      await this.seedTestData();
      await this.enableDebugLogging();
      await this.setupMockServices();
    }

    return { success: true };
  }

  private async seedTestData(): Promise<void> {
    // Test data seeding logic
  }

  private async enableDebugLogging(): Promise<void> {
    // Debug logging setup
  }

  private async setupMockServices(): Promise<void> {
    // Mock services setup
  }
}

export const developmentService = new DevelopmentService();
```

### Best Practices

#### 1. Idempotent Operations

Make startup operations safe to run multiple times:

```typescript
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";

interface SuccessResponse {
  success: boolean;
}

enum InitializationState {
  UNINITIALIZED = "UNINITIALIZED",
  INITIALIZING = "INITIALIZING",
  INITIALIZED = "INITIALIZED",
}

class IdempotentService {
  private state: InitializationState = InitializationState.UNINITIALIZED;

  async onStartServer(): Promise<SuccessResponse> {
    // Check if already initialized
    if (await this.isAlreadyInitialized()) {
      log.info("Service already initialized, skipping startup");
      return { success: true };
    }

    // Mark as initializing
    await this.markAsInitializing();

    try {
      await this.performInitialization();
      await this.markAsInitialized();
    } catch (error) {
      await this.markAsUninitialized();
      throw error;
    }

    return { success: true };
  }

  private async isAlreadyInitialized(): Promise<boolean> {
    return this.state === InitializationState.INITIALIZED;
  }

  private async markAsInitializing(): Promise<void> {
    this.state = InitializationState.INITIALIZING;
  }

  private async markAsInitialized(): Promise<void> {
    this.state = InitializationState.INITIALIZED;
  }

  private async markAsUninitialized(): Promise<void> {
    this.state = InitializationState.UNINITIALIZED;
  }

  private async performInitialization(): Promise<void> {
    // Initialization logic
  }
}

export const idempotentService = new IdempotentService();
```

#### 2. Error Handling

Decide whether errors should fail startup:

```typescript
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";

interface SuccessResponse {
  success: boolean;
}

class RobustService {
  async onStartServer(): Promise<SuccessResponse> {
    const criticalErrors: string[] = [];
    const warnings: string[] = [];

    // Critical operations (fail startup if these fail)
    try {
      await this.initializeCriticalSystems();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      criticalErrors.push(`Critical system initialization failed: ${message}`);
    }

    // Non-critical operations (warn but don't fail startup)
    try {
      await this.initializeOptionalFeatures();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Optional feature initialization failed: ${message}`);
    }

    if (warnings.length > 0) {
      log.warn("Startup warnings", { warnings });
    }

    if (criticalErrors.length > 0) {
      log.error("Critical startup errors", { errors: criticalErrors });
      throw APIError.internal(`Startup failed: ${criticalErrors.join(", ")}`);
    }

    return { success: true };
  }

  private async initializeCriticalSystems(): Promise<void> {
    // Critical system initialization
  }

  private async initializeOptionalFeatures(): Promise<void> {
    // Optional features initialization
  }
}

export const robustService = new RobustService();
```

#### 3. Timeout Protection

Prevent hanging startups:

```typescript
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";

interface SuccessResponse {
  success: boolean;
}

class TimeoutService {
  private readonly STARTUP_TIMEOUT = 30000; // 30 seconds

  async onStartServer(): Promise<SuccessResponse> {
    try {
      await Promise.race([
        this.performStartup(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(APIError.internal("Startup timeout")), this.STARTUP_TIMEOUT)
        ),
      ]);

      return { success: true };
    } catch (error) {
      log.error(error, "Startup failed or timed out");
      throw error;
    }
  }

  private async performStartup(): Promise<void> {
    // Your startup logic here
    await this.recoverState();
    await this.initializeConnections();
    await this.validateSystem();
  }

  private async recoverState(): Promise<void> {
    // State recovery logic
  }

  private async initializeConnections(): Promise<void> {
    // Connection initialization
  }

  private async validateSystem(): Promise<void> {
    // System validation
  }
}

export const timeoutService = new TimeoutService();
```

### Integration with Shutdown Handlers

Coordinate startup and shutdown handlers:

```typescript
// apps/encore-ts/services/your-service/pubsub/_onStartServer.subscription.ts
import { deploymentComplete } from "@/_core_system/root/topics/deploymentComplete.topic";
import { ShutdownHandler } from "@core/runtime_utils/shutdown_handler";
import { Subscription } from "encore.dev/pubsub";
import { yourService } from "~encore/clients";
import service from "../encore.service";

export const _onStartServer = new Subscription(
  deploymentComplete,
  "your-service-startup",
  {
    handler: async (): Promise<void> => {
      // 1. First, initialize the service
      await yourService.onStartServer();

      // 2. Then, register shutdown handler
      ShutdownHandler.create(
        async (): Promise<void> => {
          await yourService.shutdown();
        },
        { service }
      );
    },
  }
);
```

### Testing Startup Handlers

#### Unit Testing

```typescript
import { describe, it, expect, vi } from "vitest";
import type { JobRepository } from "../repositories/job.repository";
import type { JobQueue } from "../utils/queue.utils";

interface Job {
  id: number;
  status: string;
}

interface SuccessResponse {
  success: boolean;
}

class JobService {
  constructor(
    private readonly repository: JobRepository,
    private readonly queue?: JobQueue
  ) {}

  async onStartServer(): Promise<SuccessResponse> {
    const jobs = await this.repository.getJobsByStatus("IN_PROGRESS");

    if (this.queue) {
      for (const job of jobs) {
        await this.queue.publish({ jobId: job.id });
      }
    }

    return { success: true };
  }
}

describe("Startup Handler", () => {
  it("should recover pending jobs on startup", async () => {
    // Arrange
    const mockJobs: Job[] = [{ id: 1, status: "IN_PROGRESS" }];
    const mockRepository = {
      getJobsByStatus: vi.fn().mockResolvedValue(mockJobs),
    } as unknown as JobRepository;

    const mockQueue = {
      publish: vi.fn(),
    } as unknown as JobQueue;

    const service = new JobService(mockRepository, mockQueue);

    // Act
    await service.onStartServer();

    // Assert
    expect(mockRepository.getJobsByStatus).toHaveBeenCalledWith("IN_PROGRESS");
    expect(mockQueue.publish).toHaveBeenCalledWith({ jobId: 1 });
  });

  it("should handle startup errors gracefully", async () => {
    // Arrange
    const mockRepository = {
      getJobsByStatus: vi.fn().mockRejectedValue(new Error("Database error")),
    } as unknown as JobRepository;

    const service = new JobService(mockRepository);

    // Act & Assert
    await expect(service.onStartServer()).rejects.toThrow("Database error");
  });
});
```

#### Integration Testing

```typescript
import { describe, it, expect } from "vitest";
import { deploymentComplete } from "@/_core_system/root/topics/deploymentComplete.topic";

interface DeploymentEvent {
  deploymentId: string;
}

interface ServiceState {
  isInitialized(): boolean;
}

declare const service: ServiceState;

describe("Service Integration", () => {
  it("should complete full startup sequence", async () => {
    // Test the complete PubSub -> API -> Service flow
    const deploymentEvent: DeploymentEvent = {
      deploymentId: "test-123"
    };

    // Publish deployment complete event
    await deploymentComplete.publish(deploymentEvent);

    // Wait for startup to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify service is properly initialized
    expect(service.isInitialized()).toBe(true);
  });
});
```

### Troubleshooting

#### Common Issues

**1. Startup Hangs**

- Add timeout protection
- Check for infinite loops
- Verify external service connectivity

**2. Duplicate Initialization**

- Implement idempotent operations
- Add initialization state tracking
- Check for multiple subscription handlers

**3. Environment-Specific Failures**

- Verify environment detection logic
- Check configuration differences
- Test with realistic data volumes
