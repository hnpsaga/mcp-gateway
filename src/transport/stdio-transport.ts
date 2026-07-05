import type { TransportConfig } from '../connections/connection.js';
import type { ConnectionRegistry } from '../connections/connection-registry.js';
import { BaseTransport } from './base-transport.js';
import { JsonRpcClient } from './json-rpc-client.js';
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

  constructor(private readonly connectionRegistry?: ConnectionRegistry) {
    super();
  }

  async connect(connectionId: string): Promise<ConnectResult> {
    if (!this.connectionRegistry) {
      return super.connect(connectionId);
    }

    if (this.sessions.has(connectionId)) {
      return {
        success: false,
        connectionId,
        status: 'failed',
        error: `Session already exists for connection '${connectionId}'`,
      };
    }

    try {
      const connection = await this.connectionRegistry.get(connectionId);

      if (!connection.enabled) {
        return {
          success: false,
          connectionId,
          status: 'failed',
          error: `Connection '${connectionId}' is disabled`,
        };
      }

      const config = extractTransportConfig(connection.transportConfig);

      const processManager = new StdioProcessManager();
      const client = new JsonRpcClient(config.requestTimeout);

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

      client.setMessageHandler((message) => {
        if (processManager.isRunning()) {
          processManager.send(message);
        }
      });

      processManager.spawn(
        { command: config.command, args: config.args, env: config.env, cwd: config.cwd },
        {
          onStdout: (data: string) => {
            client.handleData(data);
          },
          onStderr: (_data: string) => {},
          onExit: (_code: number | null, _signal: string | null) => {
            session.state = 'disconnected';
            client.close();
            this.sessions.delete(connectionId);
          },
          onError: (_error: Error) => {
            session.state = 'failed';
            client.close();
            this.sessions.delete(connectionId);
          },
        },
      );

      const initResult = await client.request('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
      });

      const initResponse = initResult.result as Record<string, unknown>;
      session.serverCapabilities =
        (initResponse.serverCapabilities as Record<string, unknown>) ?? {};
      session.protocolVersion = (initResponse.protocolVersion as string) ?? '';

      client.notification('notifications/initialized');

      session.state = 'connected';

      return {
        success: true,
        connectionId,
        status: 'connected',
      };
    } catch (error) {
      const existing = this.sessions.get(connectionId);
      if (existing) {
        existing.state = 'failed';
        existing.client.close();
        await existing.process.kill().catch(() => {});
        this.sessions.delete(connectionId);
      }

      const message = error instanceof Error ? error.message : 'Connection failed';
      return {
        success: false,
        connectionId,
        status: 'failed',
        error: message,
      };
    }
  }

  async disconnect(connectionId: string): Promise<DisconnectResult> {
    if (!this.connectionRegistry) {
      return super.disconnect(connectionId);
    }

    const session = this.sessions.get(connectionId);
    if (!session) {
      return {
        success: true,
        connectionId,
        status: 'disconnected',
      };
    }

    try {
      session.state = 'disconnecting';

      session.client.close();
      await session.process.kill();

      session.state = 'disconnected';
      this.sessions.delete(connectionId);

      return {
        success: true,
        connectionId,
        status: 'disconnected',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Disconnect failed';
      session.state = 'failed';

      return {
        success: false,
        connectionId,
        status: 'failed',
        error: message,
      };
    }
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
      },
    };
  }

  async discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult> {
    if (!this.connectionRegistry) {
      return {
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
    }

    const session = this.sessions.get(connectionId);
    if (!session || session.state !== 'connected') {
      return {
        success: false,
        connectionId,
        error: `Connection '${connectionId}' is not connected`,
      };
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
        const toolsResult = await session.client.request('tools/list');
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
        const resourcesResult = await session.client.request('resources/list');
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
        const promptsResult = await session.client.request('prompts/list');
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

      return {
        success: true,
        connectionId,
        capabilities: { tools, resources, prompts },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Capability discovery failed';
      return {
        success: false,
        connectionId,
        error: message,
      };
    }
  }

  async executeTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<TransportExecuteToolResult> {
    if (!this.connectionRegistry) {
      return {
        success: true,
        connectionId,
        result: {
          toolName,
          args,
          output: `Executed ${toolName} with args: ${JSON.stringify(args)}`,
        },
      };
    }

    const session = this.sessions.get(connectionId);
    if (!session || session.state !== 'connected') {
      return {
        success: false,
        connectionId,
        error: `Connection '${connectionId}' is not connected`,
      };
    }

    try {
      const result = await session.client.request('tools/call', {
        name: toolName,
        arguments: args,
      });

      return {
        success: true,
        connectionId,
        result: result.result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool execution failed';
      return {
        success: false,
        connectionId,
        error: message,
      };
    }
  }

  async readResource(
    connectionId: string,
    resourceName: string,
  ): Promise<TransportReadResourceResult> {
    if (!this.connectionRegistry) {
      const resourceContents: Record<string, unknown> = {
        Config: { setting: 'value', environment: 'production' },
        Settings: { theme: 'dark', language: 'en' },
      };

      return {
        success: true,
        connectionId,
        contents: resourceContents[resourceName] ?? {
          message: `Resource '${resourceName}' not found`,
        },
      };
    }

    const session = this.sessions.get(connectionId);
    if (!session || session.state !== 'connected') {
      return {
        success: false,
        connectionId,
        error: `Connection '${connectionId}' is not connected`,
      };
    }

    try {
      const listResult = await session.client.request('resources/list');
      const listData = listResult.result as { resources?: Array<Record<string, unknown>> };
      const resource = listData.resources?.find((r) => r.name === resourceName);

      if (!resource) {
        return {
          success: false,
          connectionId,
          error: `Resource '${resourceName}' not found`,
        };
      }

      const uri = resource.uri as string;
      const readResult = await session.client.request('resources/read', { uri });

      return {
        success: true,
        connectionId,
        contents: readResult.result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resource retrieval failed';
      return {
        success: false,
        connectionId,
        error: message,
      };
    }
  }

  async executePrompt(
    connectionId: string,
    promptName: string,
    args: Record<string, unknown>,
  ): Promise<TransportExecutePromptResult> {
    if (!this.connectionRegistry) {
      return {
        success: true,
        connectionId,
        result: {
          promptName,
          args,
          response: `Prompt '${promptName}' executed with args: ${JSON.stringify(args)}`,
        },
      };
    }

    const session = this.sessions.get(connectionId);
    if (!session || session.state !== 'connected') {
      return {
        success: false,
        connectionId,
        error: `Connection '${connectionId}' is not connected`,
      };
    }

    try {
      const result = await session.client.request('prompts/get', {
        name: promptName,
        arguments: args,
      });

      return {
        success: true,
        connectionId,
        result: result.result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prompt execution failed';
      return {
        success: false,
        connectionId,
        error: message,
      };
    }
  }

  supportsCapability(capability: string): boolean {
    if (capability === 'stdio') return true;
    return super.supportsCapability(capability);
  }
}
