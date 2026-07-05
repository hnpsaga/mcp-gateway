import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { CreateConnectionInput } from '../connections/connection.js';
import { ConnectionRegistry } from '../connections/connection-registry.js';
import { InMemoryConnectionRepository } from '../connections/in-memory-connection-repository.js';
import type { Transport } from './transport.js';
import { TransportFactory } from './transport-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mockServerPath = join(__dirname, 'test-utils', 'mock-mcp-server.ts');

function createValidInput(overrides: Partial<CreateConnectionInput> = {}): CreateConnectionInput {
  return {
    name: 'Test Connection',
    transportType: 'stdio',
    transportConfig: {
      command: 'npx',
      args: ['tsx', mockServerPath],
    },
    ...overrides,
  };
}

async function createTestTransport(): Promise<{
  transport: Transport;
  registry: ConnectionRegistry;
  connectionId: string;
}> {
  const repository = new InMemoryConnectionRepository();
  const registry = new ConnectionRegistry(repository);
  const connection = await registry.register(createValidInput());
  const transport = TransportFactory.createTransport('stdio', registry);
  return { transport, registry, connectionId: connection.id };
}

describe('StdioTransport (real)', () => {
  describe('connect', () => {
    it('should connect to a stdio MCP server successfully', async () => {
      const { transport, connectionId } = await createTestTransport();

      const result = await transport.connect(connectionId);

      expect(result.success).toBe(true);
      expect(result.connectionId).toBe(connectionId);
      expect(result.status).toBe('connected');

      await transport.disconnect(connectionId);
    });

    it('should fail to connect to a non-existent command', async () => {
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

    it('should fail when connection is disabled', async () => {
      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        ...createValidInput(),
        enabled: false,
      });
      const transport = TransportFactory.createTransport('stdio', registry);

      const result = await transport.connect(connection.id);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('disabled');
    });

    it('should reject duplicate connect calls', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const result = await transport.connect(connectionId);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('already exists');

      await transport.disconnect(connectionId);
    });
  });

  describe('disconnect', () => {
    it('should disconnect a connected transport', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const result = await transport.disconnect(connectionId);

      expect(result.success).toBe(true);
      expect(result.status).toBe('disconnected');
    });

    it('should be safe to disconnect when not connected', async () => {
      const { transport, connectionId } = await createTestTransport();

      const result = await transport.disconnect(connectionId);

      expect(result.success).toBe(true);
      expect(result.status).toBe('disconnected');
    });

    it('should be safe to call disconnect multiple times', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      await transport.disconnect(connectionId);
      const result = await transport.disconnect(connectionId);

      expect(result.success).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return disconnected status for unknown connection', async () => {
      const { transport } = await createTestTransport();

      const status = await transport.getStatus('unknown');

      expect(status.status).toBe('disconnected');
    });

    it('should return connected status after connecting', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const status = await transport.getStatus(connectionId);

      expect(status.status).toBe('connected');
      expect(status.details).toBeDefined();
      expect(status.details!.protocolVersion).toBeDefined();
      expect(status.details!.createdAt).toBeDefined();

      await transport.disconnect(connectionId);
    });

    it('should return disconnected status after disconnecting', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      await transport.disconnect(connectionId);
      const status = await transport.getStatus(connectionId);

      expect(status.status).toBe('disconnected');
    });
  });

  describe('discoverCapabilities', () => {
    it('should discover tools, resources, and prompts', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const result = await transport.discoverCapabilities(connectionId);

      expect(result.success).toBe(true);
      expect(result.capabilities).toBeDefined();
      expect(result.capabilities!.tools.length).toBeGreaterThan(0);
      expect(result.capabilities!.resources.length).toBeGreaterThan(0);
      expect(result.capabilities!.prompts.length).toBeGreaterThan(0);

      const toolNames = result.capabilities!.tools.map((t) => t.name);
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('calculate');

      await transport.disconnect(connectionId);
    });

    it('should return error when not connected', async () => {
      const { transport, connectionId } = await createTestTransport();

      const result = await transport.discoverCapabilities(connectionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });

    it('should handle server-side errors during discovery', async () => {
      const repository = new InMemoryConnectionRepository();
      const registry = new ConnectionRegistry(repository);
      const connection = await registry.register({
        name: 'Failing Discovery',
        transportType: 'stdio',
        transportConfig: {
          command: 'npx',
          args: ['tsx', mockServerPath],
          env: { MOCK_SERVER_FAIL_METHODS: JSON.stringify(['tools/list']) },
        },
      });
      const transport = TransportFactory.createTransport('stdio', registry);

      await transport.connect(connection.id);
      const result = await transport.discoverCapabilities(connection.id);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      await transport.disconnect(connection.id);
    });
  });

  describe('executeTool', () => {
    it('should execute a tool successfully', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const result = await transport.executeTool(connectionId, 'echo', {
        message: 'hello',
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      await transport.disconnect(connectionId);
    });

    it('should return error when not connected', async () => {
      const { transport, connectionId } = await createTestTransport();

      const result = await transport.executeTool(connectionId, 'echo', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });
  });

  describe('readResource', () => {
    it('should read a resource successfully', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const result = await transport.readResource(connectionId, 'Config');

      expect(result.success).toBe(true);
      expect(result.contents).toBeDefined();

      await transport.disconnect(connectionId);
    });

    it('should return error for unknown resource', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const result = await transport.readResource(connectionId, 'NonExistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');

      await transport.disconnect(connectionId);
    });

    it('should return error when not connected', async () => {
      const { transport, connectionId } = await createTestTransport();

      const result = await transport.readResource(connectionId, 'Config');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });
  });

  describe('executePrompt', () => {
    it('should execute a prompt successfully', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      const result = await transport.executePrompt(connectionId, 'analyze_code', {
        language: 'typescript',
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      await transport.disconnect(connectionId);
    });

    it('should return error when not connected', async () => {
      const { transport, connectionId } = await createTestTransport();

      const result = await transport.executePrompt(connectionId, 'analyze_code', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });
  });

  describe('supportsCapability', () => {
    it('should support stdio capability', async () => {
      const { transport } = await createTestTransport();

      expect(transport.supportsCapability('stdio')).toBe(true);
    });

    it('should support base capabilities', async () => {
      const { transport } = await createTestTransport();

      expect(transport.supportsCapability('connect')).toBe(true);
      expect(transport.supportsCapability('disconnect')).toBe(true);
      expect(transport.supportsCapability('status')).toBe(true);
      expect(transport.supportsCapability('discover-capabilities')).toBe(true);
      expect(transport.supportsCapability('execute-tool')).toBe(true);
      expect(transport.supportsCapability('read-resource')).toBe(true);
      expect(transport.supportsCapability('execute-prompt')).toBe(true);
    });
  });

  describe('reconnect', () => {
    it('should allow reconnecting after disconnect', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      await transport.disconnect(connectionId);

      const result = await transport.connect(connectionId);
      expect(result.success).toBe(true);
      expect(result.status).toBe('connected');

      await transport.disconnect(connectionId);
    });

    it('should create a fresh session on reconnect', async () => {
      const { transport, connectionId } = await createTestTransport();

      await transport.connect(connectionId);
      await transport.disconnect(connectionId);
      await transport.connect(connectionId);

      const status = await transport.getStatus(connectionId);
      expect(status.status).toBe('connected');

      await transport.disconnect(connectionId);
    });
  });
});
