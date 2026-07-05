import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateConnectionInput } from '../connections/connection.js';
import { ConnectionRegistry } from '../connections/connection-registry.js';
import { InMemoryConnectionRepository } from '../connections/in-memory-connection-repository.js';
import { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { InMemoryDiscoveryCache } from '../discovery/in-memory-discovery-cache.js';
import { NotFoundError } from '../shared/errors/index.js';
import { StdioTransport } from '../transport/stdio-transport.js';
import type { Transport } from '../transport/transport.js';
import { ExecutionEngine } from './execution-engine.js';

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;
  let connectionRegistry: ConnectionRegistry;
  let connectionRepository: InMemoryConnectionRepository;
  let transport: StdioTransport;
  let discoveryEngine: DiscoveryEngine;
  let discoveryCache: InMemoryDiscoveryCache;
  let connectionId: string;

  const validInput: CreateConnectionInput = {
    name: 'Test Connection',
    transportType: 'stdio',
    transportConfig: { command: 'node', args: ['server.js'] },
  };

  beforeEach(async () => {
    connectionRepository = new InMemoryConnectionRepository();
    connectionRegistry = new ConnectionRegistry(connectionRepository);
    transport = new StdioTransport();
    discoveryCache = new InMemoryDiscoveryCache();
    discoveryEngine = new DiscoveryEngine(connectionRegistry, transport, discoveryCache);

    const connection = await connectionRegistry.register(validInput);
    connectionId = connection.id;

    await discoveryEngine.discover(connectionId);

    engine = new ExecutionEngine(connectionRegistry, discoveryEngine, transport);
  });

  describe('executeTool', () => {
    it('should execute a tool successfully', async () => {
      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: { expression: '2 + 2' },
      });

      expect(response.connectionId).toBe(connectionId);
      expect(response.toolName).toBe('calculate');
      expect(response.arguments).toEqual({ expression: '2 + 2' });
      expect(response.status).toBe('success');
      expect(response.result).toBeDefined();
      expect(response.result).toMatchObject({
        toolName: 'calculate',
        args: { expression: '2 + 2' },
      });
      expect(response.requestedAt).toBeInstanceOf(Date);
      expect(response.executedAt).toBeInstanceOf(Date);
      expect(response.error).toBeUndefined();
    });

    it('should include request and execution timestamps', async () => {
      const before = new Date();

      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });

      expect(response.requestedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(response.executedAt.getTime()).toBeGreaterThanOrEqual(response.requestedAt.getTime());
    });

    it('should normalize transport result into standardized response', async () => {
      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: { expression: '2 + 2' },
      });

      expect(response.status).toBe('success');
      expect(response).not.toHaveProperty('success');
      expect(response.result).not.toBeUndefined();
    });

    it('should return error response when transport fails', async () => {
      vi.spyOn(transport, 'executeTool').mockResolvedValue({
        success: false,
        connectionId,
        error: 'Tool execution timed out',
      });

      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });

      expect(response.status).toBe('error');
      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('EXECUTION_ERROR');
      expect(response.error!.message).toBe('Tool execution timed out');
    });

    it('should return default error message when transport fails without reason', async () => {
      vi.spyOn(transport, 'executeTool').mockResolvedValue({
        success: false,
        connectionId,
      });

      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });

      expect(response.status).toBe('error');
      expect(response.error!.message).toBe('Tool execution failed');
    });
  });

  describe('readResource', () => {
    it('should read a resource successfully', async () => {
      const response = await engine.readResource({
        connectionId,
        resourceName: 'Config',
      });

      expect(response.connectionId).toBe(connectionId);
      expect(response.resourceName).toBe('Config');
      expect(response.status).toBe('success');
      expect(response.contents).toBeDefined();
      expect(response.contents).toMatchObject({
        setting: 'value',
        environment: 'production',
      });
      expect(response.requestedAt).toBeInstanceOf(Date);
      expect(response.executedAt).toBeInstanceOf(Date);
      expect(response.error).toBeUndefined();
    });

    it('should include request and execution timestamps', async () => {
      const before = new Date();

      const response = await engine.readResource({
        connectionId,
        resourceName: 'Config',
      });

      expect(response.requestedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(response.executedAt.getTime()).toBeGreaterThanOrEqual(response.requestedAt.getTime());
    });

    it('should normalize transport result into standardized response', async () => {
      const response = await engine.readResource({
        connectionId,
        resourceName: 'Config',
      });

      expect(response.status).toBe('success');
      expect(response).not.toHaveProperty('success');
      expect(response.contents).not.toBeUndefined();
    });

    it('should return error response when transport fails', async () => {
      vi.spyOn(transport, 'readResource').mockResolvedValue({
        success: false,
        connectionId,
        error: 'Resource unavailable',
      });

      const response = await engine.readResource({
        connectionId,
        resourceName: 'Config',
      });

      expect(response.status).toBe('error');
      expect(response.contents).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('EXECUTION_ERROR');
      expect(response.error!.message).toBe('Resource unavailable');
    });

    it('should return default error message when transport fails without reason', async () => {
      vi.spyOn(transport, 'readResource').mockResolvedValue({
        success: false,
        connectionId,
      });

      const response = await engine.readResource({
        connectionId,
        resourceName: 'Config',
      });

      expect(response.status).toBe('error');
      expect(response.error!.message).toBe('Resource retrieval failed');
    });
  });

  describe('executePrompt', () => {
    it('should execute a prompt successfully', async () => {
      const response = await engine.executePrompt({
        connectionId,
        promptName: 'analyze_code',
        arguments: { language: 'typescript' },
      });

      expect(response.connectionId).toBe(connectionId);
      expect(response.promptName).toBe('analyze_code');
      expect(response.arguments).toEqual({ language: 'typescript' });
      expect(response.status).toBe('success');
      expect(response.result).toBeDefined();
      expect(response.result).toMatchObject({
        promptName: 'analyze_code',
        args: { language: 'typescript' },
      });
      expect(response.requestedAt).toBeInstanceOf(Date);
      expect(response.executedAt).toBeInstanceOf(Date);
      expect(response.error).toBeUndefined();
    });

    it('should include request and execution timestamps', async () => {
      const before = new Date();

      const response = await engine.executePrompt({
        connectionId,
        promptName: 'analyze_code',
        arguments: { language: 'typescript' },
      });

      expect(response.requestedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(response.executedAt.getTime()).toBeGreaterThanOrEqual(response.requestedAt.getTime());
    });

    it('should normalize transport result into standardized response', async () => {
      const response = await engine.executePrompt({
        connectionId,
        promptName: 'analyze_code',
        arguments: { language: 'typescript' },
      });

      expect(response.status).toBe('success');
      expect(response).not.toHaveProperty('success');
      expect(response.result).not.toBeUndefined();
    });

    it('should return error response when transport fails', async () => {
      vi.spyOn(transport, 'executePrompt').mockResolvedValue({
        success: false,
        connectionId,
        error: 'Prompt execution failed',
      });

      const response = await engine.executePrompt({
        connectionId,
        promptName: 'analyze_code',
        arguments: {},
      });

      expect(response.status).toBe('error');
      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('EXECUTION_ERROR');
      expect(response.error!.message).toBe('Prompt execution failed');
    });

    it('should return default error message when transport fails without reason', async () => {
      vi.spyOn(transport, 'executePrompt').mockResolvedValue({
        success: false,
        connectionId,
      });

      const response = await engine.executePrompt({
        connectionId,
        promptName: 'analyze_code',
        arguments: {},
      });

      expect(response.status).toBe('error');
      expect(response.error!.message).toBe('Prompt execution failed');
    });
  });

  describe('discovery validation', () => {
    it('should throw NotFoundError for unknown connection', async () => {
      await expect(
        engine.executeTool({
          connectionId: 'non-existent',
          toolName: 'calculate',
          arguments: {},
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for unknown tool', async () => {
      await expect(
        engine.executeTool({
          connectionId,
          toolName: 'unknown_tool',
          arguments: {},
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for unknown resource', async () => {
      await expect(
        engine.readResource({
          connectionId,
          resourceName: 'unknown_resource',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for unknown prompt', async () => {
      await expect(
        engine.executePrompt({
          connectionId,
          promptName: 'unknown_prompt',
          arguments: {},
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should provide meaningful error details for unknown tool', async () => {
      try {
        await engine.executeTool({
          connectionId,
          toolName: 'unknown_tool',
          arguments: {},
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        if (error instanceof NotFoundError) {
          expect(error.details).toMatchObject({
            connectionId,
            toolName: 'unknown_tool',
          });
        }
      }
    });

    it('should require discovery to have been run before execution', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        name: 'Connection 2',
      });

      await expect(
        engine.executeTool({
          connectionId: conn2.id,
          toolName: 'calculate',
          arguments: {},
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('result normalization', () => {
    it('should always include connectionId in the response', async () => {
      const toolResponse = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });
      expect(toolResponse.connectionId).toBe(connectionId);

      const resourceResponse = await engine.readResource({
        connectionId,
        resourceName: 'Config',
      });
      expect(resourceResponse.connectionId).toBe(connectionId);

      const promptResponse = await engine.executePrompt({
        connectionId,
        promptName: 'analyze_code',
        arguments: {},
      });
      expect(promptResponse.connectionId).toBe(connectionId);
    });

    it('should always include timestamps in response', async () => {
      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });

      expect(response.requestedAt).toBeInstanceOf(Date);
      expect(response.executedAt).toBeInstanceOf(Date);
    });

    it('should strip transport-specific fields from response', async () => {
      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });

      expect(response).not.toHaveProperty('success');
    });

    it('should include error information when execution fails', async () => {
      vi.spyOn(transport, 'executeTool').mockResolvedValue({
        success: false,
        connectionId,
        error: 'Internal transport error',
      });

      const response = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });

      expect(response.status).toBe('error');
      expect(response.error).toEqual({
        code: 'EXECUTION_ERROR',
        message: 'Internal transport error',
      });
    });
  });

  describe('multiple connection isolation', () => {
    it('should maintain separate execution context for different connections', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        name: 'Connection 2',
      });
      await discoveryEngine.discover(conn2.id);

      const response1 = await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: { expression: '1 + 1' },
      });

      const response2 = await engine.executeTool({
        connectionId: conn2.id,
        toolName: 'calculate',
        arguments: { expression: '2 + 2' },
      });

      expect(response1.connectionId).toBe(connectionId);
      expect(response2.connectionId).toBe(conn2.id);
      expect(response1.result).not.toBe(response2.result);
    });

    it('should isolate discovery validation per connection', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        name: 'Connection 2',
      });
      await discoveryEngine.discover(conn2.id);

      const response = await engine.executeTool({
        connectionId: conn2.id,
        toolName: 'calculate',
        arguments: {},
      });

      expect(response.status).toBe('success');
    });
  });

  describe('stub transport interaction', () => {
    it('should delegate tool execution to the transport', async () => {
      const spy = vi.spyOn(transport, 'executeTool');

      await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: { expression: '2 + 2' },
      });

      expect(spy).toHaveBeenCalledWith(connectionId, 'calculate', { expression: '2 + 2' });
    });

    it('should delegate resource reading to the transport', async () => {
      const spy = vi.spyOn(transport, 'readResource');

      await engine.readResource({
        connectionId,
        resourceName: 'Config',
      });

      expect(spy).toHaveBeenCalledWith(connectionId, 'Config');
    });

    it('should delegate prompt execution to the transport', async () => {
      const spy = vi.spyOn(transport, 'executePrompt');

      await engine.executePrompt({
        connectionId,
        promptName: 'analyze_code',
        arguments: { language: 'typescript' },
      });

      expect(spy).toHaveBeenCalledWith(connectionId, 'analyze_code', { language: 'typescript' });
    });

    it('should support inline transport mock for per-test isolation', async () => {
      const mockTransport: Transport = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        discoverCapabilities: vi.fn().mockResolvedValue({
          success: true,
          connectionId,
          capabilities: {
            tools: [{ name: 'mock_tool', description: 'A mock tool' }],
            resources: [{ name: 'mock_resource', uri: 'mock://resource' }],
            prompts: [{ name: 'mock_prompt', description: 'A mock prompt' }],
          },
        }),
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          connectionId,
          result: { mock: 'data' },
        }),
        readResource: vi.fn().mockResolvedValue({
          success: true,
          connectionId,
          contents: { mock: 'resource' },
        }),
        executePrompt: vi.fn().mockResolvedValue({
          success: true,
          connectionId,
          result: { mock: 'prompt' },
        }),
        complete: vi.fn(),
        supportsCapability: vi.fn().mockReturnValue(true),
      };

      const isolatedRegistry = new ConnectionRegistry(new InMemoryConnectionRepository());
      const isolatedCache = new InMemoryDiscoveryCache();
      const isolatedDiscovery = new DiscoveryEngine(isolatedRegistry, mockTransport, isolatedCache);
      const isolated = new ExecutionEngine(isolatedRegistry, isolatedDiscovery, mockTransport);

      const conn = await isolatedRegistry.register(validInput);
      await isolatedDiscovery.discover(conn.id);

      const toolResult = await isolated.executeTool({
        connectionId: conn.id,
        toolName: 'mock_tool',
        arguments: { key: 'value' },
      });
      expect(toolResult.status).toBe('success');
      expect(toolResult.result).toEqual({ mock: 'data' });
      expect(mockTransport.executeTool).toHaveBeenCalledWith(conn.id, 'mock_tool', {
        key: 'value',
      });

      const resourceResult = await isolated.readResource({
        connectionId: conn.id,
        resourceName: 'mock_resource',
      });
      expect(resourceResult.status).toBe('success');
      expect(resourceResult.contents).toEqual({ mock: 'resource' });

      const promptResult = await isolated.executePrompt({
        connectionId: conn.id,
        promptName: 'mock_prompt',
        arguments: { lang: 'en' },
      });
      expect(promptResult.status).toBe('success');
      expect(promptResult.result).toEqual({ mock: 'prompt' });
    });
  });

  describe('transport error propagation', () => {
    it('should handle transport execution failure for tools', async () => {
      vi.spyOn(transport, 'executeTool').mockRejectedValue(new Error('Unexpected transport error'));

      await expect(
        engine.executeTool({
          connectionId,
          toolName: 'calculate',
          arguments: {},
        }),
      ).rejects.toThrow('Unexpected transport error');
    });

    it('should handle transport execution failure for resources', async () => {
      vi.spyOn(transport, 'readResource').mockRejectedValue(new Error('Transport unavailable'));

      await expect(
        engine.readResource({
          connectionId,
          resourceName: 'Config',
        }),
      ).rejects.toThrow('Transport unavailable');
    });

    it('should handle transport execution failure for prompts', async () => {
      vi.spyOn(transport, 'executePrompt').mockRejectedValue(new Error('Prompt engine down'));

      await expect(
        engine.executePrompt({
          connectionId,
          promptName: 'analyze_code',
          arguments: {},
        }),
      ).rejects.toThrow('Prompt engine down');
    });
  });

  describe('registry integration', () => {
    it('should verify connection exists via registry before executing', async () => {
      const getSpy = vi.spyOn(connectionRegistry, 'get');

      await engine.executeTool({
        connectionId,
        toolName: 'calculate',
        arguments: {},
      });

      expect(getSpy).toHaveBeenCalledWith(connectionId);
    });

    it('should not execute when connection is removed from registry', async () => {
      await connectionRegistry.remove(connectionId);

      await expect(
        engine.executeTool({
          connectionId,
          toolName: 'calculate',
          arguments: {},
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
