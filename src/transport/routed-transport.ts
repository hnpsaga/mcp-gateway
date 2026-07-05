import type { ConnectionRegistry } from '../connections/connection-registry.js';
import type { TransportType } from '../connections/transport-type.js';
import { ValidationError } from '../shared/errors/index.js';
import { StdioTransport } from './stdio-transport.js';
import { StreamableHttpTransport } from './streamable-http-transport.js';
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

interface RoutedTransportOptions {
  connectionTimeout?: number;
  disconnectTimeout?: number;
  initializeTimeout?: number;
  processStartupTimeout?: number;
  maxConcurrentRequests?: number;
  maxMessageSize?: number;
  maxStdoutBufferSize?: number;
  maxStderrBufferSize?: number;
  maxResponseSize?: number;
}

export class RoutedTransport implements Transport {
  private readonly transports: Record<TransportType, Transport>;

  constructor(
    private readonly connectionRegistry: ConnectionRegistry,
    options?: RoutedTransportOptions,
  ) {
    this.transports = {
      stdio: new StdioTransport(connectionRegistry, {
        connectionTimeout: options?.connectionTimeout,
        disconnectTimeout: options?.disconnectTimeout,
        initializeTimeout: options?.initializeTimeout,
        processStartupTimeout: options?.processStartupTimeout,
        maxConcurrentRequests: options?.maxConcurrentRequests,
        maxMessageSize: options?.maxMessageSize,
        maxStdoutBufferSize: options?.maxStdoutBufferSize,
        maxStderrBufferSize: options?.maxStderrBufferSize,
      }),
      'streamable-http': new StreamableHttpTransport(connectionRegistry, {
        connectionTimeout: options?.connectionTimeout,
        disconnectTimeout: options?.disconnectTimeout,
        initializeTimeout: options?.initializeTimeout,
        maxConcurrentRequests: options?.maxConcurrentRequests,
        maxMessageSize: options?.maxMessageSize,
        maxResponseSize: options?.maxResponseSize,
      }),
    };
  }

  async connect(connectionId: string): Promise<ConnectResult> {
    const transport = await this.getTransport(connectionId);
    return transport.connect(connectionId);
  }

  async disconnect(connectionId: string): Promise<DisconnectResult> {
    const transport = await this.getTransport(connectionId);
    return transport.disconnect(connectionId);
  }

  async getStatus(connectionId: string): Promise<TransportStatusResult> {
    const transport = await this.getTransport(connectionId);
    return transport.getStatus(connectionId);
  }

  async discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult> {
    const transport = await this.getTransport(connectionId);
    return transport.discoverCapabilities(connectionId);
  }

  async executeTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): Promise<TransportExecuteToolResult> {
    const transport = await this.getTransport(connectionId);
    return transport.executeTool(connectionId, toolName, args, abortSignal);
  }

  async readResource(
    connectionId: string,
    resourceName: string,
    abortSignal?: AbortSignal,
  ): Promise<TransportReadResourceResult> {
    const transport = await this.getTransport(connectionId);
    return transport.readResource(connectionId, resourceName, abortSignal);
  }

  async executePrompt(
    connectionId: string,
    promptName: string,
    args: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): Promise<TransportExecutePromptResult> {
    const transport = await this.getTransport(connectionId);
    return transport.executePrompt(connectionId, promptName, args, abortSignal);
  }

  async complete(
    connectionId: string,
    ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string },
    argument: { name: string; value: string },
  ): Promise<unknown> {
    const transport = await this.getTransport(connectionId);
    return transport.complete(connectionId, ref, argument);
  }

  supportsCapability(capability: string): boolean {
    return Object.values(this.transports).some((transport) =>
      transport.supportsCapability(capability),
    );
  }

  private async getTransport(connectionId: string): Promise<Transport> {
    const connection = await this.connectionRegistry.get(connectionId);
    const transport = this.transports[connection.transportType];

    if (!transport) {
      throw new ValidationError(`Unsupported transport type: '${connection.transportType}'`, {
        connectionId,
        transportType: connection.transportType,
      });
    }

    return transport;
  }
}
