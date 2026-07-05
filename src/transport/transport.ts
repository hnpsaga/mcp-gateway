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
  ): Promise<TransportExecuteToolResult>;
  readResource(connectionId: string, resourceName: string): Promise<TransportReadResourceResult>;
  executePrompt(
    connectionId: string,
    promptName: string,
    args: Record<string, unknown>,
  ): Promise<TransportExecutePromptResult>;
  supportsCapability(capability: string): boolean;
}
