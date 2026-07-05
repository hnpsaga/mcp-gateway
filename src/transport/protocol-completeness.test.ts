import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { ConnectionRegistry } from '../connections/connection-registry.js';
import { InMemoryConnectionRepository } from '../connections/in-memory-connection-repository.js';
import { JsonRpcClient } from './json-rpc-client.js';
import { MockHttpMcpServer } from './test-utils/mock-http-mcp-server.js';
import { TransportFactory } from './transport-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mockServerPath = join(__dirname, 'test-utils', 'mock-mcp-server.ts');

describe('MCP Protocol Completeness (Phase 18)', () => {
  describe('Stdio Transport', () => {
    it('should aggregate tools, resources, and prompts transparently using pagination', async () => {
      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Test Server',
        transportType: 'stdio',
        transportConfig: {
          command: 'npx',
          args: ['tsx', mockServerPath],
        },
      });

      const transport = TransportFactory.createTransport('stdio', registry);
      const connectResult = await transport.connect(connection.id);
      expect(connectResult.success).toBe(true);

      const discovery = await transport.discoverCapabilities(connection.id);
      expect(discovery.success).toBe(true);
      expect(discovery.capabilities).toBeDefined();

      // Check pagination aggregation (we have multiple items returned across pages)
      expect(discovery.capabilities!.tools).toHaveLength(2);
      expect(discovery.capabilities!.tools[0].name).toBe('echo');
      expect(discovery.capabilities!.tools[1].name).toBe('calculate');

      expect(discovery.capabilities!.resources).toHaveLength(2);
      expect(discovery.capabilities!.resources[0].name).toBe('Config');
      expect(discovery.capabilities!.resources[1].name).toBe('Settings');

      expect(discovery.capabilities!.prompts).toHaveLength(1);
      expect(discovery.capabilities!.prompts[0].name).toBe('analyze_code');

      await transport.disconnect(connection.id);
    }, 15000);

    it('should handle completions through the complete() method', async () => {
      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Test Server',
        transportType: 'stdio',
        transportConfig: {
          command: 'npx',
          args: ['tsx', mockServerPath],
        },
      });

      const transport = TransportFactory.createTransport('stdio', registry);
      await transport.connect(connection.id);

      const completeResult = (await transport.complete(
        connection.id,
        { type: 'ref/prompt', name: 'analyze_code' },
        { name: 'language', value: 'ts' },
      )) as { success: boolean; result: { completion: { values: string[] } } };

      expect(completeResult.success).toBe(true);
      expect(completeResult.result.completion.values).toContain('value1');
      expect(completeResult.result.completion.values).toContain('value2');

      await transport.disconnect(connection.id);
    }, 15000);
  });

  describe('HTTP Transport', () => {
    it('should discover capabilities with transparent pagination aggregation over HTTP', async () => {
      const mockServer = new MockHttpMcpServer();
      await mockServer.start();

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Test HTTP Server',
        transportType: 'streamable-http',
        transportConfig: {
          url: mockServer.url,
          requestTimeout: 2000,
        },
      });

      const transport = TransportFactory.createTransport('streamable-http', registry);
      const connectResult = await transport.connect(connection.id);
      expect(connectResult.success).toBe(true);

      const discovery = await transport.discoverCapabilities(connection.id);
      expect(discovery.success).toBe(true);
      expect(discovery.capabilities).toBeDefined();

      expect(discovery.capabilities!.tools).toHaveLength(2);
      expect(discovery.capabilities!.resources).toHaveLength(2);

      await transport.disconnect(connection.id);
      await mockServer.stop();
    });

    it('should handle completions over HTTP', async () => {
      const mockServer = new MockHttpMcpServer();
      await mockServer.start();

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Test HTTP Server',
        transportType: 'streamable-http',
        transportConfig: {
          url: mockServer.url,
          requestTimeout: 2000,
        },
      });

      const transport = TransportFactory.createTransport('streamable-http', registry);
      await transport.connect(connection.id);

      const completeResult = (await transport.complete(
        connection.id,
        { type: 'ref/prompt', name: 'analyze_code' },
        { name: 'language', value: 'ts' },
      )) as { success: boolean; result: { completion: { values: string[] } } };

      expect(completeResult.success).toBe(true);
      expect(completeResult.result.completion.values).toContain('value1');

      await transport.disconnect(connection.id);
      await mockServer.stop();
    });
  });

  describe('JsonRpcClient & Cancellation features', () => {
    it('should send notifications/cancelled on abort signal', async () => {
      const mockTransport = {
        send: vi.fn(),
      };
      const client = new JsonRpcClient();
      client.setMessageHandler((msg: string) => {
        mockTransport.send(msg);
      });

      const controller = new AbortController();
      const promise = client.request('someMethod', {}, undefined, controller.signal);

      // Trigger abort immediately
      controller.abort();

      await expect(promise).rejects.toThrow();

      // Check if cancellation notification was sent
      expect(mockTransport.send).toHaveBeenCalled();
      const sentMessages = mockTransport.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const cancelNotif = sentMessages.find((m) => m.method === 'notifications/cancelled');
      expect(cancelNotif).toBeDefined();
    });
  });
});
