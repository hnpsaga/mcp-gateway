import prom from 'prom-client';

import { config } from '../../config/index.js';

// Clear registry to avoid Vitest duplicate registration errors
prom.register.clear();

if (config.METRICS_ENABLED) {
  prom.collectDefaultMetrics({ prefix: 'mcp_gateway_' });
}

// 1. HTTP Metrics
export const httpRequestCounter = new prom.Counter({
  name: 'mcp_gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDuration = new prom.Histogram({
  name: 'mcp_gateway_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpActiveRequests = new prom.Gauge({
  name: 'mcp_gateway_http_active_requests',
  help: 'Number of active HTTP requests',
});

// 2. Connections Metrics
export const registeredConnectionsGauge = new prom.Gauge({
  name: 'mcp_gateway_connections_registered',
  help: 'Total registered connections',
});

export const activeConnectionsGauge = new prom.Gauge({
  name: 'mcp_gateway_connections_active',
  help: 'Total active connections (connected transport sessions)',
});

export const enabledConnectionsGauge = new prom.Gauge({
  name: 'mcp_gateway_connections_enabled',
  help: 'Total enabled connections',
});

export const disabledConnectionsGauge = new prom.Gauge({
  name: 'mcp_gateway_connections_disabled',
  help: 'Total disabled connections',
});

// 3. Discovery Metrics
export const discoveryRequestsCounter = new prom.Counter({
  name: 'mcp_gateway_discovery_requests_total',
  help: 'Total number of discovery requests',
  labelNames: ['connection_id', 'status'], // status: 'success' | 'failure'
});

export const discoveryCacheCounter = new prom.Counter({
  name: 'mcp_gateway_discovery_cache_total',
  help: 'Total number of discovery cache queries',
  labelNames: ['connection_id', 'result'], // result: 'hit' | 'miss'
});

// 4. Execution Metrics
export const executionCounter = new prom.Counter({
  name: 'mcp_gateway_executions_total',
  help: 'Total number of executions',
  labelNames: ['connection_id', 'type', 'name', 'status'], // type: 'tool' | 'resource' | 'prompt', status: 'success' | 'failure'
});

export const executionDuration = new prom.Histogram({
  name: 'mcp_gateway_execution_duration_seconds',
  help: 'Duration of executions in seconds',
  labelNames: ['connection_id', 'type', 'name', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30],
});

// 5. Transport Metrics
export const transportConnectionsGauge = new prom.Gauge({
  name: 'mcp_gateway_transport_connections_active',
  help: 'Number of active transport connections',
  labelNames: ['transport_type'],
});

export const transportReconnectAttempts = new prom.Counter({
  name: 'mcp_gateway_transport_reconnect_attempts_total',
  help: 'Total number of transport reconnect attempts',
  labelNames: ['connection_id'],
});

export const transportFailures = new prom.Counter({
  name: 'mcp_gateway_transport_failures_total',
  help: 'Total number of transport failures',
  labelNames: ['connection_id', 'type'],
});

export const transportProtocolErrors = new prom.Counter({
  name: 'mcp_gateway_transport_protocol_errors_total',
  help: 'Total number of protocol errors',
  labelNames: ['connection_id'],
});

// 6. Persistence Metrics
export const dbOperationsCounter = new prom.Counter({
  name: 'mcp_gateway_db_operations_total',
  help: 'Total database operations',
  labelNames: ['operation', 'status'],
});

export const dbTransactionDuration = new prom.Histogram({
  name: 'mcp_gateway_db_transaction_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});
