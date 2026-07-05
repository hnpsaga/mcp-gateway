import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { HttpClient, HttpClientResponseTooLargeError } from './http-client.js';
import { JsonRpcClient, JsonRpcError, JsonRpcParseError } from './json-rpc-client.js';
import { StdioProcessManager } from './stdio-process-manager.js';
import { StdioTransport } from './stdio-transport.js';
import { MockHttpMcpServer } from './test-utils/mock-http-mcp-server.js';
import { TransportFactory } from './transport-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mockServerPath = join(__dirname, 'test-utils', 'mock-mcp-server.ts');

describe('Transport Hardening - JSON-RPC Client', () => {
  describe('message size limits', () => {
    it('should handle oversized messages in handleData gracefully', () => {
      const client = new JsonRpcClient({ maxMessageSize: 10 });
      const handler = vi.fn();
      client.setMessageHandler(handler);

      expect(() =>
        client.handleData(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data: 'x'.repeat(100) } }),
        ),
      ).not.toThrow();
    });

    it('should handle config object constructor', () => {
      const client = new JsonRpcClient({
        defaultTimeout: 5000,
        maxMessageSize: 2048,
        maxPendingRequests: 50,
      });
      expect(client.pendingCount()).toBe(0);
    });

    it('should handle numeric constructor (backward compat)', () => {
      const client = new JsonRpcClient(5000);
      expect(client.pendingCount()).toBe(0);
    });
  });

  describe('max pending requests', () => {
    it('should reject when exceeding max pending requests', async () => {
      const client = new JsonRpcClient({ defaultTimeout: 5000, maxPendingRequests: 2 });
      const handler = vi.fn();
      client.setMessageHandler(handler);

      client.request('a').catch(() => {});
      client.request('b').catch(() => {});

      await expect(client.request('c')).rejects.toThrow('Too many pending requests');
    });
  });

  describe('closed client', () => {
    it('should reject requests when client is closed', async () => {
      const client = new JsonRpcClient();
      client.setMessageHandler(vi.fn());
      client.close();

      await expect(client.request('test')).rejects.toThrow('client is closed');
    });

    it('should not send notifications when closed', () => {
      const client = new JsonRpcClient();
      const handler = vi.fn();
      client.setMessageHandler(handler);
      client.close();

      client.notification('test');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should be safe to close multiple times', () => {
      const client = new JsonRpcClient();
      client.setMessageHandler(vi.fn());
      client.close();
      client.close();
      expect(client.isClosed()).toBe(true);
    });
  });

  describe('duplicate response handling', () => {
    it('should ignore duplicate responses', async () => {
      const client = new JsonRpcClient();
      const messages: string[] = [];
      client.setMessageHandler((msg) => {
        messages.push(msg);
      });

      const promise = client.request('test');
      const id = JSON.parse(messages[0]).id;

      client.handleData(JSON.stringify({ jsonrpc: '2.0', id, result: { data: 'first' } }));
      client.handleData(JSON.stringify({ jsonrpc: '2.0', id, result: { data: 'duplicate' } }));

      const result = await promise;
      expect(result.result).toEqual({ data: 'first' });
    });
  });

  describe('non-JSON-RPC messages', () => {
    it('should ignore messages without jsonrpc field', () => {
      const client = new JsonRpcClient();
      client.setMessageHandler(vi.fn());
      expect(() => client.handleData(JSON.stringify({ result: 'ok' }))).not.toThrow();
    });

    it('should ignore messages with wrong jsonrpc version', () => {
      const client = new JsonRpcClient();
      client.setMessageHandler(vi.fn());
      expect(() =>
        client.handleData(JSON.stringify({ jsonrpc: '1.0', id: 1, result: 'ok' })),
      ).not.toThrow();
    });

    it('should ignore responses with unknown IDs', () => {
      const client = new JsonRpcClient();
      client.setMessageHandler(vi.fn());
      expect(() =>
        client.handleData(JSON.stringify({ jsonrpc: '2.0', id: 999, result: {} })),
      ).not.toThrow();
    });
  });

  describe('invalid JSON', () => {
    it('should handle malformed JSON gracefully', () => {
      const client = new JsonRpcClient();
      client.setMessageHandler(vi.fn());
      expect(() => client.handleData('not json at all')).not.toThrow();
    });

    it('should handle partial JSON gracefully', () => {
      const client = new JsonRpcClient();
      client.setMessageHandler(vi.fn());
      expect(() => client.handleData('{"jsonrpc": "2.0", "id": 1, ')).not.toThrow();
    });
  });

  describe('error response parsing', () => {
    it('should reject with JsonRpcError on protocol error response', async () => {
      const client = new JsonRpcClient();
      const messages: string[] = [];
      client.setMessageHandler((msg) => {
        messages.push(msg);
      });

      const promise = client.request('failing.method');

      const id = JSON.parse(messages[0]).id;
      client.handleData(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found' },
        }),
      );

      await expect(promise).rejects.toThrow(JsonRpcError);
      await expect(promise).rejects.toThrow('Method not found');
    });

    it('should reject with JsonRpcParseError when neither result nor error present', async () => {
      const client = new JsonRpcClient();
      const messages: string[] = [];
      client.setMessageHandler((msg) => {
        messages.push(msg);
      });

      const promise = client.request('test');
      const id = JSON.parse(messages[0]).id;

      client.handleData(JSON.stringify({ jsonrpc: '2.0', id }));

      await expect(promise).rejects.toThrow(JsonRpcParseError);
    });
  });
});

describe('Transport Hardening - StdioProcessManager', () => {
  describe('buffer limits', () => {
    it('should track stdout bytes read', () => {
      const manager = new StdioProcessManager({ maxStdoutBufferSize: 1000 });
      expect(manager.getStdoutBytesRead()).toBe(0);
    });

    it('should track stderr bytes read', () => {
      const manager = new StdioProcessManager({ maxStderrBufferSize: 1000 });
      expect(manager.getStderrBytesRead()).toBe(0);
    });

    it('should capture stderr output', () => {
      const manager = new StdioProcessManager({ maxStderrBufferSize: 1000 });
      expect(manager.getStderrOutput()).toBe('');
    });
  });

  describe('state management', () => {
    it('should start in non-running state', () => {
      const manager = new StdioProcessManager();
      expect(manager.isRunning()).toBe(false);
      expect(manager.isKilled()).toBe(false);
    });
  });
});

describe('Transport Hardening - HttpClient', () => {
  describe('response size limits', () => {
    it('should reject oversized responses', async () => {
      const server = new MockHttpMcpServer();
      await server.start();

      const client = new HttpClient({
        baseUrl: server.url,
        timeout: 5000,
        maxResponseSize: 10,
      });

      try {
        await client.post('/', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpClientResponseTooLargeError);
      }

      await server.stop();
    });
  });
});

describe('Transport Hardening - Stdio Transport', () => {
  describe('connection timeout', () => {
    it('should fail with timeout when process takes too long', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Slow Server',
        transportType: 'stdio',
        transportConfig: {
          command: 'npx',
          args: ['tsx', mockServerPath],
          env: { MOCK_SERVER_DELAY_MS: '500' },
          requestTimeout: 30000,
        },
      });

      const transport = new StdioTransport(registry, {
        connectionTimeout: 100,
      });

      const result = await transport.connect(connection.id);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');

      await transport.disconnect(connection.id);
    });
  });

  describe('process startup', () => {
    it('should fail to connect to a non-existent command', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Bad Server',
        transportType: 'stdio',
        transportConfig: { command: 'nonexistent-command-12345', args: [] },
      });
      const transport = TransportFactory.createTransport('stdio', registry);

      const result = await transport.connect(connection.id);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });
  });

  describe('disconnect timeout', () => {
    it('should handle disconnect gracefully', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

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
      const result = await transport.disconnect(connection.id);

      expect(result.success).toBe(true);
      expect(result.status).toBe('disconnected');
    });
  });

  describe('reconnect after failure', () => {
    it('should reconnect after disconnect', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

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
      await transport.disconnect(connection.id);

      const result = await transport.connect(connection.id);
      expect(result.success).toBe(true);
      expect(result.status).toBe('connected');

      await transport.disconnect(connection.id);
    });
  });

  describe('repeated connect/disconnect', () => {
    it('should handle multiple connect/disconnect cycles', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

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

      for (let i = 0; i < 3; i++) {
        const connectResult = await transport.connect(connection.id);
        expect(connectResult.success).toBe(true);
        expect(connectResult.status).toBe('connected');

        const disconnectResult = await transport.disconnect(connection.id);
        expect(disconnectResult.success).toBe(true);
        expect(disconnectResult.status).toBe('disconnected');
      }
    }, 15000);
  });

  describe('error recovery', () => {
    it('should clean up state after connection failure', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Bad Server',
        transportType: 'stdio',
        transportConfig: { command: 'nonexistent-command', args: [] },
      });
      const transport = TransportFactory.createTransport('stdio', registry);

      await transport.connect(connection.id);

      const status = await transport.getStatus(connection.id);
      expect(status.status).toBe('disconnected');
    });
  });

  describe('status details', () => {
    it('should include process running flag in status details', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

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

      const status = await transport.getStatus(connection.id);
      expect(status.details).toBeDefined();

      await transport.disconnect(connection.id);
    });
  });
});

describe('Transport Hardening - Streamable HTTP Transport', () => {
  describe('HTTP failure scenarios', () => {
    it('should handle 500 errors during connect', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

      const badServer = new MockHttpMcpServer({ failAllRequests: true });
      await badServer.start();

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Failing Server',
        transportType: 'streamable-http',
        transportConfig: { url: badServer.url },
      });
      const transport = TransportFactory.createTransport('streamable-http', registry);

      const result = await transport.connect(connection.id);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');

      await badServer.stop();
    });

    it('should handle non-existent server', async () => {
      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Bad Server',
        transportType: 'streamable-http',
        transportConfig: { url: 'http://127.0.0.1:1' },
      });
      const transport = TransportFactory.createTransport('streamable-http', registry);

      const result = await transport.connect(connection.id);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });
  });

  describe('repeated connect/disconnect', () => {
    it('should handle multiple connect/disconnect cycles', async () => {
      const mockServer = new MockHttpMcpServer();
      await mockServer.start();

      const { ConnectionRegistry, InMemoryConnectionRepository } =
        await import('../connections/index.js');

      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Test Server',
        transportType: 'streamable-http',
        transportConfig: { url: mockServer.url },
      });
      const transport = TransportFactory.createTransport('streamable-http', registry);

      for (let i = 0; i < 3; i++) {
        const connectResult = await transport.connect(connection.id);
        expect(connectResult.success).toBe(true);

        const disconnectResult = await transport.disconnect(connection.id);
        expect(disconnectResult.success).toBe(true);
      }

      await mockServer.stop();
    });
  });
});

describe('Transport Hardening - TransportFactory', () => {
  it('should create transports with hardening options', () => {
    const transport = TransportFactory.createTransport('stdio');
    expect(transport).toBeDefined();
    expect(transport.connect).toBeInstanceOf(Function);
  });
});
