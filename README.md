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

### Transport Configuration

| Variable                            | Type   | Default    | Description                                                               |
| :---------------------------------- | :----- | :--------- | :------------------------------------------------------------------------ |
| `TRANSPORT_LOG_LEVEL`               | string | `info`     | Log level for transport layer (`error`, `warn`, `info`, `debug`, `trace`) |
| `TRANSPORT_MAX_MESSAGE_SIZE`        | number | `1048576`  | Maximum JSON-RPC message size in bytes (1MB)                              |
| `TRANSPORT_STDOUT_BUFFER_SIZE`      | number | `10485760` | Maximum stdout buffer size in bytes (10MB)                                |
| `TRANSPORT_STDERR_BUFFER_SIZE`      | number | `1048576`  | Maximum stderr buffer size in bytes (1MB)                                 |
| `TRANSPORT_MAX_CONCURRENT_REQUESTS` | number | `100`      | Maximum pending JSON-RPC requests per session                             |
| `TRANSPORT_PROCESS_STARTUP_TIMEOUT` | number | `15000`    | Process startup timeout in milliseconds                                   |
| `TRANSPORT_INITIALIZE_TIMEOUT`      | number | `15000`    | MCP initialize handshake timeout in milliseconds                          |
| `TRANSPORT_CONNECTION_TIMEOUT`      | number | `30000`    | Total connection timeout in milliseconds                                  |
| `TRANSPORT_DISCONNECT_TIMEOUT`      | number | `5000`     | Graceful disconnect timeout in milliseconds                               |

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

**Stdio transport:**

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

**Streamable HTTP transport:**

```http
POST /api/v1/connections
Content-Type: application/json

{
  "name": "My HTTP MCP Server",
  "transportType": "streamable-http",
  "transportConfig": {
    "url": "http://localhost:8080/mcp",
    "headers": {
      "Authorization": "Bearer my-token"
    },
    "requestTimeout": 30000
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

MCP Gateway implements two production-grade transports for communicating with MCP servers.

#### Stdio Transport

Manages MCP server connections via child processes:

- **Process Management**: MCP servers are spawned as child processes using `child_process.spawn`. The transport manages stdin/stdout/stderr streams, performs the MCP initialize handshake, and monitors process health.
- **JSON-RPC Communication**: A reusable JSON-RPC 2.0 client handles request/response correlation, configurable timeouts, concurrent requests, protocol error mapping, and notification support.
- **Session Lifecycle**: Each connection creates an isolated session with its own child process, JSON-RPC client, and connection state tracking (connecting, connected, disconnected, failed).
- **Graceful Shutdown**: On disconnect, the transport sends a `SIGTERM` signal followed by a `SIGKILL` timeout to ensure clean process termination.
- **Capability Discovery**: The `tools/list`, `resources/list`, and `prompts/list` MCP methods are called during discovery to enumerate server capabilities.
- **Execution**: Tools, resources, and prompts are executed by sending the appropriate MCP request (`tools/call`, `resources/read`, `prompts/get`) to the managed process.

**Configuration** — use `"transportType": "stdio"` with `command` and `args`:

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

#### Streamable HTTP Transport

Communicates with MCP servers over HTTP using JSON-RPC 2.0:

- **HTTP Communication**: JSON-RPC requests are sent via HTTP POST to the configured server URL. The reusable HTTP client supports configurable headers, timeouts, and cancellation.
- **JSON-RPC Reuse**: The existing JSON-RPC 2.0 client is reused for request/response correlation, protocol error mapping, and timeout handling. The transport captures serialized requests and feeds HTTP responses back through the client.
- **Session Lifecycle**: Each connection creates an isolated session with its own JSON-RPC client, HTTP client, and connection state tracking (connecting, connected, disconnected, failed).
- **MCP Handshake**: On connect, the transport performs the full MCP initialize handshake — sending `initialize` and receiving the server's capabilities, then sending `notifications/initialized`.
- **Capability Discovery**: Same MCP methods (`tools/list`, `resources/list`, `prompts/list`) are called over HTTP, producing identical result types as the stdio transport.
- **Graceful Disconnect**: Pending requests are rejected and the session is cleaned up without process management overhead.
- **Error Handling**: Connection failures, HTTP errors, timeouts, malformed JSON, and JSON-RPC protocol errors are all handled and mapped to the existing application error hierarchy.

**Configuration** — use `"transportType": "streamable-http"` with a `url`:

```json
{
  "name": "My HTTP MCP Server",
  "transportType": "streamable-http",
  "transportConfig": {
    "url": "http://localhost:8080/mcp",
    "headers": {
      "Authorization": "Bearer my-token",
      "X-Custom-Header": "value"
    },
    "requestTimeout": 30000
  }
}
```

**Configuration Options:**

| Option           | Type   | Required | Default | Description                                 |
| :--------------- | :----- | :------- | :------ | :------------------------------------------ |
| `url`            | string | Yes      | —       | Base URL of the MCP HTTP server             |
| `headers`        | object | No       | `{}`    | Custom HTTP headers sent with every request |
| `requestTimeout` | number | No       | `30000` | Request timeout in milliseconds             |

**Stdio-specific Configuration Options:**

| Option           | Type   | Required | Default | Description                             |
| :--------------- | :----- | :------- | :------ | :-------------------------------------- |
| `command`        | string | Yes      | —       | Command to spawn the MCP server process |
| `args`           | array  | No       | `[]`    | Command-line arguments for the process  |
| `env`            | object | No       | —       | Environment variables for the process   |
| `cwd`            | string | No       | —       | Working directory for the process       |
| `requestTimeout` | number | No       | `30000` | Request timeout in milliseconds         |

## Transport Hardening

The transport layer includes production-grade hardening features to improve reliability, robustness, and resilience.

### Timeout Handling

| Timeout                 | Transport | Config Key                          | Default | Description                                |
| :---------------------- | :-------- | :---------------------------------- | :------ | :----------------------------------------- |
| Process Startup Timeout | Stdio     | `TRANSPORT_PROCESS_STARTUP_TIMEOUT` | 15s     | Maximum time to wait for process startup   |
| Initialize Timeout      | Both      | `TRANSPORT_INITIALIZE_TIMEOUT`      | 15s     | Maximum time for MCP initialize handshake  |
| Connection Timeout      | Both      | `TRANSPORT_CONNECTION_TIMEOUT`      | 30s     | Total timeout for connection establishment |
| Disconnect Timeout      | Both      | `TRANSPORT_DISCONNECT_TIMEOUT`      | 5s      | Maximum time for graceful disconnect       |
| Request Timeout         | Both      | `requestTimeout` (per-connection)   | 30s     | JSON-RPC request timeout                   |

Timeout errors produce meaningful error messages using the existing application error hierarchy (`JsonRpcTimeoutError`, `HttpClientTimeoutError`).

### Resource Protection

| Protection              | Transport       | Config Key                          | Default | Description                            |
| :---------------------- | :-------------- | :---------------------------------- | :------ | :------------------------------------- |
| Max Message Size        | Both            | `TRANSPORT_MAX_MESSAGE_SIZE`        | 1MB     | Maximum incoming JSON-RPC message size |
| Stdout Buffer Size      | Stdio           | `TRANSPORT_STDOUT_BUFFER_SIZE`      | 10MB    | Maximum stdout data buffer             |
| Stderr Buffer Size      | Stdio           | `TRANSPORT_STDERR_BUFFER_SIZE`      | 1MB     | Maximum stderr data buffer             |
| Max Concurrent Requests | Both            | `TRANSPORT_MAX_CONCURRENT_REQUESTS` | 100     | Maximum pending JSON-RPC requests      |
| Max Response Size       | Streamable HTTP | `maxResponseSize` (per-client)      | 10MB    | Maximum HTTP response body size        |

When limits are exceeded, meaningful errors are returned through the application error hierarchy.

### Structured Logging

The transport layer captures structured information about:

- Process startup and shutdown events
- HTTP connection lifecycle
- Stderr output from child processes
- Timeout events
- Protocol errors
- Unexpected disconnects

Logging is configured via `TRANSPORT_LOG_LEVEL` and does not expose sensitive information.

### JSON-RPC Protocol Robustness

The JSON-RPC client has been hardened against:

- Malformed responses and invalid JSON
- Unsupported protocol versions (non-2.0 messages are ignored)
- Invalid request IDs
- Duplicate responses (only the first response is processed)
- Unexpected notifications (silently ignored)
- Protocol error mapping (`JsonRpcError` with code, message, and optional data)
- Pending request cleanup on client close
- Closed client protection (rejects new requests)

### Transport Recovery

Both transports implement recovery mechanisms:

- Clean session state after unexpected process termination
- Proper cleanup after HTTP connection failures
- Cleanup after crashes via `cleanupSession()` helper
- Support for reconnect via `disconnect()` + `connect()` cycles
- Safe handling of repeated connect/disconnect calls
- State reset to guarantee clean state after failures

### Capability Negotiation

During the MCP initialization handshake:

- Protocol version is validated against the expected `2024-11-05` version
- Server capabilities are tracked per session
- Capability negotiation follows the MCP specification
- Protocol version mismatches are recorded for compatibility

### Troubleshooting

Common transport issues and their solutions:

| Issue                       | Cause                                    | Solution                                           |
| :-------------------------- | :--------------------------------------- | :------------------------------------------------- |
| Connection timeout          | Server process failed to start           | Verify command and args in transport configuration |
| Initialize timeout          | Server did not respond to initialize     | Check server compatibility with MCP protocol       |
| Message too large           | Server sent oversized JSON-RPC message   | Increase `TRANSPORT_MAX_MESSAGE_SIZE` if needed    |
| Too many pending requests   | Client exceeded concurrent request limit | Increase `TRANSPORT_MAX_CONCURRENT_REQUESTS`       |
| Process exited unexpectedly | Server process crashed                   | Check server logs and stderr output                |
| HTTP connection refused     | Server not running or wrong URL          | Verify URL and server availability                 |
| Stderr output captured      | Server writing to stderr                 | Review stderr output for diagnostic information    |

**Transport Architecture:**

```text
REST API
      │
Execution Engine
      │
Discovery Engine
      │
Transport Interface
      │
Streamable HTTP Transport
      │
HttpClient ───── JsonRpcClient
      │
HTTP POST
      │
  MCP Server
```

The transport layer is fully abstracted — the Discovery Engine and Execution Engine operate identically regardless of whether the underlying transport is stdio or streamable HTTP.

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
| `pnpm db:generate`   | Generate a new database migration using Drizzle Kit.          |
| `pnpm db:migrate`    | Apply pending database migrations.                            |
| `pnpm db:studio`     | Open Drizzle Studio to browse the database.                   |

---

## Database

MCP Gateway uses **SQLite** as its embedded database engine, with **Drizzle ORM** for type-safe queries and **Drizzle Kit** for managing schema migrations.

### Database Configuration

The database is configured via environment variables:

| Variable                | Type    | Default          | Description                                       |
| :---------------------- | :------ | :--------------- | :------------------------------------------------ |
| `DATABASE_PATH`         | string  | `./data`         | Directory path for the SQLite database file       |
| `DATABASE_FILENAME`     | string  | `mcp-gateway.db` | SQLite database filename                          |
| `DATABASE_WAL_MODE`     | boolean | `true`           | Enable WAL journaling mode for better concurrency |
| `DATABASE_BUSY_TIMEOUT` | number  | `5000`           | Busy timeout in milliseconds                      |

### Database Schema

Three tables are managed by the persistence layer:

| Table             | Purpose                                                 |
| :---------------- | :------------------------------------------------------ |
| `connections`     | Connection definitions, transport config, and metadata  |
| `discovery_cache` | Cached capabilities (tools, resources, prompts)         |
| `runtime_state`   | Runtime connection status, retry tracking, failure info |

The schema is defined in `src/persistence/schema.ts`.

### Migration Workflow

Migrations are managed declaratively through Drizzle Kit:

```bash
# Generate a new migration after schema changes
pnpm db:generate

# Apply pending migrations at runtime (automatic on startup)
pnpm db:migrate
```

Migrations are applied automatically when the application starts. The migration files live in `src/persistence/migrations/` and should be committed to version control.

### Development Workflow

During development, the database is stored at `./data/mcp-gateway.db` by default. The `data/` directory is gitignored and will be created automatically on first run.

To reset the database during development:

```bash
rm -rf data/
```

The database will be recreated with the latest schema on the next application start.

### Production Recommendations

- Mount a persistent volume at the `DATABASE_PATH` location when running in Docker.
- WAL mode is enabled by default and recommended for production.
- The busy timeout of 5 seconds handles concurrent access gracefully.
- Regular SQLite backups are recommended (`sqlite3 data/mcp-gateway.db ".backup backup.db"`).

### Backup Recommendations

```bash
# Hot backup using SQLite's backup API
sqlite3 data/mcp-gateway.db ".backup /backup/mcp-gateway-$(date +%Y%m%d).db"

# Restore from backup
cp /backup/mcp-gateway-20260101.db data/mcp-gateway.db
```

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
