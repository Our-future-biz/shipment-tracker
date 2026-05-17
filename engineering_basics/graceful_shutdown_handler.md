# Graceful Shutdown Handler

# Graceful Shutdown Handler

## Overview

The ShutdownHandler is a utility class designed to provide graceful shutdown capabilities for Encore.ts services. It coordinates proper cleanup of resources, background jobs, and connections when the application receives termination signals, ensuring data integrity and preventing corruption during deployments or shutdowns.

## Why Use Graceful Shutdown?

Without proper shutdown handling, your services might:

- Leave background jobs in inconsistent states
- Lose in-progress work
- Corrupt data during writes
- Leave connections open
- Fail to clean up temporary resources

The ShutdownHandler ensures your services shut down cleanly and can resume work properly when restarted.

## Key Features

- **Multi-service coordination**: Handles shutdown across multiple services in a single process
- **Signal handling**: Responds to `SIGTERM`, `SIGINT`, and `SIGUSR2` signals
- **Timeout protection**: Prevents hanging shutdowns with configurable timeouts
- **Environment awareness**: Behaves differently in single-service vs multi-service deployments
- **Automatic coordination**: Services wait for each other to complete shutdown in multi-service environments

## Basic Usage

### 1. Import the ShutdownHandler

```javascript
import { ShutdownHandler } from "@core/runtime_utils/shutdown_handler";
import log from "encore.dev/log";
import service from "./encore.service";
```

### 2. Create a Shutdown Controller

The shutdown controller is a function that performs your cleanup logic:

```javascript
const shutdownController = async (): Promise<void> => {
  log.info("Starting graceful shutdown...");

  // Your cleanup logic here
  await cleanupBackgroundJobs();
  await closeConnections();
  await saveStateToDatabase();

  log.info("Shutdown completed successfully");
};
```

### 3. Register the Shutdown Handler

```javascript
// Create and register the shutdown handler
const shutdownHandler = ShutdownHandler.create(shutdownController, {
    service,
    // Optional: signals: ["SIGTERM", "SIGINT", "SIGUSR2"],
    // Optional: forceExit: false
});
```

## Real-World Example: Tagging Service

Here's how the tagging service implements graceful shutdown to handle background tagging jobs:

### Shutdown Handler Registration

```javascript
// apps/encore-ts/services/tagging/subscription.ts
import { ShutdownHandler } from "@core/runtime_utils/shutdown_handler";
import { tagging } from "~encore/clients";
import service from "./encore.service";

export const _onStartServer = new Subscription(
  deploymentComplete,
  "tagging-on-start-server",
  {
    handler: async () => {
      await tagging._onStartServer();

      // Register shutdown handler
      ShutdownHandler.create(
        async () => {
          await tagging.shutdown();
        },
        {
          service,
        }
      );
    },
  }
);
```

## Configuration Options

### Basic Options

```javascript
interface ShutdownOptions {
  service: Service; // Required: Your Encore service instance
  signals?: readonly NodeJS.Signals[]; // Optional: Signals to listen for
  forceExit?: boolean; // Optional: Force exit even in multi-service environments
}
```

### Signal Configuration

By default, the handler listens for:

- **SIGTERM** - Kubernetes/Docker termination
- **SIGINT** - Ctrl+C interrupt
- **SIGUSR2** - User-defined signal

You can customize the signals:

```javascript
ShutdownHandler.create(shutdownController, {
    service,
    signals: ["SIGTERM", "SIGINT"], // Only listen for these signals
});
```

### Force Exit Option

In multi-service environments, services normally wait for each other. Use `forceExit: true` to exit immediately:

```javascript
ShutdownHandler.create(shutdownController, {
    service,
    forceExit: true, // Exit immediately after this service completes
});
```

## Deployment Environment Behavior

### Single-Service Environment (Production)

- Service exits immediately after shutdown completion
- No coordination with other services needed
- Process terminates with exit code 0 on success, 1 on failure

### Multi-Service Environment (Local Development, Preview, Staging)

- Services register with a global coordinator
- First service to receive signal initiates global shutdown
- Each service waits for others to complete
- Process exits only when all services have finished
- 30-second timeout prevents hanging shutdowns

## Best Practices

### 1. Idempotent Shutdown Operations

Make your shutdown operations safe to run multiple times:

```javascript
const shutdownController = async (): Promise<void> => {
  // Check if already shut down
  if (isShutdownComplete) {
    return;
  }

  // Mark as shutting down
  isShutdownComplete = true;

  // Perform cleanup...
  await cleanup();
};
```

### 2. Handle Background Jobs Properly

Update job statuses to allow resumption on restart:

```javascript
const shutdownController = async (): Promise<void> => {
  // Mark in-progress jobs as pending so they can be retried
  await jobRepository.updateJobsStatus(
    JobStatus.IN_PROGRESS,
    JobStatus.PENDING
  );

  // Stop job processors
  await jobProcessor.stop();
};
```

### 3. Database Cleanup

Ensure database operations complete cleanly:

```javascript
const shutdownController = async (): Promise<void> => {
  // Wait for current transactions to complete
  await database.waitForTransactions();

  // Close connection pools
  await database.closeConnections();
};
```

### 4. External Service Cleanup

Clean up external connections and resources:

```javascript
const shutdownController = async (): Promise<void> => {
  // Close HTTP clients
  await httpClient.close();

  // Disconnect from message queues
  await messageQueue.disconnect();

  // Clean up temporary files
  await filesystem.cleanupTempFiles();
};
```

## Error Handling

### Shutdown Errors

If your shutdown controller throws an error:

```javascript
const shutdownController = async (): Promise<void> => {
  try {
    await riskyCleanupOperation();
  } catch (error) {
    log.error(error, "Shutdown operation failed");
    // Don't re-throw - let other services complete
    // Only throw if the error is critical
  }
};
```

### Timeout Handling

The global coordinator enforces a 30-second timeout:

```javascript
// If your service doesn't complete within 30 seconds,
// the process will be forcefully terminated
const shutdownController = async (): Promise<void> => {
  // Keep operations under 30 seconds total
  await Promise.race([
    performCleanup(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Cleanup timeout")), 25000)
    )
  ]);
};
```

## Common Patterns

### 1. PubSub Subscriptions

```javascript
// apps/encore-ts/services/your-service/subscription.ts
import { ShutdownHandler } from "@core/runtime_utils/shutdown_handler";
import { yourService } from "~encore/clients";
import service from "./encore.service";

export const _onDeploymentComplete = new Subscription(
  deploymentComplete,
  "your-service-startup",
  {
    handler: async () => {
      // Initialize your service
      await yourService._onStartServer();

      // Register shutdown handler
      ShutdownHandler.create(
        async () => {
          await yourService.shutdown();
        },
        { service }
      );
    },
  }
);
```

### 2. Background Job Processors

```javascript
class JobProcessor {
  private shutdownRequested = false;

  async processJobs(): Promise<void> {
    while (!this.shutdownRequested) {
      await this.processNextJob();
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownRequested = true;

    // Wait for current job to complete
    await this.waitForCurrentJobCompletion();

    // Update in-progress jobs to pending
    await this.markJobsForRetry();
  }
}
```

### 3. HTTP Client Cleanup

```javascript
class ApiService {
  private httpClient: HttpClient;

  async shutdown(): Promise<void> {
    // Close all connections
    await this.httpClient.close();

    // Clear any pending requests
    this.httpClient.cancelPendingRequests();
  }
}
```

## Monitoring and Logging

### Shutdown Logging

The handler automatically logs shutdown events:

```javascript
// Automatic logs include:
// - "Starting graceful shutdown"
// - "Graceful shutdown completed"
// - "Service shutdown completed, waiting for other services"
// - "All registered services have completed shutdown, exiting process"
```

### Custom Logging

Add your own logging for debugging:

```javascript
const shutdownController = async (): Promise<void> => {
  log.info("Custom shutdown started", {
    timestamp: new Date().toISOString(),
    service: "your-service"
  });

  const startTime = Date.now();

  try {
    await performCleanup();

    log.info("Custom shutdown completed", {
      duration: Date.now() - startTime,
      service: "your-service"
    });
  } catch (error) {
    log.error(error, "Custom shutdown failed", {
      duration: Date.now() - startTime,
      service: "your-service"
    });
    throw error;
  }
};
```

## Testing Shutdown Handlers

### Unit Testing

```javascript
// Test your shutdown controller independently
describe("Shutdown Controller", () => {
  it("should cleanup resources properly", async () => {
    const mockCleanup = jest.fn();
    const controller = createShutdownController(mockCleanup);

    await controller();

    expect(mockCleanup).toHaveBeenCalled();
  });
});
```

### Integration Testing

```javascript
// Test with actual ShutdownHandler
describe("ShutdownHandler Integration", () => {
  it("should handle SIGTERM gracefully", async () => {
    const cleanupSpy = jest.fn();
    const handler = ShutdownHandler.create(cleanupSpy, { service });

    // Simulate SIGTERM
    process.emit("SIGTERM");

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(cleanupSpy).toHaveBeenCalled();
  });
});
```

## Troubleshooting

### Common Issues

#### 1. Service hangs during shutdown

- Check for infinite loops in shutdown controller
- Verify database connections are properly closed
- Look for deadlocks in cleanup operations

#### 2. Shutdown timeout (30 seconds)

- Optimize cleanup operations
- Remove unnecessary delays
- Consider using `forceExit: true` for non-critical services

#### 3. Process exits immediately

- Ensure you're in a multi-service environment
- Check service registration
- Verify coordinator is working properly

### Debugging Tips

- Enable debug logging to see shutdown coordination
- Check for hanging promises in your cleanup code
- Verify that all async operations have proper timeouts
- Test shutdown behavior in both single and multi-service environments

### Performance Optimization

- Keep cleanup operations under 25 seconds to stay within the timeout
- Use `Promise.race()` with timeouts for external service calls
- Batch database operations where possible
- Consider using `forceExit: true` for services with non-critical cleanup operations

## Advanced Usage

### Multiple Shutdown Handlers

You can register multiple shutdown handlers for complex services:

```javascript
// Primary shutdown handler
ShutdownHandler.create(mainShutdownController, { service });

// Additional cleanup for specific components
ShutdownHandler.create(databaseShutdownController, {
    service,
    forceExit: false,
});
```

### Conditional Shutdown Logic

Implement environment-specific shutdown behavior:

```javascript
const shutdownController = async (): Promise<void> => {
  if (isProduction()) {
    await performProductionCleanup();
  } else {
    await performDevelopmentCleanup();
  }

  // Common cleanup for all environments
  await performCommonCleanup();
};
```

### Shutdown Health Checks

Verify that shutdown completed successfully:

```javascript
const shutdownController = async (): Promise<void> => {
  await performCleanup();

  // Verify cleanup was successful
  const cleanupStatus = await verifyCleanupStatus();
  if (!cleanupStatus.success) {
    throw new Error(`Cleanup verification failed: ${cleanupStatus.error}`);
  }

  log.info("Shutdown verification completed successfully");
};
```
