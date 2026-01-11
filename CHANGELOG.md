# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-XX

### Added

- Initial release of @sklv-labs/ts-nestjs-error
- `BaseError` class with comprehensive error handling capabilities
- Support for HTTP, RPC, and WebSocket transports
- Error metadata and context support
- Control over error logging and client exposure
- Static factory methods for common HTTP error types
- `toJSON()` method for error serialization
- `getClientSafeError()` method for HTTP responses
- `getRpcError()` method for RPC transport
- Input validation for error creation
- Comprehensive TypeScript type definitions
- Full documentation and usage examples

### Features

- **Type-Safe Error Handling**: Full TypeScript support with comprehensive type definitions
- **Transport-Aware**: Automatic detection of HTTP/RPC/WS transport context
- **Rich Metadata**: Support for error metadata and additional context
- **Security Controls**: Fine-grained control over error exposure and logging
- **Factory Methods**: Convenient static methods for common HTTP status codes
- **Error Serialization**: Built-in methods for converting errors to JSON
- **NestJS Native**: Built for NestJS with seamless integration
