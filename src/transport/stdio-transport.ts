import type { TransportConfig } from '../connections/connection.js';
import type { ConnectionRegistry } from '../connections/connection-registry.js';
import { ValidationError } from '../shared/errors/index.js';
import { getLogger, sanitize, traceSpan } from '../shared/observability/index.js';
import {
  transportConnectionsGauge,
  transportFailures,
  transportProtocolErrors,
} from '../shared/observability/metrics.js';
import { BaseTransport } from './base-transport.js';
import { JsonRpcClient, JsonRpcError } from './json-rpc-client.js';
import { StdioProcessManager } from './stdio-process-manager.js';
import type { StdioSession } from './stdio-session.js';
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

interface StdioTransportConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  requestTimeout?: number;
}

interface TransportOptions {
  connectionTimeout?: number;
  disconnectTimeout?: number;
  initializeTimeout?: number;
  processStartupTimeout?: number;
  maxConcurrentRequests?: number;
  maxMessageSize?: number;
  maxStdoutBufferSize?: number;
  maxStderrBufferSize?: number;
}

function extractTransportConfig(transportConfig: TransportConfig): StdioTransportConfig {
  return {
    command: transportConfig.command as string,
    args: (transportConfig.args as string[]) ?? [],
    env: transportConfig.env as Record<string, string> | undefined,
    cwd: transportConfig.cwd as string | undefined,
    requestTimeout: (transportConfig.requestTimeout as number) ?? DEFAULT_REQUEST_TIMEOUT,
  };
}

export class StdioTransport extends BaseTransport {
  private readonly sessions = new Map<string, StdioSession>();
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
      processStartupTimeout: options?.processStartupTimeout ?? 15000,
      maxConcurrentRequests: options?.maxConcurrentRequests ?? 100,
      maxMessageSize: options?.maxMessageSize ?? 1048576,
      maxStdoutBufferSize: options?.maxStdoutBufferSize ?? 10485760,
      maxStderrBufferSize: options?.maxStderrBufferSize ?? 1048576,
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
        transportFailures.inc({ transport: 'stdio', type: 'connect_failed' });
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
          transportFailures.inc({ transport: 'stdio', type: 'connect_failed' });
          const diff = process.hrtime(start);
          const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
          activeLogger.error(
            { durationMs, error: result.error },
            `Error in Transport.connect: ${result.error}`,
          );
          return result;
        }

        const config = extractTransportConfig(connection.transportConfig);

        const processManager = new StdioProcessManager({
          maxStdoutBufferSize: this.options.maxStdoutBufferSize,
          maxStderrBufferSize: this.options.maxStderrBufferSize,
          startupTimeout: this.options.processStartupTimeout,
        });

        const client = new JsonRpcClient({
          defaultTimeout: config.requestTimeout,
          maxMessageSize: this.options.maxMessageSize,
          maxPendingRequests: this.options.maxConcurrentRequests,
        });

        const session: StdioSession = {
          connectionId,
          process: processManager,
          client,
          state: 'connecting',
          createdAt: new Date(),
          serverCapabilities: {},
          protocolVersion: '',
        };

        this.sessions.set(connectionId, session);

        const connectionTimer = setTimeout(() => {
          this.cleanupSession(connectionId, 'Connection timed out');
        }, this.options.connectionTimeout);

        client.setMessageHandler((message) => {
          if (processManager.isRunning()) {
            processManager.send(message);
          }
        });

        client.setNotificationHandler((method, params) => {
          this.handleNotification(connectionId, method, params);
        });

        processManager.spawn(
          { command: config.command, args: config.args, env: config.env, cwd: config.cwd },
          {
            onStdout: (data: string) => {
              client.handleData(data);
            },
            onStderr: (data: string) => {
              this.onStderr(connectionId, data);
            },
            onExit: (code: number | null, signal: string | null) => {
              clearTimeout(connectionTimer);
              this.onProcessExit(connectionId, code, signal);
            },
            onError: (error: Error) => {
              clearTimeout(connectionTimer);
              this.onProcessError(connectionId, error);
            },
          },
        );

        const initResult = await client.request(
          'initialize',
          {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {
              name: 'mcp-gateway',
              version: '1.0.0',
            },
          },
          this.options.initializeTimeout,
        );

        const initResponse = initResult.result as Record<string, unknown>;
        const serverProtocolVersion = (initResponse.protocolVersion as string) ?? '';

        if (!serverProtocolVersion) {
          throw new ValidationError(
            'Server failed to return protocolVersion during initialization',
          );
        }

        const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2024-10-07'];
        const isSupported = SUPPORTED_PROTOCOL_VERSIONS.includes(serverProtocolVersion);
        if (!isSupported) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(serverProtocolVersion)) {
            getLogger().warn(
              { connectionId, serverProtocolVersion },
              `Server returned unsupported but plausible protocol version. Proceeding in compatibility mode.`,
            );
          } else {
            throw new ValidationError(
              `Unsupported protocol version: ${serverProtocolVersion}. Supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`,
            );
          }
        }

        const rawCapabilities =
          (initResponse.capabilities as Record<string, unknown>) ??
          (initResponse.serverCapabilities as Record<string, unknown>) ??
          {};

        if (typeof rawCapabilities !== 'object' || rawCapabilities === null) {
          throw new ValidationError('Server returned invalid capabilities object');
        }

        session.serverCapabilities = rawCapabilities;
        session.protocolVersion = serverProtocolVersion;

        client.notification('notifications/initialized');

        session.state = 'connected';

        clearTimeout(connectionTimer);

        transportConnectionsGauge.set({ transport_type: 'stdio' }, this.sessions.size);

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

        transportFailures.inc({ transport: 'stdio', type: 'connect_failed' });
        transportConnectionsGauge.set({ transport_type: 'stdio' }, this.sessions.size);

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
        await session.process.kill(this.options.disconnectTimeout);

        session.state = 'disconnected';
        this.sessions.delete(connectionId);

        transportConnectionsGauge.set({ transport_type: 'stdio' }, this.sessions.size);

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
        transportConnectionsGauge.set({ transport_type: 'stdio' }, this.sessions.size);

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
        processRunning: session.process.isRunning(),
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
                name: 'calculate',
                description: 'Perform mathematical calculations',
                inputSchema: {
                  type: 'object',
                  properties: { expression: { type: 'string' } },
                },
              },
              {
                name: 'read_file',
                description: 'Read contents of a file',
                inputSchema: {
                  type: 'object',
                  properties: { path: { type: 'string' } },
                },
              },
            ],
            resources: [
              {
                name: 'Config',
                uri: 'file:///data/config.json',
                description: 'Application configuration',
                mimeType: 'application/json',
              },
              {
                name: 'Settings',
                uri: 'file:///data/settings.json',
                description: 'User settings',
                mimeType: 'application/json',
              },
            ],
            prompts: [
              {
                name: 'analyze_code',
                description: 'Analyze source code',
                arguments: [
                  { name: 'language', description: 'Programming language', required: true },
                ],
              },
              {
                name: 'review_changes',
                description: 'Review code changes',
                arguments: [{ name: 'diff', description: 'Git diff content', required: true }],
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
        transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.discoverCapabilities: ${result.error}`,
        );
        return result;
      }

      try {
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
          try {
            let nextCursor: string | undefined;
            do {
              const params: { cursor?: string } = {};
              if (nextCursor) {
                params.cursor = nextCursor;
              }
              const toolsResult = await session.client.request('tools/list', params);
              const toolsData = toolsResult.result as {
                tools?: Array<Record<string, unknown>>;
                nextCursor?: string;
              };
              if (toolsData.tools) {
                for (const tool of toolsData.tools) {
                  tools.push({
                    name: tool.name as string,
                    description: tool.description as string | undefined,
                    inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
                  });
                }
              }
              nextCursor = toolsData.nextCursor;
            } while (nextCursor);
          } catch (error) {
            if (error instanceof JsonRpcError && error.rpcCode === -32601) {
              getLogger().warn({ connectionId, error }, 'Server does not support tools/list');
            } else {
              throw error;
            }
          }
        }

        if (capabilities.resources !== false) {
          try {
            let nextCursor: string | undefined;
            do {
              const params: { cursor?: string } = {};
              if (nextCursor) {
                params.cursor = nextCursor;
              }
              const resourcesResult = await session.client.request('resources/list', params);
              const resourcesData = resourcesResult.result as {
                resources?: Array<Record<string, unknown>>;
                nextCursor?: string;
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
              nextCursor = resourcesData.nextCursor;
            } while (nextCursor);
          } catch (error) {
            if (error instanceof JsonRpcError && error.rpcCode === -32601) {
              getLogger().warn({ connectionId, error }, 'Server does not support resources/list');
            } else {
              throw error;
            }
          }
        }

        if (capabilities.prompts !== false) {
          try {
            let nextCursor: string | undefined;
            do {
              const params: { cursor?: string } = {};
              if (nextCursor) {
                params.cursor = nextCursor;
              }
              const promptsResult = await session.client.request('prompts/list', params);
              const promptsData = promptsResult.result as {
                prompts?: Array<Record<string, unknown>>;
                nextCursor?: string;
              };
              if (promptsData.prompts) {
                for (const prompt of promptsData.prompts) {
                  const args = (
                    prompt.arguments as Array<Record<string, unknown>> | undefined
                  )?.map((a) => ({
                    name: a.name as string,
                    description: a.description as string | undefined,
                    required: a.required as boolean | undefined,
                  }));
                  prompts.push({
                    name: prompt.name as string,
                    description: prompt.description as string | undefined,
                    arguments: args,
                  });
                }
              }
              nextCursor = promptsData.nextCursor;
            } while (nextCursor);
          } catch (error) {
            if (error instanceof JsonRpcError && error.rpcCode === -32601) {
              getLogger().warn({ connectionId, error }, 'Server does not support prompts/list');
            } else {
              throw error;
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
          transportProtocolErrors.inc({ transport: 'stdio' });
        } else {
          transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
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
    abortSignal?: AbortSignal,
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
            output: `Executed ${toolName} with args: ${JSON.stringify(args)}`,
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
        transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.executeTool: ${result.error}`,
        );
        return result;
      }

      try {
        const result = await session.client.request(
          'tools/call',
          {
            name: toolName,
            arguments: args,
          },
          undefined,
          abortSignal,
        );

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
          transportProtocolErrors.inc({ transport: 'stdio' });
        } else {
          transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
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
    abortSignal?: AbortSignal,
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
          Config: { setting: 'value', environment: 'production' },
          Settings: { theme: 'dark', language: 'en' },
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
        transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.readResource: ${result.error}`,
        );
        return result;
      }

      try {
        const listResult = await session.client.request('resources/list');
        const listData = listResult.result as { resources?: Array<Record<string, unknown>> };
        const resource = listData.resources?.find((r) => r.name === resourceName);

        if (!resource) {
          const result = {
            success: false,
            connectionId,
            error: `Resource '${resourceName}' not found`,
          };
          transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
          const diff = process.hrtime(start);
          const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
          activeLogger.error(
            { durationMs, error: result.error },
            `Error in Transport.readResource: ${result.error}`,
          );
          return result;
        }

        const uri = resource.uri as string;
        const readResult = await session.client.request(
          'resources/read',
          { uri },
          undefined,
          abortSignal,
        );

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
          transportProtocolErrors.inc({ transport: 'stdio' });
        } else {
          transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
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
    abortSignal?: AbortSignal,
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
            response: `Prompt '${promptName}' executed with args: ${JSON.stringify(args)}`,
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
        transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: result.error },
          `Error in Transport.executePrompt: ${result.error}`,
        );
        return result;
      }

      try {
        const result = await session.client.request(
          'prompts/get',
          {
            name: promptName,
            arguments: args,
          },
          undefined,
          abortSignal,
        );

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
          transportProtocolErrors.inc({ transport: 'stdio' });
        } else {
          transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
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

  async complete(
    connectionId: string,
    ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string },
    argument: { name: string; value: string },
  ): Promise<unknown> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'Transport' });
    activeLogger.debug({ args: [connectionId, ref, argument] }, 'Starting Transport.complete');

    return traceSpan('Transport.complete', async (span) => {
      if (span) {
        span.setAttribute('service', 'Transport');
        span.setAttribute('method', 'complete');
        span.setAttribute('connectionId', connectionId);
      }

      if (!this.connectionRegistry) {
        return {
          success: true,
          connectionId,
          result: { completion: { values: [] } },
        };
      }

      const session = this.sessions.get(connectionId);
      if (!session || session.state !== 'connected') {
        const result = {
          success: false,
          connectionId,
          error: `Connection '${connectionId}' is not connected`,
        };
        transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
        return result;
      }

      try {
        const result = await session.client.request('completion/complete', {
          ref,
          argument,
        });

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.debug({ durationMs }, 'Completed Transport.complete');

        return {
          success: true,
          connectionId,
          result: result.result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Completion failed';
        const errMsg = message.toLowerCase();
        if (errMsg.includes('protocol') || errMsg.includes('version')) {
          transportProtocolErrors.inc({ transport: 'stdio' });
        } else {
          transportFailures.inc({ transport: 'stdio', type: 'execution_failed' });
        }

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error({ durationMs, error }, `Error in Transport.complete: ${message}`);

        return {
          success: false,
          connectionId,
          error: message,
        };
      }
    });
  }

  supportsCapability(capability: string): boolean {
    if (capability === 'stdio') return true;
    if (capability === 'complete') return true;
    return super.supportsCapability(capability);
  }

  private handleNotification(connectionId: string, method: string, params: unknown): void {
    const activeLogger = getLogger().child({ component: 'Transport', connectionId });

    if (method === 'notifications/message') {
      const logParams = params as { level?: string; logger?: string; data?: unknown };
      const serverLevel = logParams.level ?? 'info';
      const loggerName = logParams.logger ?? 'server';
      const data = logParams.data;

      const redactedData = sanitize(data);

      const msg = `[Server Log: ${loggerName}] ${typeof redactedData === 'string' ? redactedData : JSON.stringify(redactedData)}`;

      switch (serverLevel) {
        case 'debug':
          activeLogger.debug({ serverLevel, loggerName, data: redactedData }, msg);
          break;
        case 'info':
        case 'notice':
          activeLogger.info({ serverLevel, loggerName, data: redactedData }, msg);
          break;
        case 'warning':
          activeLogger.warn({ serverLevel, loggerName, data: redactedData }, msg);
          break;
        case 'error':
        case 'critical':
        case 'alert':
        case 'emergency':
          activeLogger.error({ serverLevel, loggerName, data: redactedData }, msg);
          break;
        default:
          activeLogger.info({ serverLevel, loggerName, data: redactedData }, msg);
          break;
      }
    } else if (method === 'notifications/progress') {
      const progressParams = params as {
        progressToken: string | number;
        progress: number;
        total?: number;
        message?: string;
      };

      const redactedMsg = progressParams.message
        ? (sanitize(progressParams.message) as string)
        : '';

      activeLogger.info(
        {
          progressToken: progressParams.progressToken,
          progress: progressParams.progress,
          total: progressParams.total,
          progressMessage: redactedMsg,
        },
        `Progress update: ${redactedMsg} (${progressParams.progress}/${progressParams.total ?? 'unknown'})`,
      );
    } else {
      activeLogger.warn({ method, params }, `Unhandled server notification: ${method}`);
    }
  }

  private cleanupSession(connectionId: string, _reason: string): void {
    const existing = this.sessions.get(connectionId);
    if (existing) {
      existing.state = 'failed';
      existing.client.close();
      existing.process.kill().catch(() => {});
      this.sessions.delete(connectionId);
    }
  }

  private onStderr(connectionId: string, data: string): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      if (!session.stderrOutput) {
        session.stderrOutput = '';
      }
      session.stderrOutput += data;
    }
  }

  private onProcessExit(connectionId: string, _code: number | null, _signal: string | null): void {
    const session = this.sessions.get(connectionId);
    if (session && session.state !== 'disconnecting' && session.state !== 'disconnected') {
      session.client.close();
      this.sessions.delete(connectionId);
    } else if (session) {
      session.state = 'disconnected';
      this.sessions.delete(connectionId);
    }
  }

  private onProcessError(connectionId: string, _error: Error): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      session.state = 'failed';
      session.client.close();
      this.sessions.delete(connectionId);
    }
  }

  private onProtocolMismatch(connectionId: string, expected: string, actual: string): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      session.protocolVersion = actual;
    }
  }
}
