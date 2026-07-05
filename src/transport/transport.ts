import type {
  ConnectResult,
  DisconnectResult,
  DiscoverCapabilitiesResult,
  TransportExecutePromptResult,
  TransportExecuteToolResult,
  TransportReadResourceResult,
  TransportStatusResult,
} from './transport-result.js';

export interface Transport {
  connect(connectionId: string): Promise<ConnectResult>;
  disconnect(connectionId: string): Promise<DisconnectResult>;
  getStatus(connectionId: string): Promise<TransportStatusResult>;
  discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult>;
  executeTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): Promise<TransportExecuteToolResult>;
  readResource(
    connectionId: string,
    resourceName: string,
    abortSignal?: AbortSignal,
  ): Promise<TransportReadResourceResult>;
  executePrompt(
    connectionId: string,
    promptName: string,
    args: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): Promise<TransportExecutePromptResult>;
  complete(
    connectionId: string,
    ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string },
    argument: { name: string; value: string },
  ): Promise<unknown>;
  supportsCapability(capability: string): boolean;
}
