import type { ConnectionRegistry } from '../connections/connection-registry.js';
import type { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { NotFoundError } from '../shared/errors/index.js';
import type { Transport } from '../transport/transport.js';
import type {
  ExecutePromptRequest,
  ExecutePromptResponse,
  ExecuteToolRequest,
  ExecuteToolResponse,
  ReadResourceRequest,
  ReadResourceResponse,
} from './execution-types.js';

export class ExecutionEngine {
  constructor(
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly discoveryEngine: DiscoveryEngine,
    private readonly transport: Transport,
  ) {}

  async executeTool(request: ExecuteToolRequest): Promise<ExecuteToolResponse> {
    const requestedAt = new Date();

    await this.ensureConnectionExists(request.connectionId);
    await this.ensureToolExists(request.connectionId, request.toolName);

    const transportResult = await this.transport.executeTool(
      request.connectionId,
      request.toolName,
      request.arguments,
    );

    const executedAt = new Date();

    if (!transportResult.success) {
      return {
        connectionId: request.connectionId,
        toolName: request.toolName,
        arguments: request.arguments,
        requestedAt,
        executedAt,
        status: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: transportResult.error ?? 'Tool execution failed',
        },
      };
    }

    return {
      connectionId: request.connectionId,
      toolName: request.toolName,
      arguments: request.arguments,
      requestedAt,
      executedAt,
      status: 'success',
      result: transportResult.result,
    };
  }

  async readResource(request: ReadResourceRequest): Promise<ReadResourceResponse> {
    const requestedAt = new Date();

    await this.ensureConnectionExists(request.connectionId);
    await this.ensureResourceExists(request.connectionId, request.resourceName);

    const transportResult = await this.transport.readResource(
      request.connectionId,
      request.resourceName,
    );

    const executedAt = new Date();

    if (!transportResult.success) {
      return {
        connectionId: request.connectionId,
        resourceName: request.resourceName,
        requestedAt,
        executedAt,
        status: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: transportResult.error ?? 'Resource retrieval failed',
        },
      };
    }

    return {
      connectionId: request.connectionId,
      resourceName: request.resourceName,
      requestedAt,
      executedAt,
      status: 'success',
      contents: transportResult.contents,
    };
  }

  async executePrompt(request: ExecutePromptRequest): Promise<ExecutePromptResponse> {
    const requestedAt = new Date();

    await this.ensureConnectionExists(request.connectionId);
    await this.ensurePromptExists(request.connectionId, request.promptName);

    const transportResult = await this.transport.executePrompt(
      request.connectionId,
      request.promptName,
      request.arguments,
    );

    const executedAt = new Date();

    if (!transportResult.success) {
      return {
        connectionId: request.connectionId,
        promptName: request.promptName,
        arguments: request.arguments,
        requestedAt,
        executedAt,
        status: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: transportResult.error ?? 'Prompt execution failed',
        },
      };
    }

    return {
      connectionId: request.connectionId,
      promptName: request.promptName,
      arguments: request.arguments,
      requestedAt,
      executedAt,
      status: 'success',
      result: transportResult.result,
    };
  }

  private async ensureConnectionExists(connectionId: string): Promise<void> {
    try {
      await this.connectionRegistry.get(connectionId);
    } catch {
      throw new NotFoundError('Connection not found in registry', { connectionId });
    }
  }

  private async ensureToolExists(connectionId: string, toolName: string): Promise<void> {
    const discovery = this.discoveryEngine.getCached(connectionId);
    const tool = discovery.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new NotFoundError('Tool not found via discovery', {
        connectionId,
        toolName,
      });
    }
  }

  private async ensureResourceExists(connectionId: string, resourceName: string): Promise<void> {
    const discovery = this.discoveryEngine.getCached(connectionId);
    const resource = discovery.resources.find((r) => r.name === resourceName);
    if (!resource) {
      throw new NotFoundError('Resource not found via discovery', {
        connectionId,
        resourceName,
      });
    }
  }

  private async ensurePromptExists(connectionId: string, promptName: string): Promise<void> {
    const discovery = this.discoveryEngine.getCached(connectionId);
    const prompt = discovery.prompts.find((p) => p.name === promptName);
    if (!prompt) {
      throw new NotFoundError('Prompt not found via discovery', {
        connectionId,
        promptName,
      });
    }
  }
}
