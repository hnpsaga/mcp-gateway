# MCP Gateway

A lightweight, self-hosted REST gateway for managing and interacting with Model Context Protocol (MCP) servers.

---

## Prerequisites

- **Node.js**: `v22.x` (LTS) or higher
- **pnpm**: `v10.x` or higher

---

## Installation

Install the project dependencies using `pnpm`:

```bash
pnpm install
```

---

## Configuration

Duplicate `.env.example` to `.env` and adjust the variables:

```bash
cp .env.example .env
```

Default variables:

- `NODE_ENV`: Application environment (`development`, `production`, `test`)
- `PORT`: Port to listen on (default `3000`)
- `HOST`: IP address to listen on (default `127.0.0.1`)

---

## Running Locally

### Development Mode

To start the server in watch mode with automatic reload:

```bash
pnpm dev
```

### Production Build & Run

To compile the TypeScript project and start the compiled build:

```bash
pnpm build
pnpm start
```

---

## REST API

MCP Gateway exposes a REST API under the `/api/v1` base path. All future endpoints will be registered beneath this version prefix.

### API Versioning

- Current version: `v1`
- Base path: `/api/v1`
- Versioning is URL-based (`/api/v1/...`)
- No breaking changes are introduced within a single version

### OpenAPI Documentation

The API is documented using OpenAPI 3.0, automatically generated from route schemas.

- **Swagger UI**: `/documentation` (development only)
- **OpenAPI JSON**: `/documentation/json`
- Documentation stays synchronized with implementation through decorators and schemas applied directly to route definitions.

### Response Format

All API responses follow a consistent format:

**Success:**

```json
{
  "success": true,
  "data": {}
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}
  }
}
```

### Request Identifiers

Every HTTP request receives a unique request ID. The ID is:

- Generated automatically if not provided
- Accepted via the `request-id` header
- Returned in the `request-id` response header

This foundation supports future logging, tracing, and request correlation without requiring immediate observability implementation.

### Health Endpoint

**Root-level** (legacy, always available):

### `GET /health`

Returns the current health status of the service.

```json
{
  "status": "ok",
  "service": "mcp-gateway",
  "version": "1.0.0",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

**Versioned** (available under the API prefix):

### `GET /api/v1/health`

Same response as the root-level health endpoint.

---

## Connection Management API

The Connection Management API is available under `/api/v1/connections`. It exposes the Connection Registry through REST endpoints.

### Endpoint Overview

| Method   | Path                                        | Description          |
| :------- | :------------------------------------------ | :------------------- |
| `POST`   | `/api/v1/connections`                       | Create a connection  |
| `GET`    | `/api/v1/connections`                       | List all connections |
| `GET`    | `/api/v1/connections/:connectionId`         | Get a connection     |
| `PUT`    | `/api/v1/connections/:connectionId`         | Update a connection  |
| `DELETE` | `/api/v1/connections/:connectionId`         | Delete a connection  |
| `POST`   | `/api/v1/connections/:connectionId/enable`  | Enable a connection  |
| `POST`   | `/api/v1/connections/:connectionId/disable` | Disable a connection |
| `POST`   | `/api/v1/connections/:connectionId/test`    | Test a connection    |

### Example: Create a Connection

```http
POST /api/v1/connections
Content-Type: application/json

{
  "name": "My MCP Server",
  "transportType": "stdio",
  "transportConfig": {
    "command": "node",
    "args": ["server.js"]
  },
  "tags": ["production"],
  "metadata": { "environment": "prod" }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My MCP Server",
    "description": "",
    "transportType": "stdio",
    "transportConfig": { "command": "node", "args": ["server.js"] },
    "enabled": true,
    "tags": ["production"],
    "metadata": { "environment": "prod" },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### Example: List All Connections

```http
GET /api/v1/connections
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "name": "Server 1",
      "transportType": "stdio",
      ...
    }
  ]
}
```

### Example: Test a Connection

```http
POST /api/v1/connections/:connectionId/test
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "valid",
    "connectionId": "uuid",
    "message": "Connection definition is valid and ready for transport initialization"
  }
}
```

The test endpoint verifies the connection exists, is enabled, and has a valid configuration. No transport-level communication is performed.

### Transport Layer

MCP Gateway implements a production-grade **Stdio Transport** that manages MCP server connections via child processes:

- **Process Management**: MCP servers are spawned as child processes using `child_process.spawn`. The transport manages stdin/stdout/stderr streams, performs the MCP initialize handshake, and monitors process health.
- **JSON-RPC Communication**: A reusable JSON-RPC 2.0 client handles request/response correlation, configurable timeouts, concurrent requests, protocol error mapping, and notification support.
- **Session Lifecycle**: Each connection creates an isolated session with its own child process, JSON-RPC client, and connection state tracking (connecting, connected, disconnected, failed).
- **Graceful Shutdown**: On disconnect, the transport sends a `SIGTERM` signal followed by a `SIGKILL` timeout to ensure clean process termination.
- **Capability Discovery**: The `tools/list`, `resources/list`, and `prompts/list` MCP methods are called during discovery to enumerate server capabilities.
- **Execution**: Tools, resources, and prompts are executed by sending the appropriate MCP request (`tools/call`, `resources/read`, `prompts/get`) to the managed process.

**Transport Type**: When creating a connection, use `"transportType": "stdio"` with a `transportConfig` containing `command` and `args`:

```json
{
  "name": "My MCP Server",
  "transportType": "stdio",
  "transportConfig": {
    "command": "node",
    "args": ["server.js"]
  }
}
```

### Swagger Usage

All Connection Management endpoints are documented in the generated OpenAPI specification. Visit `/documentation` for the Swagger UI or `/documentation/json` for the raw OpenAPI spec.

---

## Discovery API

The Discovery API is available under `/api/v1/discovery`. It exposes the Discovery Engine through REST endpoints, providing access to MCP server capability discovery and caching.

### Discovery Workflow

1. A connection is created via the Connection Management API.
2. Discovery is triggered against that connection via `POST /api/v1/discovery/:connectionId`.
3. The Discovery Engine validates the connection exists, requests capabilities from the transport layer, validates the response, and caches the result.
4. Subsequent requests can retrieve cached results without triggering a new discovery.
5. The cache can be refreshed, cleared per connection, or listed for an overview.

### Cache Behavior

- Discovery results are cached in memory after the first successful discovery.
- Cached results are returned by `GET /api/v1/discovery/:connectionId` without triggering transport communication.
- `POST /api/v1/discovery/:connectionId/refresh` forces a new discovery and replaces the cached result.
- `DELETE /api/v1/discovery/:connectionId` clears the cache entry without affecting the connection definition.
- A `GET /api/v1/discovery` returns a summary of all cached entries.

### Endpoint Overview

| Method   | Path                                      | Description                         |
| :------- | :---------------------------------------- | :---------------------------------- |
| `POST`   | `/api/v1/discovery/:connectionId`         | Trigger capability discovery        |
| `GET`    | `/api/v1/discovery/:connectionId`         | Retrieve cached discovery results   |
| `POST`   | `/api/v1/discovery/:connectionId/refresh` | Force a fresh discovery             |
| `DELETE` | `/api/v1/discovery/:connectionId`         | Clear cached discovery              |
| `GET`    | `/api/v1/discovery`                       | List all cached discovery summaries |

### Example: Discover Capabilities

```http
POST /api/v1/discovery/:connectionId
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "tools": [
      { "name": "calculate", "description": "Perform mathematical calculations", "inputSchema": {} }
    ],
    "resources": [
      { "name": "Config", "uri": "file:///data/config.json", "mimeType": "application/json" }
    ],
    "prompts": [{ "name": "analyze_code", "description": "Analyze source code", "arguments": [] }],
    "discoveredAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### Example: Get Cached Discovery

```http
GET /api/v1/discovery/:connectionId
```

Returns the same structure as discover. Returns **404** if discovery has never been performed.

### Example: Refresh Discovery

```http
POST /api/v1/discovery/:connectionId/refresh
```

Forces a new discovery operation, replaces the cached result, and returns the refreshed capabilities.

### Example: Clear Discovery Cache

```http
DELETE /api/v1/discovery/:connectionId
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Discovery cache cleared for connection 'uuid'"
  }
}
```

### Example: List Cache

```http
GET /api/v1/discovery
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "connectionId": "uuid-1",
      "discoveredAt": "2026-01-01T00:00:00.000Z",
      "toolsCount": 2,
      "resourcesCount": 2,
      "promptsCount": 2
    }
  ]
}
```

The list endpoint returns only high-level metadata without duplicating full capability definitions.

### Swagger Usage

All Discovery endpoints are documented in the generated OpenAPI specification. Visit `/documentation` for the Swagger UI or `/documentation/json` for the raw OpenAPI spec.

---

## Execution API

The Execution API is available under `/api/v1/execution`. It exposes the Execution Engine through REST endpoints, enabling direct interaction with managed MCP connections.

### Execution Workflow

1. A connection is created via the Connection Management API.
2. Discovery is triggered on that connection via the Discovery API (cached capabilities are required for execution).
3. The Execution Engine validates the connection exists and the requested capability is available.
4. Execution is delegated to the transport layer, which communicates with the MCP server.
5. The transport response is normalized into a consistent format before being returned.

### Endpoint Overview

| Method | Path                         | Description      |
| :----- | :--------------------------- | :--------------- |
| `POST` | `/api/v1/execution/tool`     | Execute a tool   |
| `POST` | `/api/v1/execution/resource` | Read a resource  |
| `POST` | `/api/v1/execution/prompt`   | Execute a prompt |

### Tool Execution

Execute an MCP tool on a managed connection.

```http
POST /api/v1/execution/tool
Content-Type: application/json

{
  "connectionId": "uuid",
  "toolName": "calculate",
  "arguments": {
    "expression": "2 + 2"
  }
}
```

**Successful Response (200):**

```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "toolName": "calculate",
    "arguments": { "expression": "2 + 2" },
    "requestedAt": "2026-01-01T00:00:00.000Z",
    "executedAt": "2026-01-01T00:00:00.001Z",
    "status": "success",
    "result": { "toolName": "calculate", "args": { "expression": "2 + 2" } }
  }
}
```

**Execution Error Response (200):**

The request completed, but the tool execution failed:

```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "toolName": "calculate",
    "arguments": {},
    "requestedAt": "2026-01-01T00:00:00.000Z",
    "executedAt": "2026-01-01T00:00:00.001Z",
    "status": "error",
    "error": {
      "code": "EXECUTION_ERROR",
      "message": "Tool execution timed out"
    }
  }
}
```

**Not Found Response (404):**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Tool not found via discovery",
    "details": { "connectionId": "uuid", "toolName": "unknown_tool" }
  }
}
```

### Resource Retrieval

Read a resource from a managed connection.

```http
POST /api/v1/execution/resource
Content-Type: application/json

{
  "connectionId": "uuid",
  "resourceName": "Config"
}
```

**Successful Response (200):**

```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "resourceName": "Config",
    "requestedAt": "2026-01-01T00:00:00.000Z",
    "executedAt": "2026-01-01T00:00:00.001Z",
    "status": "success",
    "contents": { "setting": "value", "environment": "production" }
  }
}
```

### Prompt Execution

Execute an MCP prompt on a managed connection.

```http
POST /api/v1/execution/prompt
Content-Type: application/json

{
  "connectionId": "uuid",
  "promptName": "analyze_code",
  "arguments": {
    "language": "typescript"
  }
}
```

**Successful Response (200):**

```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "promptName": "analyze_code",
    "arguments": { "language": "typescript" },
    "requestedAt": "2026-01-01T00:00:00.000Z",
    "executedAt": "2026-01-01T00:00:00.001Z",
    "status": "success",
    "result": { "promptName": "analyze_code", "args": { "language": "typescript" } }
  }
}
```

### Request Schemas

**Tool Execution:**

| Field        | Type   | Required | Description                      |
| :----------- | :----- | :------- | :------------------------------- |
| connectionId | string | Yes      | The ID of the managed connection |
| toolName     | string | Yes      | The name of the tool to execute  |
| arguments    | object | Yes      | Arguments to pass to the tool    |

**Resource Retrieval:**

| Field        | Type   | Required | Description                      |
| :----------- | :----- | :------- | :------------------------------- |
| connectionId | string | Yes      | The ID of the managed connection |
| resourceName | string | Yes      | The name of the resource to read |

**Prompt Execution:**

| Field        | Type   | Required | Description                       |
| :----------- | :----- | :------- | :-------------------------------- |
| connectionId | string | Yes      | The ID of the managed connection  |
| promptName   | string | Yes      | The name of the prompt to execute |
| arguments    | object | Yes      | Arguments to pass to the prompt   |

### Validation Strategy

All validation is performed by the Execution Engine:

- **Connection validation**: The engine verifies the connection exists in the registry.
- **Discovery validation**: The engine verifies the requested capability (tool, resource, or prompt) was previously discovered and cached.
- **No validation is duplicated** inside the REST controllers.

### Swagger Usage

All Execution endpoints are documented in the generated OpenAPI specification. Visit `/documentation` for the Swagger UI or `/documentation/json` for the raw OpenAPI spec.

---

## Available Scripts

| Script               | Description                                                   |
| :------------------- | :------------------------------------------------------------ |
| `pnpm dev`           | Run the application locally in watch mode with `tsx`.         |
| `pnpm build`         | Compile the TypeScript code to Javascript inside `dist/`.     |
| `pnpm start`         | Run the production build located in `dist/`.                  |
| `pnpm typecheck`     | Perform static type checking using `tsc`.                     |
| `pnpm lint`          | Inspect code for style and quality issues using ESLint.       |
| `pnpm lint:fix`      | Automatically fix fixable linter issues.                      |
| `pnpm format`        | Run formatting check and overwrite code using Prettier.       |
| `pnpm format:check`  | Verify formatting across the project without modifying files. |
| `pnpm test`          | Run Vitest test suite once.                                   |
| `pnpm test:watch`    | Run Vitest in watch mode.                                     |
| `pnpm test:coverage` | Run Vitest and output code coverage reports.                  |

---

## Testing

Tests are written using **Vitest** for lightweight backend testing. They run without binding to a physical network port using Fastify's `inject()` mechanism.

To run tests:

```bash
pnpm test
```

To run tests with a code coverage report:

```bash
pnpm test:coverage
```

---

## Development Workflow

This project enforces high-quality standards through automated pre-commit gates:

1. **Git Hooks**: We use **Husky** to manage pre-commit hooks.
2. **Lint Staged**: The hook runs **lint-staged**, which performs:
   - ESLint validation and auto-fixing (`eslint --fix`) on staged `.js` and `.ts` files.
   - Prettier formatting check and write (`prettier --write`) on all staged files.
3. **Continuous Integration**: On every push and pull request, GitHub Actions runs:
   - Formatting checks (`pnpm format:check`)
   - Linter (`pnpm lint`)
   - Typecheck (`pnpm typecheck`)
   - Test suite (`pnpm test`)
   - Production build validation (`pnpm build`)

---

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml        # GitHub Actions CI pipeline
├── .husky/               # Git hook handlers (e.g., pre-commit)
├── docs/                 # Architecture & design documentation
├── src/
│   ├── ai/               # Future: AI provider integrations
│   ├── config/
│   │   ├── env.ts        # Environment config schema & validation (Zod)
│   │   └── index.ts      # Centralized configuration access
│   ├── connections/      # Connection registry, lifecycle management, runtime state
│   ├── discovery/        # Discovery engine, capability models, caching
│   ├── execution/        # Execution engine (tool execution, resource retrieval, prompt execution)
│   ├── lib/
│   │   └── api/          # REST API infrastructure
│   │       ├── index.ts          # API barrel
│   │       ├── error-handler.ts  # HTTP error mapping
│   │       └── response.ts       # Response format helpers
│   ├── operations/       # Future: Operational workflows
│   ├── routes/
│   │   ├── health.ts     # Root-level health check
│   │   └── api/
│   │       └── v1/       # API v1 route modules
│   │           ├── index.ts       # V1 route registration
│   │           ├── health.ts      # V1 health endpoint
│   │           ├── connections.ts # Connection Management API
│   │           ├── discovery.ts   # Capability discovery
│   │           ├── execution.ts   # Tool execution, resource retrieval, prompt execution
│   │           ├── ai.ts          # Future: AI interaction
│   │           └── operations.ts  # Future: Operations
│   ├── shared/
│   │   ├── errors/       # Application error hierarchy
│   │   ├── response/     # Reusable response models
│   │   ├── constants.ts  # Shared constants
│   │   └── index.ts      # Shared module entry
│   ├── transport/        # MCP transport abstraction (Stdio, Streamable HTTP, JSON-RPC client)
│   ├── types/            # Future: Shared type definitions
│   ├── app.ts            # Fastify instance builder & global error handler
│   ├── app.test.ts       # Application and API tests
│   ├── server.ts         # Server listen & graceful shutdown logic
│   ├── server.test.ts    # Server startup & process event tests
│   └── index.ts          # Application entrypoint
├── .editorconfig         # Code styling defaults for IDEs
├── .gitignore            # Files ignored by git
├── .lintstagedrc.json    # Configuration for staged file validation
├── .prettierignore       # Files ignored by Prettier formatter
├── eslint.config.js      # Flat Config configuration for ESLint 10
├── package.json          # Node project setup and dependencies list
├── pnpm-lock.yaml        # Package manager lock file
├── prettier.config.js    # Prettier configuration details
├── tsconfig.json         # TypeScript configuration mapping
└── vitest.config.ts      # Vitest testing environment configuration
```
