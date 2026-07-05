import { beforeEach, describe, expect, it } from 'vitest';

import type { CreateConnectionInput } from './connection.js';
import { ConnectionRegistry } from './connection-registry.js';
import { InMemoryConnectionRepository } from './in-memory-connection-repository.js';

describe('ConnectionRegistry', () => {
  let registry: ConnectionRegistry;
  let repository: InMemoryConnectionRepository;

  const validStdioInput: CreateConnectionInput = {
    name: 'Test Connection',
    transportType: 'stdio',
    transportConfig: { command: 'node', args: ['server.js'] },
  };

  const validHttpInput: CreateConnectionInput = {
    name: 'HTTP Connection',
    transportType: 'streamable-http',
    transportConfig: { url: 'http://localhost:8080/mcp' },
  };

  beforeEach(() => {
    repository = new InMemoryConnectionRepository();
    registry = new ConnectionRegistry(repository);
  });

  describe('register', () => {
    it('should register a valid stdio connection', async () => {
      const connection = await registry.register(validStdioInput);

      expect(connection.id).toBeDefined();
      expect(connection.name).toBe('Test Connection');
      expect(connection.description).toBe('');
      expect(connection.transportType).toBe('stdio');
      expect(connection.transportConfig).toEqual({ command: 'node', args: ['server.js'] });
      expect(connection.enabled).toBe(true);
      expect(connection.tags).toEqual([]);
      expect(connection.metadata).toEqual({});
      expect(connection.createdAt).toBeInstanceOf(Date);
      expect(connection.updatedAt).toBeInstanceOf(Date);
    });

    it('should register a valid streamable-http connection', async () => {
      const connection = await registry.register(validHttpInput);

      expect(connection.id).toBeDefined();
      expect(connection.name).toBe('HTTP Connection');
      expect(connection.transportType).toBe('streamable-http');
      expect(connection.transportConfig).toEqual({ url: 'http://localhost:8080/mcp' });
    });

    it('should accept a custom ID', async () => {
      const connection = await registry.register({
        ...validStdioInput,
        id: 'my-custom-id',
      });

      expect(connection.id).toBe('my-custom-id');
    });

    it('should auto-generate an ID when not provided', async () => {
      const connection = await registry.register(validStdioInput);

      expect(connection.id).toBeDefined();
      expect(connection.id.length).toBeGreaterThan(0);
    });

    it('should preserve provided optional fields', async () => {
      const connection = await registry.register({
        ...validStdioInput,
        description: 'My test connection',
        enabled: false,
        tags: ['production', 'database'],
        metadata: { environment: 'prod' },
      });

      expect(connection.description).toBe('My test connection');
      expect(connection.enabled).toBe(false);
      expect(connection.tags).toEqual(['production', 'database']);
      expect(connection.metadata).toEqual({ environment: 'prod' });
    });

    it('should reject duplicate IDs', async () => {
      await registry.register({
        ...validStdioInput,
        id: 'dup-id',
      });

      await expect(
        registry.register({
          ...validHttpInput,
          id: 'dup-id',
        }),
      ).rejects.toThrow('A connection with this ID already exists');
    });

    it('should reject missing name', async () => {
      await expect(
        registry.register({
          ...validStdioInput,
          name: '',
        }),
      ).rejects.toThrow('Invalid connection configuration');
    });

    it('should reject invalid transport type', async () => {
      await expect(
        registry.register({
          ...validStdioInput,
          transportType: 'invalid' as never,
        }),
      ).rejects.toThrow('Invalid connection configuration');
    });

    it('should reject stdio transport without command', async () => {
      await expect(
        registry.register({
          ...validStdioInput,
          transportConfig: { args: ['server.js'] },
        }),
      ).rejects.toThrow('Invalid connection configuration');
    });

    it('should reject streamable-http transport without url', async () => {
      await expect(
        registry.register({
          ...validHttpInput,
          transportConfig: {},
        }),
      ).rejects.toThrow('Invalid connection configuration');
    });
  });

  describe('update', () => {
    it('should update connection fields', async () => {
      const connection = await registry.register(validStdioInput);

      const updated = await registry.update(connection.id, {
        name: 'Updated Connection',
        description: 'Updated description',
      });

      expect(updated.name).toBe('Updated Connection');
      expect(updated.description).toBe('Updated description');
      expect(updated.transportType).toBe('stdio');
    });

    it('should update transport type and config', async () => {
      const connection = await registry.register(validStdioInput);

      const updated = await registry.update(connection.id, {
        transportType: 'streamable-http',
        transportConfig: { url: 'http://example.com/mcp' },
      });

      expect(updated.transportType).toBe('streamable-http');
      expect(updated.transportConfig).toEqual({ url: 'http://example.com/mcp' });
    });

    it('should update enabled state', async () => {
      const connection = await registry.register(validStdioInput);

      const disabled = await registry.update(connection.id, { enabled: false });
      expect(disabled.enabled).toBe(false);

      const enabled = await registry.update(connection.id, { enabled: true });
      expect(enabled.enabled).toBe(true);
    });

    it('should update tags and metadata', async () => {
      const connection = await registry.register(validStdioInput);

      const updated = await registry.update(connection.id, {
        tags: ['new-tag'],
        metadata: { key: 'value' },
      });

      expect(updated.tags).toEqual(['new-tag']);
      expect(updated.metadata).toEqual({ key: 'value' });
    });

    it('should reject update for non-existent connection', async () => {
      await expect(registry.update('non-existent', { name: 'New Name' })).rejects.toThrow(
        'Connection not found',
      );
    });

    it('should reject update with empty name', async () => {
      const connection = await registry.register(validStdioInput);

      await expect(registry.update(connection.id, { name: '' })).rejects.toThrow(
        'Invalid connection configuration',
      );
    });

    it('should reject update with invalid transport config', async () => {
      const connection = await registry.register(validStdioInput);

      await expect(
        registry.update(connection.id, {
          transportType: 'streamable-http',
          transportConfig: {},
        }),
      ).rejects.toThrow('Invalid connection configuration');
    });
  });

  describe('remove', () => {
    it('should remove an existing connection', async () => {
      const connection = await registry.register(validStdioInput);

      await registry.remove(connection.id);

      await expect(registry.get(connection.id)).rejects.toThrow('Connection not found');
    });

    it('should reject removal of non-existent connection', async () => {
      await expect(registry.remove('non-existent')).rejects.toThrow('Connection not found');
    });
  });

  describe('get', () => {
    it('should retrieve a connection by ID', async () => {
      const connection = await registry.register(validStdioInput);

      const retrieved = await registry.get(connection.id);

      expect(retrieved.id).toBe(connection.id);
      expect(retrieved.name).toBe(connection.name);
    });

    it('should reject retrieval of non-existent connection', async () => {
      await expect(registry.get('non-existent')).rejects.toThrow('Connection not found');
    });
  });

  describe('list', () => {
    it('should return all registered connections', async () => {
      await registry.register({ ...validStdioInput, id: 'conn-1' });
      await registry.register({ ...validHttpInput, id: 'conn-2' });
      await registry.register({ ...validStdioInput, id: 'conn-3' });

      const connections = await registry.list();

      expect(connections).toHaveLength(3);
    });

    it('should return empty array when no connections exist', async () => {
      const connections = await registry.list();

      expect(connections).toEqual([]);
    });
  });

  describe('enable / disable', () => {
    it('should enable a connection', async () => {
      const connection = await registry.register({ ...validStdioInput, enabled: false });
      expect(connection.enabled).toBe(false);

      const enabled = await registry.enable(connection.id);
      expect(enabled.enabled).toBe(true);
    });

    it('should disable a connection', async () => {
      const connection = await registry.register(validStdioInput);
      expect(connection.enabled).toBe(true);

      const disabled = await registry.disable(connection.id);
      expect(disabled.enabled).toBe(false);
    });

    it('should reject enable for non-existent connection', async () => {
      await expect(registry.enable('non-existent')).rejects.toThrow('Connection not found');
    });

    it('should reject disable for non-existent connection', async () => {
      await expect(registry.disable('non-existent')).rejects.toThrow('Connection not found');
    });
  });
});
