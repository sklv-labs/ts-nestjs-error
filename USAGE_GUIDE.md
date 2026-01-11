# BaseError Usage Guide for Consuming Services

This guide explains how to use `BaseError` effectively in your NestJS services.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Service Layer Patterns](#service-layer-patterns)
3. [Controller Layer Patterns](#controller-layer-patterns)
4. [Error Handling Best Practices](#error-handling-best-practices)
5. [Common Patterns](#common-patterns)
6. [Error Codes Convention](#error-codes-convention)

## Basic Usage

### Simple Error Throwing

```typescript
import { BaseError } from '@sklv-labs/ts-nestjs-error';

// Basic error
throw new BaseError('User not found', 'USER_NOT_FOUND', {
  statusCode: 404,
});
```

### Using Factory Methods (Recommended)

Factory methods provide a cleaner API and ensure correct status codes:

```typescript
// 400 Bad Request
throw BaseError.badRequest('Invalid email format', 'INVALID_EMAIL');

// 401 Unauthorized
throw BaseError.unauthorized('Authentication required', 'AUTH_REQUIRED');

// 403 Forbidden
throw BaseError.forbidden('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS');

// 404 Not Found
throw BaseError.notFound('User not found', 'USER_NOT_FOUND', { userId: '123' });

// 409 Conflict
throw BaseError.conflict('Email already exists', 'EMAIL_EXISTS');

// 422 Unprocessable Entity (validation errors)
throw BaseError.unprocessableEntity('Validation failed', 'VALIDATION_ERROR', {
  fields: ['email', 'password'],
});

// 429 Too Many Requests
throw BaseError.tooManyRequests('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', {
  retryAfter: 60,
});

// 500 Internal Server Error
throw BaseError.internalServerError('Database connection failed', 'DB_ERROR');

// 502 Bad Gateway
throw BaseError.badGateway('Upstream service unavailable', 'UPSTREAM_ERROR');

// 503 Service Unavailable
throw BaseError.serviceUnavailable('Service temporarily unavailable', 'SERVICE_UNAVAILABLE', {
  retryAfter: 300,
});

// 504 Gateway Timeout
throw BaseError.gatewayTimeout('Request timeout', 'GATEWAY_TIMEOUT');
```

## Service Layer Patterns

### Pattern 1: Resource Not Found

```typescript
import { Injectable } from '@nestjs/common';
import { BaseError } from '@sklv-labs/ts-nestjs-error';
import { LoggerService } from '@sklv-labs/ts-nestjs-logger';

@Injectable()
export class UserService {
  constructor(private readonly logger: LoggerService) {}

  async findById(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    
    if (!user) {
      throw BaseError.notFound('User not found', 'USER_NOT_FOUND', {
        userId,
      });
    }
    
    return user;
  }
}
```

### Pattern 2: Validation Errors (Non-Loggable)

```typescript
@Injectable()
export class UserService {
  async createUser(data: CreateUserDto): Promise<User> {
    // Validation errors shouldn't be logged (they're expected)
    if (!data.email || !data.email.includes('@')) {
      throw new BaseError('Invalid email format', 'INVALID_EMAIL', {
        statusCode: 400,
        loggable: false, // Don't log validation errors
        exposeToClient: true,
        metadata: { email: data.email },
      });
    }

    // Check for duplicates
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw BaseError.conflict('Email already exists', 'EMAIL_EXISTS', {
        loggable: false, // Expected business logic error
        metadata: { email: data.email },
      });
    }

    return this.userRepository.create(data);
  }
}
```

### Pattern 3: Wrapping External Errors

```typescript
@Injectable()
export class PaymentService {
  async processPayment(orderId: string, amount: number): Promise<Payment> {
    try {
      return await this.paymentGateway.charge(orderId, amount);
    } catch (error) {
      // Wrap external errors with context
      throw BaseError.fromError(
        error as Error,
        'PAYMENT_PROCESSING_FAILED',
        {
          statusCode: 502, // Bad Gateway - external service failed
          metadata: {
            orderId,
            amount,
            gateway: 'stripe',
          },
          loggable: true, // Log external service failures
        }
      );
    }
  }
}
```

### Pattern 4: Internal Errors (Don't Expose Details)

```typescript
@Injectable()
export class DatabaseService {
  async query(sql: string): Promise<unknown> {
    try {
      return await this.db.query(sql);
    } catch (error) {
      // Internal errors shouldn't expose details to clients
      throw new BaseError('Database operation failed', 'DATABASE_ERROR', {
        statusCode: 500,
        exposeToClient: false, // Client sees "An error occurred"
        loggable: true, // But we log the full error
        cause: error as Error,
        metadata: {
          // Don't include sensitive SQL in metadata
          operation: 'query',
        },
      });
    }
  }
}
```

### Pattern 5: Business Logic Errors

```typescript
@Injectable()
export class OrderService {
  async cancelOrder(orderId: string, userId: string): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    
    if (!order) {
      throw BaseError.notFound('Order not found', 'ORDER_NOT_FOUND', {
        orderId,
      });
    }

    if (order.userId !== userId) {
      throw BaseError.forbidden('Cannot cancel another user\'s order', 'ORDER_ACCESS_DENIED', {
        orderId,
        userId,
        orderUserId: order.userId,
      });
    }

    if (order.status === 'shipped') {
      throw BaseError.unprocessableEntity(
        'Cannot cancel shipped order',
        'ORDER_ALREADY_SHIPPED',
        {
          orderId,
          status: order.status,
        }
      );
    }

    await this.orderRepository.update(orderId, { status: 'cancelled' });
  }
}
```

## Controller Layer Patterns

### Pattern 1: Simple Controller (Errors Auto-Handled)

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { BaseError } from '@sklv-labs/ts-nestjs-error';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  async getUser(@Param('id') id: string) {
    // BaseErrorExceptionFilter automatically handles this
    return this.userService.findById(id);
  }
}
```

### Pattern 2: Controller with Input Validation

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { BaseError } from '@sklv-labs/ts-nestjs-error';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async createUser(@Body() data: CreateUserDto) {
    // Service will throw BaseError if validation fails
    return this.userService.createUser(data);
  }
}
```

### Pattern 3: Manual Error Handling (Rare Cases)

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { BaseError } from '@sklv-labs/ts-nestjs-error';

@Controller('search')
export class SearchController {
  @Get()
  async search(@Query('q') query: string) {
    if (!query || query.length < 3) {
      throw BaseError.badRequest(
        'Query must be at least 3 characters',
        'INVALID_SEARCH_QUERY',
        {
          loggable: false,
        }
      );
    }

    return this.searchService.search(query);
  }
}
```

## Error Handling Best Practices

### 1. Use Appropriate Status Codes

```typescript
// ✅ Good - Use factory methods
throw BaseError.notFound('User not found', 'USER_NOT_FOUND');

// ❌ Bad - Manual status code (error-prone)
throw new BaseError('User not found', 'USER_NOT_FOUND', { statusCode: 404 });
```

### 2. Set loggable: false for Expected Errors

```typescript
// ✅ Good - Don't log validation errors
throw new BaseError('Invalid input', 'VALIDATION_ERROR', {
  statusCode: 400,
  loggable: false, // Expected, no need to log
});

// ✅ Good - Log unexpected errors
throw new BaseError('Database connection failed', 'DB_ERROR', {
  statusCode: 500,
  loggable: true, // Unexpected, should be logged
});
```

### 3. Use exposeToClient: false for Internal Errors

```typescript
// ✅ Good - Don't expose internal details
throw new BaseError('Database connection failed', 'DB_ERROR', {
  statusCode: 500,
  exposeToClient: false, // Client sees generic message
  loggable: true, // But we log the full error
});

// ✅ Good - Expose business logic errors
throw BaseError.conflict('Email already exists', 'EMAIL_EXISTS', {
  exposeToClient: true, // Client should see this
  loggable: false,
});
```

### 4. Include Relevant Metadata

```typescript
// ✅ Good - Include context
throw BaseError.notFound('Order not found', 'ORDER_NOT_FOUND', {
  orderId: '123',
  userId: '456',
});

// ❌ Bad - Missing context
throw BaseError.notFound('Order not found', 'ORDER_NOT_FOUND');
```

### 5. Use Error Codes Consistently

```typescript
// ✅ Good - Consistent error code format
throw BaseError.notFound('User not found', 'USER_NOT_FOUND');
throw BaseError.notFound('Order not found', 'ORDER_NOT_FOUND');
throw BaseError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

// ❌ Bad - Inconsistent format
throw BaseError.notFound('User not found', 'user_not_found');
throw BaseError.notFound('Order not found', 'OrderNotFound');
```

## Common Patterns

### Pattern: Retry Logic with Error Metadata

```typescript
@Injectable()
export class ExternalApiService {
  async callApi(endpoint: string, retries = 3): Promise<unknown> {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.httpService.get(endpoint);
      } catch (error) {
        if (i === retries - 1) {
          // Last retry failed
          throw BaseError.serviceUnavailable(
            'External API unavailable',
            'EXTERNAL_API_ERROR',
            {
              metadata: {
                endpoint,
                retries,
                attempt: i + 1,
              },
            }
          );
        }
        // Wait before retry
        await this.sleep(1000 * (i + 1));
      }
    }
  }
}
```

### Pattern: Rate Limiting

```typescript
@Injectable()
export class RateLimitedService {
  async makeRequest(): Promise<unknown> {
    const rateLimit = await this.checkRateLimit();
    
    if (rateLimit.exceeded) {
      throw BaseError.tooManyRequests(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        {
          metadata: {
            retryAfter: rateLimit.retryAfter,
            limit: rateLimit.limit,
            remaining: rateLimit.remaining,
          },
        }
      );
    }

    return this.executeRequest();
  }
}
```

### Pattern: Permission Checks

```typescript
@Injectable()
export class ResourceService {
  async accessResource(resourceId: string, userId: string): Promise<Resource> {
    const resource = await this.resourceRepository.findById(resourceId);
    
    if (!resource) {
      throw BaseError.notFound('Resource not found', 'RESOURCE_NOT_FOUND', {
        resourceId,
      });
    }

    if (!this.hasPermission(userId, resource)) {
      throw BaseError.forbidden(
        'Insufficient permissions',
        'RESOURCE_ACCESS_DENIED',
        {
          resourceId,
          userId,
        }
      );
    }

    return resource;
  }
}
```

## Error Codes Convention

### Recommended Format

Use `SCREAMING_SNAKE_CASE` with descriptive names:

```
<ENTITY>_<ACTION>_<REASON>
```

### Examples

```typescript
// Entity: USER, Action: NOT_FOUND
'USER_NOT_FOUND'

// Entity: ORDER, Action: CREATE, Reason: VALIDATION_ERROR
'ORDER_CREATE_VALIDATION_ERROR'

// Entity: PAYMENT, Action: PROCESS, Reason: FAILED
'PAYMENT_PROCESS_FAILED'

// Entity: AUTH, Action: REQUIRED
'AUTH_REQUIRED'

// Entity: RATE_LIMIT, Action: EXCEEDED
'RATE_LIMIT_EXCEEDED'
```

### Common Error Code Categories

```typescript
// Not Found (404)
'USER_NOT_FOUND'
'ORDER_NOT_FOUND'
'PRODUCT_NOT_FOUND'

// Validation (400, 422)
'INVALID_EMAIL'
'INVALID_PASSWORD'
'VALIDATION_ERROR'

// Authentication/Authorization (401, 403)
'AUTH_REQUIRED'
'AUTH_INVALID_TOKEN'
'INSUFFICIENT_PERMISSIONS'

// Business Logic (409, 422)
'EMAIL_EXISTS'
'ORDER_ALREADY_SHIPPED'
'INSUFFICIENT_STOCK'

// External Services (502, 503, 504)
'PAYMENT_GATEWAY_ERROR'
'EXTERNAL_API_ERROR'
'SERVICE_UNAVAILABLE'

// Internal Errors (500)
'DATABASE_ERROR'
'INTERNAL_SERVER_ERROR'
```

## Complete Example

```typescript
import { Injectable } from '@nestjs/common';
import { BaseError } from '@sklv-labs/ts-nestjs-error';
import { LoggerService } from '@sklv-labs/ts-nestjs-logger';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly paymentService: PaymentService,
    private readonly logger: LoggerService
  ) {}

  async createOrder(userId: string, items: OrderItem[]): Promise<Order> {
    // Validation (non-loggable)
    if (!items || items.length === 0) {
      throw new BaseError('Order must have items', 'ORDER_NO_ITEMS', {
        statusCode: 400,
        loggable: false,
        metadata: { userId },
      });
    }

    // Check stock
    for (const item of items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product) {
        throw BaseError.notFound('Product not found', 'PRODUCT_NOT_FOUND', {
          productId: item.productId,
          loggable: false,
        });
      }
      if (product.stock < item.quantity) {
        throw BaseError.unprocessableEntity(
          'Insufficient stock',
          'INSUFFICIENT_STOCK',
          {
            productId: item.productId,
            requested: item.quantity,
            available: product.stock,
            loggable: false,
          }
        );
      }
    }

    // Create order
    const order = await this.orderRepository.create({
      userId,
      items,
      status: 'pending',
    });

    // Process payment
    try {
      await this.paymentService.processPayment(order.id, order.total);
    } catch (error) {
      // Payment failed - mark order as failed
      await this.orderRepository.update(order.id, { status: 'payment_failed' });
      
      // Re-throw with context
      throw BaseError.fromError(error as Error, 'ORDER_PAYMENT_FAILED', {
        statusCode: 402, // Payment Required
        metadata: {
          orderId: order.id,
          total: order.total,
        },
        loggable: true,
      });
    }

    // Update order status
    await this.orderRepository.update(order.id, { status: 'confirmed' });

    this.logger.info('Order created successfully', { orderId: order.id, userId });

    return order;
  }
}
```

## Summary

1. **Use factory methods** for common HTTP status codes
2. **Set `loggable: false`** for expected errors (validation, business logic)
3. **Set `exposeToClient: false`** for internal errors
4. **Include relevant metadata** for debugging
5. **Use consistent error codes** in SCREAMING_SNAKE_CASE
6. **Wrap external errors** with `BaseError.fromError()`
7. **Let BaseErrorExceptionFilter handle errors** - don't manually catch in controllers

The `BaseErrorExceptionFilter` automatically:
- Detects transport type (HTTP/RPC/WS)
- Respects `loggable` flag
- Respects `exposeToClient` flag
- Logs errors with full context
- Returns appropriate response format per transport
