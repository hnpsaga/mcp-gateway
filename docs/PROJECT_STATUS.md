# Project Status

This document captures the repository state after Release Candidate 1 (RC1). It is intended as an internal engineering snapshot for future maintainers.

## Project Overview

MCP Gateway is a lightweight, self-hosted REST gateway for managing and interacting with Model Context Protocol (MCP) servers.

The project centralizes MCP connection management, capability discovery, execution, persistence, observability, and security behind a versioned HTTP API. Applications can consume MCP capabilities through REST without implementing MCP transport details directly.

The architecture is intentionally modular. Domain services remain framework-independent where practical, REST controllers stay thin, persistence is hidden behind repository interfaces, and MCP communication is isolated behind transport abstractions.

The project goal for v1 is to provide a production-ready, self-hosted MCP control plane that is straightforward to operate, easy to inspect, and compatible with standard deployment and observability tooling.

## Platform

The project currently targets:

- Node.js 22+
- TypeScript
- SQLite
- Linux, macOS, and Windows through Node.js compatibility
- Docker as the primary production deployment platform

## Current Architecture

MCP Gateway is organized around the following high-level components:

- **REST API**: Fastify-based HTTP API under `/api/v1`, with root-level health and operations endpoints.
- **Connection Registry**: Stores and validates connection definitions for managed MCP servers.
- **Lifecycle Manager**: Tracks runtime connection state separately from persisted connection definitions.
- **Discovery Engine**: Discovers MCP tools, resources, and prompts and caches capability results.
- **Execution Engine**: Validates requested capabilities and delegates tool, resource, prompt, and completion operations to the transport layer.
- **Transport Layer**: Provides stdio and Streamable HTTP MCP transports behind a shared transport interface.
- **Persistence Layer**: Uses SQLite through Drizzle ORM, with migrations committed to the repository.
- **Observability**: Provides structured logging, Prometheus metrics, OpenTelemetry tracing hooks, and operational endpoints.
- **Security**: Provides API key authentication and baseline HTTP security headers.

## Implemented Capabilities

### Core Gateway

- Connection registration, listing, retrieval, update, deletion, enable, disable, and validation.
- Connection lifecycle state management.
- Capability discovery for tools, resources, and prompts.
- Cached discovery lookup, refresh, listing, and cache clearing.
- Execution of tools, resource reads, prompt execution, and completion requests.

### MCP

- MCP protocol version `2024-11-05` as the primary supported version, with compatibility handling for known protocol variants.
- JSON-RPC 2.0 request, response, notification, timeout, and error handling.
- MCP initialization and capability negotiation.
- Pagination and cursor handling for capability listing.
- Completion support.
- Cancellation support through abort signals where supported by the execution path.
- Progress notification handling.
- Logging notification handling.

### Transports

- stdio transport for local MCP server processes.
- Streamable HTTP transport for HTTP-based MCP servers.
- Shared transport interface used by discovery and execution services.

### Persistence

- SQLite persistence.
- Drizzle ORM schema and migrations.
- Persistent repositories for connection definitions, discovery cache entries, and runtime state.

### REST API

- Versioned `/api/v1` API.
- OpenAPI generation from route schemas.
- Swagger UI at `/documentation`.
- Raw OpenAPI JSON at `/documentation/json`.

### Security

- Configurable API key authentication.
- Configurable API key header.
- Optional Bearer token support.
- Optional Swagger/OpenAPI authentication.
- HTTP security headers.

### Observability

- Structured Pino logging.
- Prometheus metrics.
- OpenTelemetry tracing integration.
- Health, liveness, readiness, runtime info, and metrics endpoints.

### Packaging

- Production Docker image.
- Docker Compose deployment.
- Runtime SQLite data volume configuration.
- Production deployment documentation.

## Major Design Decisions

- **Framework-independent domain layer**: Core services are kept separate from Fastify route handlers so business logic remains testable and not coupled to HTTP.
- **Thin REST controllers**: Routes perform request/response mapping and delegate validation-heavy behavior to the domain services.
- **Repository abstraction over persistence**: Persistence details are isolated behind repository interfaces, allowing SQLite to be used for v1 without binding the domain model to a specific database engine.
- **Separation of persistent and runtime state**: Connection definitions are persisted separately from runtime lifecycle state to avoid mixing configuration with operational status.
- **Transport abstraction**: Discovery and execution depend on a shared transport contract rather than concrete stdio or HTTP implementations.
- **Standards-first MCP implementation**: The Gateway implements MCP through JSON-RPC, capability negotiation, pagination, completion, cancellation, and notifications rather than proprietary protocol shortcuts.
- **Explicit instrumentation**: Observability is implemented at clear service, route, persistence, and transport boundaries rather than through implicit proxy-based instrumentation.
- **SQLite-first deployment model**: SQLite keeps v1 deployment simple while still supporting the intended self-hosted production use case.
- **Docker-first packaging**: Docker and Docker Compose provide the primary production deployment path.

## Engineering Philosophy

The project intentionally prioritizes:

- Explicit implementations over hidden abstractions
- Composition over unnecessary inheritance
- Framework-independent domain services
- Thin REST controllers
- Standards-compliant MCP implementation
- Conservative dependency usage
- Production readiness before feature expansion

These principles guided the implementation throughout development and should continue to guide future contributions.

## Current Project Status

Feature development for v1 is complete.

The project is at Release Candidate 1 (RC1). The engineering implementation is considered production-ready. The remaining work before v1.0 focuses on manual validation, real-world compatibility testing, documentation verification, and the final release decision.

## Known Limitations

The following limitations are intentional v1 scope decisions:

- No Kubernetes manifests.
- No Helm charts.
- No cloud-provider-specific deployment modules.
- No web UI.
- No command-line client.
- No database engines other than SQLite.
- No multi-node clustering or high-availability coordination.
- No enterprise identity integrations such as OAuth, SAML, or SSO.
- No experimental MCP features beyond the supported v1 protocol surface.

## Future Considerations

Future versions may consider:

- Additional persistence providers.
- Additional MCP transport implementations.
- High-availability deployment patterns.
- Horizontal scaling support.
- Optional enterprise authentication integrations.
- Optional UI or CLI layers.
- Community-requested enhancements based on real deployments.

These are possible directions, not committed roadmap items.

## Technical Debt

There are no known architectural concerns requiring attention before v1.0.

Any remaining work before release is expected to come from manual validation findings, real MCP server compatibility testing, or documentation review.

## Release Readiness

Engineering implementation is complete.

Documentation is complete for RC1.

Packaging is complete for RC1.

Automated validation passes.

The project is considered Release Candidate 1. Remaining work before v1.0 is intentionally manual:

- Personal code review.
- Real-world MCP server testing.
- Documentation verification.
- Final release decision.

---

This document reflects the repository state at Release Candidate 1 (RC1). It should be updated only when significant architectural or capability changes are introduced in future releases.
