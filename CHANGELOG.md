# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Production Dockerfile** – Multi-stage build (`builder` + `runtime`) using `node:22-alpine`.
  - Builder installs native build tools (python3, make, g++) for `better-sqlite3`.
  - Runtime image runs as non-root user `mcpgateway` (UID 1001).
  - OCI image labels (`org.opencontainers.image.*`).
  - Built-in Docker `HEALTHCHECK` against `/health` endpoint.
- **`docker-compose.yml`** – Production-ready Compose file with:
  - Named volume for SQLite persistence at `/app/data`.
  - Health check, `restart: unless-stopped`, isolated Docker network.
  - Commented resource-limit placeholders.
- **`.env.example` expanded** – Now documents all environment variables from `src/config/env.ts`:
  - Server, logging, metrics, OpenTelemetry, transport, database, and auth variables.
  - Inline comments with defaults and production recommendations.
- **GitHub Actions `docker.yml`** – CI workflow that builds the Docker image and runs smoke tests on every push and pull request:
  - Verifies `/health`, `/ready`, and `/metrics` endpoints respond correctly.
  - Verifies graceful SIGTERM shutdown.
  - Does **not** push or publish the image.
- **`docs/Deployment.md`** – Comprehensive deployment guide:
  - Docker quick start, volume management, image updates, and backups.
  - Docker Compose startup, shutdown, and persistence.
  - Nginx and Traefik reverse proxy examples with HTTPS termination.
  - Production recommendations: resource limits, security, logging, monitoring, upgrades.
  - Troubleshooting section for common deployment issues.
- **README Docker section** – Added _Docker Quick Start_ and _Docker Deployment_ sections to the project README.
- **`package.json` `docker:build` script** – Convenience script: `pnpm docker:build`.

---

## [1.0.0] – Initial Release

### Added

- **Connection Management API** – Full CRUD for MCP server connections with enable/disable/test operations.
- **Discovery Engine** – Automatic capability discovery (tools, resources, prompts) from registered MCP servers with caching.
- **Execution Engine** – Tool execution, resource retrieval, and prompt execution via the REST API.
- **Transport Layer** – MCP transport abstraction supporting Stdio and Streamable HTTP transports with JSON-RPC client.
- **Authentication** – Optional API-key authentication middleware (header and Bearer token modes).
- **Observability** – Structured Pino JSON logging, Prometheus metrics (`/metrics`), optional OpenTelemetry tracing.
- **Health Endpoints** – `/health`, `/live`, `/ready`, `/metrics`, `/info`.
- **OpenAPI/Swagger** – Auto-generated documentation at `/documentation`.
- **SQLite Persistence** – Drizzle ORM with migration support, WAL mode, and configurable paths.
- **Graceful Shutdown** – SIGTERM / SIGINT handling with connection drain.
- **Zod Environment Validation** – All environment variables validated at startup.

[Unreleased]: https://github.com/your-org/mcp-gateway/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/mcp-gateway/releases/tag/v1.0.0
