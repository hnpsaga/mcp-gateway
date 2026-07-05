import type { TransportConfig } from '../connections/connection.js';
import type { ConnectionRegistry } from '../connections/connection-registry.js';
import { getLogger, sanitize, traceSpan } from '../shared/observability/index.js';
import {
  transportConnectionsGauge,
  transportFailures,
  transportProtocolErrors,
} from '../shared/observability/metrics.js';
import { BaseTransport } from './base-transport.js';
import { HttpClient, HttpClientError, HttpClientTimeoutError } from './http-client.js';
import type { HttpSession } from './http-session.js';
import { JsonRpcClient, JsonRpcError } from './json-rpc-client.js';
import type {
  ConnectResult,
  DisconnectResult,
  DiscoverCapabilitiesResult,
  TransportExecutePromptResult,
  TransportExecuteToolResult,
  TransportReadResourceResult,
  TransportStatusResult,
} from './transport-result.js';

const MCP_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_REQUEST_TIMEOUT = 30000;

interface HttpTransportConfig {
  url: string;
  headers?: Record<string, string>;
  requestTimeout: number;
}

interface TransportOptions {
  connectionTimeout?: number;
  disconnectTimeout?: number;
  initializeTimeout?: number;
  maxConcurrentRequests?: number;
  maxMessageSize?: number;
  maxResponseSize?: number;
}

function extractTransportConfig(transportConfig: TransportConfig): HttpTransportConfig {
  return {
    url: transportConfig.url as string,
    headers: (transportConfig.headers as Record<string, string> | undefined) ?? {},
    requestTimeout: (transportConfig.requestTimeout as number) ?? DEFAULT_REQUEST_TIMEOUT,
  };
}

export class StreamableHttpTransport extends BaseTransport {
  private readonly sessions = new Map<string, HttpSession>();
  private readonly options: Required<TransportOptions>;

  constructor(
    private readonly connectionRegistry?: ConnectionRegistry,
    options?: TransportOptions,
  ) {
    super();
    this.options = {
      connectionTimeout: options?.connectionTimeout ?? 30000,
      disconnectTimeout: options?.disconnectTimeout ?? 5000,
      initializeTimeout: options?.initializeTimeout ?? 15000,
      maxConcurrentRequests: options?.maxConcurrentRequests ?? 100,
      maxMessageSize: options?.maxMessageSize ?? 1048576,
      maxResponseSize: options?.maxResponseSize ?? 10485760,
    };
  }

  async connect(connectionId: string): Promise<ConnectResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'Transport' });
    activeLogger.info({ args: [connectionId] }, 'Starting Transport.connect');

    return traceSpan('Transport.connect', async (span) => {
      if (span) {
        span.setAttribute('service', 'Transport');
        span.setAttribute('method', 'connect');
        span.setAttribute('connectionId', connectionId);
      }

      if (!this.connectionRegistry) {
        const result = await super.connect(connectionId);
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed Transport.connect successfully');
        return result;
      }

      if (this.sessions.has(connectionId)) {
        const result = {
          success: false,
          connectionId,
          status: 'failed' as const,
          error: `Session already exists for connection '${connectionId}'`,
        };
        transportFailures.inc({ transport: 'http', type: 'connect_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.connect: ${result.error}`,
        );
        return result;
      }

      try {
        const connection = await this.connectionRegistry.get(connectionId);

        if (!connection.enabled) {
          const result = {
            success: false,
            connectionId,
            status: 'failed' as const,
            error: `Connection '${connectionId}' is disabled`,
          };
          transportFailures.inc({ transport: 'http', type: 'connect_failed' });
          const diff = process.hrtime(start);
          const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
          activeLogger.error(
            { durationMs, error: result.error },
            `Error in Transport.connect: ${result.error}`,
          );
          return result;
        }

        const config = extractTransportConfig(connection.transportConfig);

        const client = new JsonRpcClient({
          defaultTimeout: config.requestTimeout * 2,
          maxMessageSize: this.options.maxMessageSize,
          maxPendingRequests: this.options.maxConcurrentRequests,
        });

        const httpClient = new HttpClient({
          baseUrl: config.url,
          headers: config.headers,
          timeout: config.requestTimeout,
          maxResponseSize: this.options.maxResponseSize,
        });

        const session: HttpSession = {
          connectionId,
          client,
          state: 'connecting',
          createdAt: new Date(),
          serverCapabilities: {},
          protocolVersion: '',
          url: config.url,
          headers: config.headers ?? {},
          requestTimeout: config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT,
        };

        this.sessions.set(connectionId, session);

        const connectionTimer = setTimeout(() => {
          this.cleanupSession(connectionId, 'Connection timed out');
        }, this.options.connectionTimeout);

        const initResult = await this.sendRequest(session, httpClient, 'initialize', {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
        });

        const initResponse = initResult.result as Record<string, unknown>;
        const serverProtocolVersion = (initResponse.protocolVersion as string) ?? '';

        if (serverProtocolVersion && serverProtocolVersion !== MCP_PROTOCOL_VERSION) {
          this.onProtocolMismatch(connectionId, MCP_PROTOCOL_VERSION, serverProtocolVersion);
        }

        session.serverCapabilities =
          (initResponse.serverCapabilities as Record<string, unknown>) ?? {};
        session.protocolVersion = serverProtocolVersion;

        await this.sendNotification(session, httpClient, 'notifications/initialized');

        session.state = 'connected';

        clearTimeout(connectionTimer);

        transportConnectionsGauge.set({ transport_type: 'http' }, this.sessions.size);

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed Transport.connect successfully');

        return {
          success: true,
          connectionId,
          status: 'connected',
        };
      } catch (error) {
        this.cleanupSession(
          connectionId,
          error instanceof Error ? error.message : 'Connection failed',
        );

        transportFailures.inc({ transport: 'http', type: 'connect_failed' });
        transportConnectionsGauge.set({ transport_type: 'http' }, this.sessions.size);

        const message = error instanceof Error ? error.message : 'Connection failed';
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error({ durationMs, error }, `Error in Transport.connect: ${message}`);

        return {
          success: false,
          connectionId,
          status: 'failed',
          error: message,
        };
      }
    });
  }

  async disconnect(connectionId: string): Promise<DisconnectResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'Transport' });
    activeLogger.info({ args: [connectionId] }, 'Starting Transport.disconnect');

    return traceSpan('Transport.disconnect', async (span) => {
      if (span) {
        span.setAttribute('service', 'Transport');
        span.setAttribute('method', 'disconnect');
        span.setAttribute('connectionId', connectionId);
      }

      if (!this.connectionRegistry) {
        const result = await super.disconnect(connectionId);
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed Transport.disconnect successfully');
        return result;
      }

      const session = this.sessions.get(connectionId);
      if (!session) {
        const result = {
          success: true,
          connectionId,
          status: 'disconnected' as const,
        };
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed Transport.disconnect successfully');
        return result;
      }

      try {
        session.state = 'disconnecting';

        session.client.close();
        session.state = 'disconnected';
        this.sessions.delete(connectionId);

        transportConnectionsGauge.set({ transport_type: 'http' }, this.sessions.size);

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed Transport.disconnect successfully');

        return {
          success: true,
          connectionId,
          status: 'disconnected',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Disconnect failed';
        session.state = 'failed';
        transportConnectionsGauge.set({ transport_type: 'http' }, this.sessions.size);

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error({ durationMs, error }, `Error in Transport.disconnect: ${message}`);

        return {
          success: false,
          connectionId,
          status: 'failed',
          error: message,
        };
      }
    });
  }

  async getStatus(connectionId: string): Promise<TransportStatusResult> {
    if (!this.connectionRegistry) {
      return super.getStatus(connectionId);
    }

    const session = this.sessions.get(connectionId);
    if (!session) {
      return {
        connectionId,
        status: 'disconnected',
      };
    }

    return {
      connectionId,
      status: session.state as TransportStatusResult['status'],
      details: {
        protocolVersion: session.protocolVersion,
        createdAt: session.createdAt.toISOString(),
        serverCapabilities: session.serverCapabilities,
        url: session.url,
      },
    };
  }

  async discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'Transport' });
    activeLogger.debug({ args: [connectionId] }, 'Starting Transport.discoverCapabilities');

    return traceSpan('Transport.discoverCapabilities', async (span) => {
      if (span) {
        span.setAttribute('service', 'Transport');
        span.setAttribute('method', 'discoverCapabilities');
        span.setAttribute('connectionId', connectionId);
      }

      if (!this.connectionRegistry) {
        const result = {
          success: true,
          connectionId,
          capabilities: {
            tools: [
              {
                name: 'get_weather',
                description: 'Get current weather for a location',
                inputSchema: {
                  type: 'object',
                  properties: { location: { type: 'string' } },
                },
              },
              {
                name: 'search_web',
                description: 'Search the web for information',
                inputSchema: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                },
              },
            ],
            resources: [
              {
                name: 'Weather API',
                uri: 'https://api.example.com/v1/weather',
                description: 'Weather data endpoint',
                mimeType: 'application/json',
              },
              {
                name: 'Search API',
                uri: 'https://api.example.com/v1/search',
                description: 'Web search endpoint',
                mimeType: 'application/json',
              },
            ],
            prompts: [
              {
                name: 'summarize',
                description: 'Summarize text content',
                arguments: [
                  { name: 'text', description: 'Text to summarize', required: true },
                  { name: 'max_length', description: 'Maximum summary length', required: false },
                ],
              },
              {
                name: 'translate',
                description: 'Translate text to another language',
                arguments: [
                  { name: 'text', description: 'Text to translate', required: true },
                  { name: 'target_language', description: 'Target language code', required: true },
                ],
              },
            ],
          },
        };
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.discoverCapabilities');
        return result;
      }

      const session = this.sessions.get(connectionId);
      if (!session || session.state !== 'connected') {
        const result = {
          success: false,
          connectionId,
          error: `Connection '${connectionId}' is not connected`,
        };
        transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.discoverCapabilities: ${result.error}`,
        );
        return result;
      }

      try {
        const httpClient = this.createHttpClient(session);
        const capabilities = session.serverCapabilities;
        const tools: Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }> = [];
        const resources: Array<{
          name: string;
          uri: string;
          description?: string;
          mimeType?: string;
        }> = [];
        const prompts: Array<{
          name: string;
          description?: string;
          arguments?: Array<{ name: string; description?: string; required?: boolean }>;
        }> = [];

        if (capabilities.tools !== false) {
          const toolsResult = await this.sendRequest(session, httpClient, 'tools/list');
          const toolsData = toolsResult.result as { tools?: Array<Record<string, unknown>> };
          if (toolsData.tools) {
            for (const tool of toolsData.tools) {
              tools.push({
                name: tool.name as string,
                description: tool.description as string | undefined,
                inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
              });
            }
          }
        }

        if (capabilities.resources !== false) {
          const resourcesResult = await this.sendRequest(session, httpClient, 'resources/list');
          const resourcesData = resourcesResult.result as {
            resources?: Array<Record<string, unknown>>;
          };
          if (resourcesData.resources) {
            for (const resource of resourcesData.resources) {
              resources.push({
                name: resource.name as string,
                uri: resource.uri as string,
                description: resource.description as string | undefined,
                mimeType: resource.mimeType as string | undefined,
              });
            }
          }
        }

        if (capabilities.prompts !== false) {
          const promptsResult = await this.sendRequest(session, httpClient, 'prompts/list');
          const promptsData = promptsResult.result as { prompts?: Array<Record<string, unknown>> };
          if (promptsData.prompts) {
            for (const prompt of promptsData.prompts) {
              const args = (prompt.arguments as Array<Record<string, unknown>> | undefined)?.map(
                (a) => ({
                  name: a.name as string,
                  description: a.description as string | undefined,
                  required: a.required as boolean | undefined,
                }),
              );
              prompts.push({
                name: prompt.name as string,
                description: prompt.description as string | undefined,
                arguments: args,
              });
            }
          }
        }

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.discoverCapabilities');

        return {
          success: true,
          connectionId,
          capabilities: { tools, resources, prompts },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Capability discovery failed';
        const errMsg = message.toLowerCase();
        if (errMsg.includes('protocol') || errMsg.includes('version')) {
          transportProtocolErrors.inc({ transport: 'http' });
        } else {
          transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        }

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error },
          `Error in Transport.discoverCapabilities: ${message}`,
        );

        return {
          success: false,
          connectionId,
          error: message,
        };
      }
    });
  }

  async executeTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<TransportExecuteToolResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'Transport' });
    activeLogger.debug(
      { args: [connectionId, toolName, sanitize(args)] },
      'Starting Transport.executeTool',
    );

    return traceSpan('Transport.executeTool', async (span) => {
      if (span) {
        span.setAttribute('service', 'Transport');
        span.setAttribute('method', 'executeTool');
        span.setAttribute('connectionId', connectionId);
        span.setAttribute('toolName', toolName);
      }

      if (!this.connectionRegistry) {
        const result = {
          success: true,
          connectionId,
          result: {
            toolName,
            args,
            output: `HTTP transport executed ${toolName}`,
          },
        };
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.executeTool');
        return result;
      }

      const session = this.sessions.get(connectionId);
      if (!session || session.state !== 'connected') {
        const result = {
          success: false,
          connectionId,
          error: `Connection '${connectionId}' is not connected`,
        };
        transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.executeTool: ${result.error}`,
        );
        return result;
      }

      try {
        const httpClient = this.createHttpClient(session);
        const result = await this.sendRequest(session, httpClient, 'tools/call', {
          name: toolName,
          arguments: args,
        });

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.executeTool');

        return {
          success: true,
          connectionId,
          result: result.result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool execution failed';
        const errMsg = message.toLowerCase();
        if (errMsg.includes('protocol') || errMsg.includes('version')) {
          transportProtocolErrors.inc({ transport: 'http' });
        } else {
          transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        }

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error({ durationMs, error }, `Error in Transport.executeTool: ${message}`);

        return {
          success: false,
          connectionId,
          error: message,
        };
      }
    });
  }

  async readResource(
    connectionId: string,
    resourceName: string,
  ): Promise<TransportReadResourceResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'Transport' });
    activeLogger.debug({ args: [connectionId, resourceName] }, 'Starting Transport.readResource');

    return traceSpan('Transport.readResource', async (span) => {
      if (span) {
        span.setAttribute('service', 'Transport');
        span.setAttribute('method', 'readResource');
        span.setAttribute('connectionId', connectionId);
        span.setAttribute('resourceName', resourceName);
      }

      if (!this.connectionRegistry) {
        const resourceContents: Record<string, unknown> = {
          'Weather API': { temperature: 22, condition: 'sunny', humidity: 0.45 },
          'Search API': { results: ['result 1', 'result 2'], total: 42 },
        };

        const result = {
          success: true,
          connectionId,
          contents: resourceContents[resourceName] ?? {
            message: `Resource '${resourceName}' not found`,
          },
        };
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.readResource');
        return result;
      }

      const session = this.sessions.get(connectionId);
      if (!session || session.state !== 'connected') {
        const result = {
          success: false,
          connectionId,
          error: `Connection '${connectionId}' is not connected`,
        };
        transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.readResource: ${result.error}`,
        );
        return result;
      }

      try {
        const httpClient = this.createHttpClient(session);
        const listResult = await this.sendRequest(session, httpClient, 'resources/list');
        const listData = listResult.result as { resources?: Array<Record<string, unknown>> };
        const resource = listData.resources?.find((r) => r.name === resourceName);

        if (!resource) {
          const result = {
            success: false,
            connectionId,
            error: `Resource '${resourceName}' not found`,
          };
          transportFailures.inc({ transport: 'http', type: 'execution_failed' });
          const diff = process.hrtime(start);
          const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
          activeLogger.error(
            { durationMs, error: result.error },
            `Error in Transport.readResource: ${result.error}`,
          );
          return result;
        }

        const uri = resource.uri as string;
        const readResult = await this.sendRequest(session, httpClient, 'resources/read', { uri });

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.readResource');

        return {
          success: true,
          connectionId,
          contents: readResult.result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Resource retrieval failed';
        const errMsg = message.toLowerCase();
        if (errMsg.includes('protocol') || errMsg.includes('version')) {
          transportProtocolErrors.inc({ transport: 'http' });
        } else {
          transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        }

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error({ durationMs, error }, `Error in Transport.readResource: ${message}`);

        return {
          success: false,
          connectionId,
          error: message,
        };
      }
    });
  }

  async executePrompt(
    connectionId: string,
    promptName: string,
    args: Record<string, unknown>,
  ): Promise<TransportExecutePromptResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'Transport' });
    activeLogger.debug(
      { args: [connectionId, promptName, sanitize(args)] },
      'Starting Transport.executePrompt',
    );

    return traceSpan('Transport.executePrompt', async (span) => {
      if (span) {
        span.setAttribute('service', 'Transport');
        span.setAttribute('method', 'executePrompt');
        span.setAttribute('connectionId', connectionId);
        span.setAttribute('promptName', promptName);
      }

      if (!this.connectionRegistry) {
        const result = {
          success: true,
          connectionId,
          result: {
            promptName,
            args,
            response: `HTTP transport executed prompt '${promptName}'`,
          },
        };
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.executePrompt');
        return result;
      }

      const session = this.sessions.get(connectionId);
      if (!session || session.state !== 'connected') {
        const result = {
          success: false,
          connectionId,
          error: `Connection '${connectionId}' is not connected`,
        };
        transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.executePrompt: ${result.error}`,
        );
        return result;
      }

      try {
        const httpClient = this.createHttpClient(session);
        const result = await this.sendRequest(session, httpClient, 'prompts/get', {
          name: promptName,
          arguments: args,
        });

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.executePrompt');

        return {
          success: true,
          connectionId,
          result: result.result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Prompt execution failed';
        const errMsg = message.toLowerCase();
        if (errMsg.includes('protocol') || errMsg.includes('version')) {
          transportProtocolErrors.inc({ transport: 'http' });
        } else {
          transportFailures.inc({ transport: 'http', type: 'execution_failed' });
        }

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error({ durationMs, error }, `Error in Transport.executePrompt: ${message}`);

        return {
          success: false,
          connectionId,
          error: message,
        };
      }
    });
  }

  supportsCapability(capability: string): boolean {
    if (capability === 'streamable-http') return true;
    return super.supportsCapability(capability);
  }

  private createHttpClient(session: HttpSession): HttpClient {
    return new HttpClient({
      baseUrl: session.url,
      headers: session.headers,
      timeout: session.requestTimeout,
      maxResponseSize: this.options.maxResponseSize,
    });
  }

  private cleanupSession(connectionId: string, _reason: string): void {
    const existing = this.sessions.get(connectionId);
    if (existing) {
      existing.state = 'failed';
      existing.client.close();
      this.sessions.delete(connectionId);
    }
  }

  private onProtocolMismatch(connectionId: string, expected: string, actual: string): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      session.protocolVersion = actual;
    }
  }

  private async sendRequest(
    session: HttpSession,
    httpClient: HttpClient,
    method: string,
    params?: unknown,
  ) {
    let capturedRequest: string | null = null;

    session.client.setMessageHandler((msg) => {
      capturedRequest = msg;
    });

    const jsonRpcPromise = session.client.request(method, params);
    jsonRpcPromise.catch(() => {});

    if (!capturedRequest) {
      session.client.close();
      throw new Error('Failed to capture JSON-RPC request');
    }

    try {
      const response = await httpClient.post('/', capturedRequest, {
        headers: session.headers,
        timeout: session.requestTimeout,
      });
      session.client.handleData(response.body);
      return await jsonRpcPromise;
    } catch (error) {
      session.client.close();

      if (error instanceof HttpClientTimeoutError) {
        throw error;
      }

      if (error instanceof HttpClientError) {
        const httpErr = error as HttpClientError;
        if (httpErr.responseBody) {
          try {
            const parsed = JSON.parse(httpErr.responseBody);
            if (parsed.error) {
              throw new JsonRpcError(
                parsed.error.code ?? -32000,
                parsed.error.message ?? 'JSON-RPC error',
                parsed.error.data,
              );
            }
          } catch {
            throw error;
          }
        }
        throw error;
      }

      throw error;
    }
  }

  private async sendNotification(
    session: HttpSession,
    httpClient: HttpClient,
    method: string,
    params?: unknown,
  ): Promise<void> {
    let capturedRequest: string | null = null;

    session.client.setMessageHandler((msg) => {
      capturedRequest = msg;
    });

    session.client.notification(method, params);

    if (capturedRequest) {
      try {
        await httpClient.post('/', capturedRequest, {
          headers: session.headers,
        });
      } catch {
        // Notifications are fire-and-forget
      }
    }
  }
}
