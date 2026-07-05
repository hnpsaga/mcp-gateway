import type { ConnectionRegistry } from '../connections/connection-registry.js';
import type { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { NotFoundError } from '../shared/errors/index.js';
import { getLogger, sanitize, traceSpan } from '../shared/observability/index.js';
import { executionCounter, executionDuration } from '../shared/observability/metrics.js';
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
    const start = process.hrtime();
    const requestedAt = new Date();
    const activeLogger = getLogger().child({ component: 'ExecutionEngine' });
    activeLogger.info({ args: [sanitize(request)] }, 'Starting ExecutionEngine.executeTool');

    return traceSpan('ExecutionEngine.executeTool', async (span) => {
      if (span) {
        span.setAttribute('service', 'ExecutionEngine');
        span.setAttribute('method', 'executeTool');
        span.setAttribute('connectionId', request.connectionId);
        span.setAttribute('toolName', request.toolName);
      }

      try {
        await this.ensureConnectionExists(request.connectionId);
        await this.ensureToolExists(request.connectionId, request.toolName);

        const transportResult = await this.transport.executeTool(
          request.connectionId,
          request.toolName,
          request.arguments,
        );

        const executedAt = new Date();
        const diff = process.hrtime(start);
        const durationSec = diff[0] + diff[1] / 1e9;
        const durationMs = durationSec * 1000;

        if (!transportResult.success) {
          const response: ExecuteToolResponse = {
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
          executionCounter.inc({ type: 'tool', status: 'failure' });
          executionDuration.observe({ type: 'tool', status: 'failure' }, durationSec);
          activeLogger.error(
            { durationMs, error: response.error },
            `Error in ExecutionEngine.executeTool: ${response.error?.message}`,
          );
          return response;
        }

        const response: ExecuteToolResponse = {
          connectionId: request.connectionId,
          toolName: request.toolName,
          arguments: request.arguments,
          requestedAt,
          executedAt,
          status: 'success',
          result: transportResult.result,
        };

        executionCounter.inc({ type: 'tool', status: 'success' });
        executionDuration.observe({ type: 'tool', status: 'success' }, durationSec);
        activeLogger.info({ durationMs }, 'Completed ExecutionEngine.executeTool successfully');
        return response;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationSec = diff[0] + diff[1] / 1e9;
        const durationMs = durationSec * 1000;
        executionCounter.inc({ type: 'tool', status: 'failure' });
        executionDuration.observe({ type: 'tool', status: 'failure' }, durationSec);
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ExecutionEngine.executeTool: ${msg}`);
        throw error;
      }
    });
  }

  async readResource(request: ReadResourceRequest): Promise<ReadResourceResponse> {
    const start = process.hrtime();
    const requestedAt = new Date();
    const activeLogger = getLogger().child({ component: 'ExecutionEngine' });
    activeLogger.info({ args: [sanitize(request)] }, 'Starting ExecutionEngine.readResource');

    return traceSpan('ExecutionEngine.readResource', async (span) => {
      if (span) {
        span.setAttribute('service', 'ExecutionEngine');
        span.setAttribute('method', 'readResource');
        span.setAttribute('connectionId', request.connectionId);
        span.setAttribute('resourceName', request.resourceName);
      }

      try {
        await this.ensureConnectionExists(request.connectionId);
        await this.ensureResourceExists(request.connectionId, request.resourceName);

        const transportResult = await this.transport.readResource(
          request.connectionId,
          request.resourceName,
        );

        const executedAt = new Date();
        const diff = process.hrtime(start);
        const durationSec = diff[0] + diff[1] / 1e9;
        const durationMs = durationSec * 1000;

        if (!transportResult.success) {
          const response: ReadResourceResponse = {
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
          executionCounter.inc({ type: 'resource', status: 'failure' });
          executionDuration.observe({ type: 'resource', status: 'failure' }, durationSec);
          activeLogger.error(
            { durationMs, error: response.error },
            `Error in ExecutionEngine.readResource: ${response.error?.message}`,
          );
          return response;
        }

        const response: ReadResourceResponse = {
          connectionId: request.connectionId,
          resourceName: request.resourceName,
          requestedAt,
          executedAt,
          status: 'success',
          contents: transportResult.contents,
        };

        executionCounter.inc({ type: 'resource', status: 'success' });
        executionDuration.observe({ type: 'resource', status: 'success' }, durationSec);
        activeLogger.info({ durationMs }, 'Completed ExecutionEngine.readResource successfully');
        return response;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationSec = diff[0] + diff[1] / 1e9;
        const durationMs = durationSec * 1000;
        executionCounter.inc({ type: 'resource', status: 'failure' });
        executionDuration.observe({ type: 'resource', status: 'failure' }, durationSec);
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ExecutionEngine.readResource: ${msg}`);
        throw error;
      }
    });
  }

  async executePrompt(request: ExecutePromptRequest): Promise<ExecutePromptResponse> {
    const start = process.hrtime();
    const requestedAt = new Date();
    const activeLogger = getLogger().child({ component: 'ExecutionEngine' });
    activeLogger.info({ args: [sanitize(request)] }, 'Starting ExecutionEngine.executePrompt');

    return traceSpan('ExecutionEngine.executePrompt', async (span) => {
      if (span) {
        span.setAttribute('service', 'ExecutionEngine');
        span.setAttribute('method', 'executePrompt');
        span.setAttribute('connectionId', request.connectionId);
        span.setAttribute('promptName', request.promptName);
      }

      try {
        await this.ensureConnectionExists(request.connectionId);
        await this.ensurePromptExists(request.connectionId, request.promptName);

        const transportResult = await this.transport.executePrompt(
          request.connectionId,
          request.promptName,
          request.arguments,
        );

        const executedAt = new Date();
        const diff = process.hrtime(start);
        const durationSec = diff[0] + diff[1] / 1e9;
        const durationMs = durationSec * 1000;

        if (!transportResult.success) {
          const response: ExecutePromptResponse = {
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
          executionCounter.inc({ type: 'prompt', status: 'failure' });
          executionDuration.observe({ type: 'prompt', status: 'failure' }, durationSec);
          activeLogger.error(
            { durationMs, error: response.error },
            `Error in ExecutionEngine.executePrompt: ${response.error?.message}`,
          );
          return response;
        }

        const response: ExecutePromptResponse = {
          connectionId: request.connectionId,
          promptName: request.promptName,
          arguments: request.arguments,
          requestedAt,
          executedAt,
          status: 'success',
          result: transportResult.result,
        };

        executionCounter.inc({ type: 'prompt', status: 'success' });
        executionDuration.observe({ type: 'prompt', status: 'success' }, durationSec);
        activeLogger.info({ durationMs }, 'Completed ExecutionEngine.executePrompt successfully');
        return response;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationSec = diff[0] + diff[1] / 1e9;
        const durationMs = durationSec * 1000;
        executionCounter.inc({ type: 'prompt', status: 'failure' });
        executionDuration.observe({ type: 'prompt', status: 'failure' }, durationSec);
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ExecutionEngine.executePrompt: ${msg}`);
        throw error;
      }
    });
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
