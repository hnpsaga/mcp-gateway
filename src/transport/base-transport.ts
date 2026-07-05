import type { Transport } from './transport.js';
import type {
  ConnectResult,
  DisconnectResult,
  DiscoverCapabilitiesResult,
  TransportExecutePromptResult,
  TransportExecuteToolResult,
  TransportReadResourceResult,
  TransportStatusResult,
} from './transport-result.js';

export abstract class BaseTransport implements Transport {
  async connect(connectionId: string): Promise<ConnectResult> {
    return {
      success: true,
      connectionId,
      status: 'connected',
    };
  }

  async disconnect(connectionId: string): Promise<DisconnectResult> {
    return {
      success: true,
      connectionId,
      status: 'disconnected',
    };
  }

  async getStatus(connectionId: string): Promise<TransportStatusResult> {
    return {
      connectionId,
      status: 'connected',
    };
  }

  async discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult> {
    return {
      success: true,
      connectionId,
      capabilities: {
        tools: [],
        resources: [],
        prompts: [],
      },
    };
  }

  async executeTool(
    connectionId: string,
    _toolName: string,
    _args: Record<string, unknown>,
    _abortSignal?: AbortSignal,
  ): Promise<TransportExecuteToolResult> {
    return {
      success: true,
      connectionId,
      result: { status: 'executed' },
    };
  }

  async readResource(
    connectionId: string,
    _resourceName: string,
    _abortSignal?: AbortSignal,
  ): Promise<TransportReadResourceResult> {
    return {
      success: true,
      connectionId,
      contents: { data: 'resource content' },
    };
  }

  async executePrompt(
    connectionId: string,
    _promptName: string,
    _args: Record<string, unknown>,
    _abortSignal?: AbortSignal,
  ): Promise<TransportExecutePromptResult> {
    return {
      success: true,
      connectionId,
      result: { status: 'executed' },
    };
  }

  async complete(
    connectionId: string,
    _ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string },
    _argument: { name: string; value: string },
  ): Promise<unknown> {
    return {
      success: true,
      connectionId,
      result: { completion: { values: [] } },
    };
  }

  supportsCapability(capability: string): boolean {
    return [
      'connect',
      'disconnect',
      'status',
      'discover-capabilities',
      'execute-tool',
      'read-resource',
      'execute-prompt',
      'complete',
    ].includes(capability);
  }
}
