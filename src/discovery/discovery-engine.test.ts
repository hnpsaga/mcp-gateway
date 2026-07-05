import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateConnectionInput } from '../connections/connection.js';
import { ConnectionRegistry } from '../connections/connection-registry.js';
import { InMemoryConnectionRepository } from '../connections/in-memory-connection-repository.js';
import { InternalError, NotFoundError, ValidationError } from '../shared/errors/index.js';
import { StdioTransport } from '../transport/stdio-transport.js';
import type { Transport } from '../transport/transport.js';
import { DiscoveryEngine } from './discovery-engine.js';
import { InMemoryDiscoveryCache } from './in-memory-discovery-cache.js';

describe('DiscoveryEngine', () => {
  let engine: DiscoveryEngine;
  let connectionRegistry: ConnectionRegistry;
  let connectionRepository: InMemoryConnectionRepository;
  let transport: Transport;
  let cache: InMemoryDiscoveryCache;
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
    cache = new InMemoryDiscoveryCache();
    engine = new DiscoveryEngine(connectionRegistry, transport, cache);

    const connection = await connectionRegistry.register(validInput);
    connectionId = connection.id;
  });

  describe('discover', () => {
    it('should discover capabilities and return a DiscoveryResult', async () => {
      const result = await engine.discover(connectionId);

      expect(result.connectionId).toBe(connectionId);
      expect(result.tools).toHaveLength(2);
      expect(result.resources).toHaveLength(2);
      expect(result.prompts).toHaveLength(2);
      expect(result.discoveredAt).toBeInstanceOf(Date);
    });

    it('should validate and return Tool models', async () => {
      const result = await engine.discover(connectionId);

      const calculate = result.tools.find((t) => t.name === 'calculate');
      expect(calculate).toBeDefined();
      expect(calculate!.description).toBe('Perform mathematical calculations');
      expect(calculate!.inputSchema).toBeDefined();

      const readFile = result.tools.find((t) => t.name === 'read_file');
      expect(readFile).toBeDefined();
      expect(readFile!.description).toBe('Read contents of a file');
    });

    it('should validate and return Resource models', async () => {
      const result = await engine.discover(connectionId);

      const config = result.resources.find((r) => r.name === 'Config');
      expect(config).toBeDefined();
      expect(config!.uri).toBe('file:///data/config.json');
      expect(config!.mimeType).toBe('application/json');

      const settings = result.resources.find((r) => r.name === 'Settings');
      expect(settings).toBeDefined();
    });

    it('should validate and return Prompt models', async () => {
      const result = await engine.discover(connectionId);

      const analyzeCode = result.prompts.find((p) => p.name === 'analyze_code');
      expect(analyzeCode).toBeDefined();
      expect(analyzeCode!.description).toBe('Analyze source code');
      expect(analyzeCode!.arguments).toHaveLength(1);
      expect(analyzeCode!.arguments![0].name).toBe('language');
      expect(analyzeCode!.arguments![0].required).toBe(true);
    });

    it('should cache the discovery result', async () => {
      await engine.discover(connectionId);

      expect(cache.has(connectionId)).toBe(true);
      const cached = cache.get(connectionId);
      expect(cached).toBeDefined();
      expect(cached!.connectionId).toBe(connectionId);
    });

    it('should throw NotFoundError for unknown connection', async () => {
      await expect(engine.discover('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should throw InternalError when transport does not support discovery', async () => {
      const unsupportedTransport: Transport = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        getStatus: vi.fn(),
        discoverCapabilities: vi.fn(),
        supportsCapability: vi.fn().mockReturnValue(false),
      };

      engine = new DiscoveryEngine(connectionRegistry, unsupportedTransport, cache);

      await expect(engine.discover(connectionId)).rejects.toThrow(InternalError);
    });

    it('should throw InternalError when transport discovery fails', async () => {
      vi.spyOn(transport, 'discoverCapabilities').mockResolvedValue({
        success: false,
        connectionId,
        error: 'Discovery timeout',
      });

      await expect(engine.discover(connectionId)).rejects.toThrow(InternalError);
    });

    it('should throw InternalError when transport returns no capabilities data', async () => {
      vi.spyOn(transport, 'discoverCapabilities').mockResolvedValue({
        success: true,
        connectionId,
      });

      await expect(engine.discover(connectionId)).rejects.toThrow(InternalError);
    });

    it('should throw ValidationError for invalid discovery response', async () => {
      vi.spyOn(transport, 'discoverCapabilities').mockResolvedValue({
        success: true,
        connectionId,
        capabilities: {
          tools: [{ name: '' }],
          resources: [],
          prompts: [],
        },
      });

      await expect(engine.discover(connectionId)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when resource has empty uri', async () => {
      vi.spyOn(transport, 'discoverCapabilities').mockResolvedValue({
        success: true,
        connectionId,
        capabilities: {
          tools: [],
          resources: [{ name: 'Bad', uri: '' }],
          prompts: [],
        },
      });

      await expect(engine.discover(connectionId)).rejects.toThrow(ValidationError);
    });

    it('should not cache result when validation fails', async () => {
      vi.spyOn(transport, 'discoverCapabilities').mockResolvedValue({
        success: true,
        connectionId,
        capabilities: {
          tools: [{ name: '' }],
          resources: [],
          prompts: [],
        },
      });

      await expect(engine.discover(connectionId)).rejects.toThrow(ValidationError);
      expect(cache.has(connectionId)).toBe(false);
    });

    it('should use default error message when transport fails without reason', async () => {
      vi.spyOn(transport, 'discoverCapabilities').mockResolvedValue({
        success: false,
        connectionId,
      });

      await expect(engine.discover(connectionId)).rejects.toThrow('Capability discovery failed');
    });
  });

  describe('getCached', () => {
    it('should return cached discovery results', async () => {
      await engine.discover(connectionId);

      const cached = engine.getCached(connectionId);

      expect(cached.connectionId).toBe(connectionId);
      expect(cached.tools).toHaveLength(2);
      expect(cached.discoveredAt).toBeInstanceOf(Date);
    });

    it('should return the same object that was cached', async () => {
      const result = await engine.discover(connectionId);
      const cached = engine.getCached(connectionId);

      expect(cached).toBe(result);
    });

    it('should throw NotFoundError when no cached results exist', async () => {
      expect(() => engine.getCached('non-existent')).toThrow(NotFoundError);
    });
  });

  describe('refresh', () => {
    it('should re-discover capabilities and update cache', async () => {
      const first = await engine.discover(connectionId);
      const firstTimestamp = first.discoveredAt;

      await new Promise((resolve) => setTimeout(resolve, 5));

      const refreshed = await engine.refresh(connectionId);

      expect(refreshed.connectionId).toBe(connectionId);
      expect(refreshed.discoveredAt.getTime()).toBeGreaterThan(firstTimestamp.getTime());
    });

    it('should call transport.discoverCapabilities again', async () => {
      const spy = vi.spyOn(transport, 'discoverCapabilities');

      await engine.discover(connectionId);
      expect(spy).toHaveBeenCalledTimes(1);

      await engine.refresh(connectionId);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should return fresh DiscoveryResult', async () => {
      await engine.discover(connectionId);

      const refreshed = await engine.refresh(connectionId);

      expect(refreshed).toBeDefined();
      expect(refreshed.connectionId).toBe(connectionId);
    });

    it('should throw NotFoundError when refreshing for unknown connection', async () => {
      await expect(engine.refresh('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for a specific connection', async () => {
      await engine.discover(connectionId);

      expect(cache.has(connectionId)).toBe(true);

      engine.clearCache(connectionId);

      expect(cache.has(connectionId)).toBe(false);
    });

    it('should clear entire cache when no connection ID provided', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        id: 'conn-2',
        name: 'Connection 2',
      });

      await engine.discover(connectionId);
      await engine.discover(conn2.id);

      expect(cache.has(connectionId)).toBe(true);
      expect(cache.has(conn2.id)).toBe(true);

      engine.clearCache();

      expect(cache.has(connectionId)).toBe(false);
      expect(cache.has(conn2.id)).toBe(false);
    });

    it('should not throw when clearing non-existent cache entry', async () => {
      expect(() => engine.clearCache('non-existent')).not.toThrow();
    });

    it('should not throw when clearing empty cache', async () => {
      expect(() => engine.clearCache()).not.toThrow();
    });
  });

  describe('cache isolation', () => {
    it('should maintain separate cache for different connections', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        id: 'conn-2',
        name: 'Connection 2',
      });

      const result1 = await engine.discover(connectionId);
      const result2 = await engine.discover(conn2.id);

      expect(cache.get(connectionId)).toBe(result1);
      expect(cache.get(conn2.id)).toBe(result2);
      expect(cache.get(connectionId)).not.toBe(result2);
    });

    it('should return correct cached result for each connection', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        id: 'conn-2',
        name: 'Connection 2',
      });

      await engine.discover(connectionId);
      await engine.discover(conn2.id);

      const cached1 = engine.getCached(connectionId);
      const cached2 = engine.getCached(conn2.id);

      expect(cached1.connectionId).toBe(connectionId);
      expect(cached2.connectionId).toBe(conn2.id);
    });

    it('should isolate cache invalidation per connection', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        id: 'conn-2',
        name: 'Connection 2',
      });

      await engine.discover(connectionId);
      await engine.discover(conn2.id);

      engine.clearCache(connectionId);

      expect(cache.has(connectionId)).toBe(false);
      expect(cache.has(conn2.id)).toBe(true);
    });
  });

  describe('connection registry integration', () => {
    it('should verify connection exists before discovering', async () => {
      const getSpy = vi.spyOn(connectionRegistry, 'get');

      await engine.discover(connectionId);

      expect(getSpy).toHaveBeenCalledWith(connectionId);
    });

    it('should not discover when connection is removed from registry', async () => {
      await connectionRegistry.remove(connectionId);

      await expect(engine.discover(connectionId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('transport integration', () => {
    it('should call transport.discoverCapabilities with connection ID', async () => {
      const spy = vi.spyOn(transport, 'discoverCapabilities');

      await engine.discover(connectionId);

      expect(spy).toHaveBeenCalledWith(connectionId);
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
            resources: [],
            prompts: [],
          },
        }),
        supportsCapability: vi.fn().mockReturnValue(true),
      };

      const isolated = new DiscoveryEngine(connectionRegistry, mockTransport, cache);
      const result = await isolated.discover(connectionId);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('mock_tool');
      expect(mockTransport.discoverCapabilities).toHaveBeenCalledWith(connectionId);
    });
  });

  describe('result immutability', () => {
    it('should return different objects on repeated discover calls', async () => {
      const first = await engine.discover(connectionId);
      const second = await engine.discover(connectionId);

      expect(first.discoveredAt).not.toBe(second.discoveredAt);
    });
  });
});
