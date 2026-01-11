/**
 * Transport/context where an error was handled.
 * This is auto-detected (HTTP/RPC/WS) by the Nest exception filter.
 */
export type ErrorTransport = 'http' | 'rpc' | 'ws' | 'unknown';

/**
 * Options for creating a BaseError instance
 */
export interface BaseErrorOptions {
  /**
   * HTTP status code (if applicable)
   */
  statusCode?: number;

  /**
   * Additional metadata for error context
   */
  metadata?: Record<string, unknown>;

  /**
   * The original error that caused this error
   */
  cause?: Error;

  /**
   * Whether this error should be logged
   * @default true
   */
  loggable?: boolean;

  /**
   * Whether this error should be exposed to clients
   * @default true
   */
  exposeToClient?: boolean;
}

/**
 * Base error class for all custom errors in NestJS applications.
 * Provides common properties and methods for error handling across different transports.
 *
 * @example
 * ```typescript
 * // Basic usage
 * throw new BaseError('User not found', 'USER_NOT_FOUND', {
 *   statusCode: 404,
 *   metadata: { userId: '123' },
 * });
 *
 * // With cause
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw new BaseError('Operation failed', 'OPERATION_FAILED', {
 *     statusCode: 500,
 *     cause: error as Error,
 *   });
 * }
 *
 * // Non-loggable error (e.g., validation errors)
 * throw new BaseError('Invalid input', 'VALIDATION_ERROR', {
 *   statusCode: 400,
 *   loggable: false,
 * });
 * ```
 */
export class BaseError extends Error {
  /**
   * Error code for programmatic error identification
   */
  public readonly code: string;

  /**
   * Transport/context where this error was handled.
   * This is auto-detected (HTTP/RPC/WS) by the Nest exception filter; callers should not set it.
   */
  private _transport: ErrorTransport = 'unknown';

  get transport(): ErrorTransport {
    return this._transport;
  }

  /**
   * HTTP status code (if applicable)
   */
  public readonly statusCode?: number;

  /**
   * Additional metadata for error context
   */
  public readonly metadata?: Record<string, unknown>;

  /**
   * Timestamp when the error was created
   */
  public readonly timestamp: Date;

  /**
   * Whether this error should be logged
   */
  public readonly loggable: boolean;

  /**
   * Whether this error should be exposed to clients
   */
  public readonly exposeToClient: boolean;

  /**
   * Creates a new BaseError instance
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic error identification (e.g., 'USER_NOT_FOUND')
   * @param options - Optional configuration for the error
   * @throws {Error} If message or code is empty or invalid
   * @throws {Error} If statusCode is outside valid HTTP range (100-599)
   */
  constructor(message: string, code: string, options?: BaseErrorOptions) {
    // Validate required parameters
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('BaseError: message is required and must be a non-empty string');
    }

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      throw new Error('BaseError: code is required and must be a non-empty string');
    }

    // Validate statusCode if provided
    if (options?.statusCode !== undefined) {
      const statusCode = options.statusCode;
      if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
        throw new Error(
          `BaseError: statusCode must be an integer between 100 and 599, got ${statusCode}`
        );
      }
    }

    super(message, { cause: options?.cause });

    this.name = this.constructor.name;
    this.code = code.trim();
    this.statusCode = options?.statusCode;
    this.metadata = options?.metadata;
    this.timestamp = new Date();
    this.loggable = options?.loggable ?? true;
    this.exposeToClient = options?.exposeToClient ?? true;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * INTERNAL: set transport context once (used by exception filters).
   * Callers should not set transport manually.
   */
  setTransportIfUnset(transport: Exclude<ErrorTransport, 'unknown'>): void {
    if (this._transport === 'unknown') {
      this._transport = transport;
    }
  }

  /**
   * Convert error to a plain object for logging/serialization
   *
   * @param includeStack - Whether to include the stack trace (default: false)
   * @returns Plain object representation of the error
   *
   * @example
   * ```typescript
   * const error = new BaseError('Something went wrong', 'ERROR_CODE');
   * console.log(error.toJSON()); // Without stack trace
   * console.log(error.toJSON(true)); // With stack trace
   * ```
   */
  toJSON(includeStack = false): Record<string, unknown> {
    // Helper function to safely serialize objects with circular reference handling
    const safeSerialize = (value: unknown): unknown => {
      if (value === null || value === undefined) {
        return value;
      }

      if (typeof value !== 'object') {
        return value;
      }

      const seen = new WeakSet<object>();
      try {
        return JSON.parse(
          JSON.stringify(value, (_key: string, val: unknown) => {
            if (typeof val === 'object' && val !== null) {
              if (seen.has(val)) {
                return '[Circular]';
              }
              seen.add(val);
            }
            return val;
          })
        );
      } catch {
        // Fallback for non-serializable objects
        const constructorName =
          (value as { constructor?: { name?: string } })?.constructor?.name || 'Unknown';
        return `[Non-serializable: ${constructorName}]`;
      }
    };

    const result: Record<string, unknown> = {
      name: this.name,
      code: this.code,
      transport: this.transport,
      message: this.message,
      statusCode: this.statusCode,
      metadata: this.metadata ? safeSerialize(this.metadata) : undefined,
      timestamp: this.timestamp.toISOString(),
    };

    if (includeStack) {
      result.stack = this.stack;
    }

    if (this.cause) {
      if (this.cause instanceof Error) {
        result.cause = this.cause.message;
      } else if (typeof this.cause === 'string') {
        result.cause = this.cause;
      } else if (typeof this.cause === 'number' || typeof this.cause === 'boolean') {
        result.cause = String(this.cause);
      } else if (typeof this.cause === 'symbol') {
        result.cause = this.cause.toString();
      } else if (typeof this.cause === 'bigint') {
        result.cause = `${String(this.cause)}n`;
      } else if (typeof this.cause === 'object' && this.cause !== null) {
        result.cause = safeSerialize(this.cause);
      } else {
        result.cause = 'Unknown cause';
      }
    }

    return result;
  }

  /**
   * Get error details safe for client exposure (HTTP context)
   */
  getClientSafeError(): {
    code: string;
    message: string;
    statusCode?: number;
    metadata?: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.exposeToClient ? this.message : 'An error occurred',
      ...(this.statusCode && { statusCode: this.statusCode }),
      ...(this.exposeToClient && this.metadata && { metadata: this.metadata }),
    };
  }

  /**
   * Get error payload for RPC transport (excludes HTTP statusCode)
   *
   * @returns Error payload suitable for RPC transport
   */
  getRpcError(): {
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.exposeToClient ? this.message : 'An error occurred',
      ...(this.exposeToClient && this.metadata && { metadata: this.metadata }),
    };
  }

  /**
   * Create a BaseError from an existing Error instance
   *
   * @param error - The original error to wrap
   * @param code - Error code for the new BaseError
   * @param options - Additional options for the BaseError
   * @returns A new BaseError instance
   *
   * @example
   * ```typescript
   * try {
   *   await someAsyncOperation();
   * } catch (error) {
   *   throw BaseError.fromError(error, 'OPERATION_FAILED', {
   *     statusCode: 500,
   *   });
   * }
   * ```
   */
  static fromError(error: Error, code: string, options?: BaseErrorOptions): BaseError {
    return new BaseError(error.message, code, {
      ...options,
      cause: error,
    });
  }

  /**
   * Create a BaseError for Bad Request (400)
   *
   * @param message - Error message
   * @param code - Error code (default: 'BAD_REQUEST')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 400
   */
  static badRequest(
    message: string,
    code = 'BAD_REQUEST',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 400,
      metadata,
    });
  }

  /**
   * Create a BaseError for Unauthorized (401)
   *
   * @param message - Error message
   * @param code - Error code (default: 'UNAUTHORIZED')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 401
   */
  static unauthorized(
    message: string,
    code = 'UNAUTHORIZED',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 401,
      metadata,
    });
  }

  /**
   * Create a BaseError for Forbidden (403)
   *
   * @param message - Error message
   * @param code - Error code (default: 'FORBIDDEN')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 403
   */
  static forbidden(
    message: string,
    code = 'FORBIDDEN',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 403,
      metadata,
    });
  }

  /**
   * Create a BaseError for Not Found (404)
   *
   * @param message - Error message
   * @param code - Error code (default: 'NOT_FOUND')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 404
   */
  static notFound(
    message: string,
    code = 'NOT_FOUND',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 404,
      metadata,
    });
  }

  /**
   * Create a BaseError for Conflict (409)
   *
   * @param message - Error message
   * @param code - Error code (default: 'CONFLICT')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 409
   */
  static conflict(
    message: string,
    code = 'CONFLICT',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 409,
      metadata,
    });
  }

  /**
   * Create a BaseError for Unprocessable Entity (422)
   *
   * @param message - Error message
   * @param code - Error code (default: 'UNPROCESSABLE_ENTITY')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 422
   */
  static unprocessableEntity(
    message: string,
    code = 'UNPROCESSABLE_ENTITY',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 422,
      metadata,
    });
  }

  /**
   * Create a BaseError for Too Many Requests (429)
   *
   * @param message - Error message
   * @param code - Error code (default: 'TOO_MANY_REQUESTS')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 429
   */
  static tooManyRequests(
    message: string,
    code = 'TOO_MANY_REQUESTS',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 429,
      metadata,
    });
  }

  /**
   * Create a BaseError for Bad Gateway (502)
   *
   * @param message - Error message
   * @param code - Error code (default: 'BAD_GATEWAY')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 502
   */
  static badGateway(
    message: string,
    code = 'BAD_GATEWAY',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 502,
      metadata,
    });
  }

  /**
   * Create a BaseError for Service Unavailable (503)
   *
   * @param message - Error message
   * @param code - Error code (default: 'SERVICE_UNAVAILABLE')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 503
   */
  static serviceUnavailable(
    message: string,
    code = 'SERVICE_UNAVAILABLE',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 503,
      metadata,
    });
  }

  /**
   * Create a BaseError for Gateway Timeout (504)
   *
   * @param message - Error message
   * @param code - Error code (default: 'GATEWAY_TIMEOUT')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 504
   */
  static gatewayTimeout(
    message: string,
    code = 'GATEWAY_TIMEOUT',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 504,
      metadata,
    });
  }

  /**
   * Create a BaseError for Internal Server Error (500)
   *
   * @param message - Error message
   * @param code - Error code (default: 'INTERNAL_SERVER_ERROR')
   * @param metadata - Optional metadata
   * @returns A new BaseError with statusCode 500
   */
  static internalServerError(
    message: string,
    code = 'INTERNAL_SERVER_ERROR',
    metadata?: Record<string, unknown>
  ): BaseError {
    return new BaseError(message, code, {
      statusCode: 500,
      metadata,
    });
  }
}
