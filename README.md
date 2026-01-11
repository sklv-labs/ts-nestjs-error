# @sklv-labs/ts-nestjs-error

A NestJS error handling package that provides a robust `BaseError` class for consistent error handling across HTTP, RPC, and WebSocket transports.

## Features

- 🎯 **Type-Safe** - Full TypeScript support with comprehensive type definitions
- 🚀 **Transport-Aware** - Automatic detection of HTTP/RPC/WS transport context
- 🛠️ **NestJS Native** - Built for NestJS with seamless integration
- 📦 **Rich Metadata** - Support for error metadata and context
- 🔒 **Security** - Control over error exposure and logging
- 🏭 **Factory Methods** - Convenient static methods for common HTTP errors

## Installation

```bash
npm install @sklv-labs/ts-nestjs-error
```

### Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install @nestjs/common@^11.1.11 @nestjs/core@^11.1.11
```

**Note:** This package requires Node.js 24 LTS or higher.

## Quick Start

```typescript
import { BaseError } from '@sklv-labs/ts-nestjs-error';

// Basic usage
throw new BaseError('User not found', 'USER_NOT_FOUND', {
  statusCode: 404,
  metadata: { userId: '123' },
});

// Using factory methods
throw BaseError.notFound('User not found', 'USER_NOT_FOUND', { userId: '123' });
```

## Usage Examples

### Basic Error Creation

```typescript
import { BaseError } from '@sklv-labs/ts-nestjs-error';

// Simple error
throw new BaseError('Invalid input', 'VALIDATION_ERROR', {
  statusCode: 400,
});

// Error with metadata
throw new BaseError('Payment failed', 'PAYMENT_FAILED', {
  statusCode: 402,
  metadata: {
    orderId: 'order-123',
    amount: 99.99,
  },
});
```

### Error with Cause

```typescript
try {
  await someAsyncOperation();
} catch (error) {
  throw new BaseError('Operation failed', 'OPERATION_FAILED', {
    statusCode: 500,
    cause: error as Error,
  });
}

// Or use the helper method
throw BaseError.fromError(error, 'OPERATION_FAILED', {
  statusCode: 500,
});
```

### Using Factory Methods

```typescript
// Bad Request (400)
throw BaseError.badRequest('Invalid email format', 'INVALID_EMAIL');

// Unauthorized (401)
throw BaseError.unauthorized('Authentication required', 'AUTH_REQUIRED');

// Forbidden (403)
throw BaseError.forbidden('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS');

// Not Found (404)
throw BaseError.notFound('Resource not found', 'RESOURCE_NOT_FOUND', {
  resourceId: '123',
});

// Conflict (409)
throw BaseError.conflict('Email already exists', 'EMAIL_EXISTS');

// Internal Server Error (500)
throw BaseError.internalServerError('Database connection failed', 'DB_ERROR');
```

### Controlling Error Exposure

```typescript
// Error that should not be exposed to clients (e.g., internal errors)
throw new BaseError('Database connection failed', 'DB_ERROR', {
  statusCode: 500,
  exposeToClient: false, // Client will see "An error occurred"
  loggable: true, // But it will be logged
});

// Error that should not be logged (e.g., validation errors)
throw new BaseError('Invalid input', 'VALIDATION_ERROR', {
  statusCode: 400,
  loggable: false, // Won't be logged
  exposeToClient: true, // But will be shown to client
});
```

### Error Serialization

```typescript
const error = new BaseError('Something went wrong', 'ERROR_CODE', {
  statusCode: 500,
  metadata: { key: 'value' },
});

// Convert to JSON (without stack trace)
const json = error.toJSON();
console.log(json);
// {
//   name: 'BaseError',
//   code: 'ERROR_CODE',
//   transport: 'unknown',
//   message: 'Something went wrong',
//   statusCode: 500,
//   metadata: { key: 'value' },
//   timestamp: '2024-01-01T00:00:00.000Z'
// }

// Convert to JSON (with stack trace)
const jsonWithStack = error.toJSON(true);

// Get client-safe error (for HTTP responses)
const clientError = error.getClientSafeError();
// {
//   code: 'ERROR_CODE',
//   message: 'Something went wrong',
//   statusCode: 500,
//   metadata: { key: 'value' }
// }

// Get RPC error (for RPC transport)
const rpcError = error.getRpcError();
// {
//   code: 'ERROR_CODE',
//   message: 'Something went wrong',
//   metadata: { key: 'value' }
// }
```

## API Reference

### `BaseError`

The main error class that extends the native `Error` class.

#### Constructor

```typescript
new BaseError(
  message: string,
  code: string,
  options?: BaseErrorOptions
)
```

#### Properties

- `code: string` - Error code for programmatic identification
- `transport: ErrorTransport` - Transport context (auto-detected by exception filters)
- `statusCode?: number` - HTTP status code (if applicable)
- `metadata?: Record<string, unknown>` - Additional error context
- `timestamp: Date` - When the error was created
- `loggable: boolean` - Whether the error should be logged (default: `true`)
- `exposeToClient: boolean` - Whether the error should be exposed to clients (default: `true`)

#### Methods

- `toJSON(includeStack?: boolean): Record<string, unknown>` - Convert error to plain object
- `getClientSafeError(): {...}` - Get error details safe for HTTP client exposure
- `getRpcError(): {...}` - Get error payload for RPC transport
- `setTransportIfUnset(transport: ErrorTransport): void` - Internal method used by exception filters

#### Static Factory Methods

- `BaseError.fromError(error: Error, code: string, options?: BaseErrorOptions): BaseError`
- `BaseError.badRequest(message: string, code?: string, metadata?: Record<string, unknown>): BaseError`
- `BaseError.unauthorized(message: string, code?: string, metadata?: Record<string, unknown>): BaseError`
- `BaseError.forbidden(message: string, code?: string, metadata?: Record<string, unknown>): BaseError`
- `BaseError.notFound(message: string, code?: string, metadata?: Record<string, unknown>): BaseError`
- `BaseError.conflict(message: string, code?: string, metadata?: Record<string, unknown>): BaseError`
- `BaseError.internalServerError(message: string, code?: string, metadata?: Record<string, unknown>): BaseError`

### Types

```typescript
type ErrorTransport = 'http' | 'rpc' | 'ws' | 'unknown';

interface BaseErrorOptions {
  statusCode?: number;
  metadata?: Record<string, unknown>;
  cause?: Error;
  loggable?: boolean;
  exposeToClient?: boolean;
}
```

## Integration with NestJS Exception Filters

The `BaseError` class is designed to work with NestJS exception filters that automatically detect the transport context:

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseError } from '@sklv-labs/ts-nestjs-error';

@Catch(BaseError)
export class BaseErrorFilter implements ExceptionFilter {
  catch(exception: BaseError, host: ArgumentsHost) {
    const ctx = host.switchToHttpContext();
    const request = ctx.getRequest();
    
    // Auto-detect transport
    if (ctx.getType() === 'http') {
      exception.setTransportIfUnset('http');
      // Handle HTTP error
    } else if (ctx.getType() === 'rpc') {
      exception.setTransportIfUnset('rpc');
      // Handle RPC error
    } else if (ctx.getType() === 'ws') {
      exception.setTransportIfUnset('ws');
      // Handle WebSocket error
    }
    
    // Use appropriate method based on transport
    if (exception.transport === 'http') {
      return exception.getClientSafeError();
    } else {
      return exception.getRpcError();
    }
  }
}
```

## Development

```bash
# Build
npm run build

# Lint
npm run lint

# Format
npm run format

# Test
npm run test

# Type check
npm run type-check
```

## License

MIT © [sklv-labs](https://github.com/sklv-labs)
