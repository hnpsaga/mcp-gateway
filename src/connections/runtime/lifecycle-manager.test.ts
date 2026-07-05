import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { StdioTransport } from '../../transport/stdio-transport.js';
import type { Transport } from '../../transport/transport.js';
import type { CreateConnectionInput } from '../connection.js';
import { ConnectionRegistry } from '../connection-registry.js';
import { InMemoryConnectionRepository } from '../in-memory-connection-repository.js';
import { InMemoryRuntimeStateRepository } from './in-memory-runtime-state-repository.js';
import { LifecycleManager } from './lifecycle-manager.js';

describe('LifecycleManager', () => {
  let lifecycleManager: LifecycleManager;
  let runtimeRepository: InMemoryRuntimeStateRepository;
  let connectionRegistry: ConnectionRegistry;
  let transport: Transport;
  let connectionId: string;

  const validInput: CreateConnectionInput = {
    name: 'Test Connection',
    transportType: 'stdio',
    transportConfig: { command: 'node', args: ['server.js'] },
  };

  beforeEach(async () => {
    runtimeRepository = new InMemoryRuntimeStateRepository();
    const connectionRepository = new InMemoryConnectionRepository();
    connectionRegistry = new ConnectionRegistry(connectionRepository);
    transport = new StdioTransport();
    lifecycleManager = new LifecycleManager(runtimeRepository, connectionRegistry, transport);

    const connection = await connectionRegistry.register(validInput);
    connectionId = connection.id;
  });

  describe('initialize', () => {
    it('should initialize runtime state for a registered connection', async () => {
      const state = await lifecycleManager.initialize(connectionId);

      expect(state.connectionId).toBe(connectionId);
      expect(state.status).toBe('registered');
      expect(state.lastConnectionAttempt).toBeNull();
      expect(state.lastSuccessfulConnection).toBeNull();
      expect(state.lastDisconnectTime).toBeNull();
      expect(state.lastFailure).toBeNull();
      expect(state.failureReason).toBeNull();
      expect(state.retryCount).toBe(0);
      expect(state.runtimeMetadata).toEqual({});
    });

    it('should reject initialization for a non-existent connection', async () => {
      await expect(lifecycleManager.initialize('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should reject duplicate initialization', async () => {
      await lifecycleManager.initialize(connectionId);

      await expect(lifecycleManager.initialize(connectionId)).rejects.toThrow(ConflictError);
    });
  });

  describe('connect', () => {
    it('should transition from registered to connected', async () => {
      await lifecycleManager.initialize(connectionId);
      const state = await lifecycleManager.connect(connectionId);

      expect(state.status).toBe('connected');
      expect(state.lastConnectionAttempt).toBeInstanceOf(Date);
      expect(state.lastSuccessfulConnection).toBeInstanceOf(Date);
    });

    it('should reject connect when not initialized', async () => {
      await expect(lifecycleManager.connect(connectionId)).rejects.toThrow(NotFoundError);
    });

    it('should reject connect from connected state', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);

      await expect(lifecycleManager.connect(connectionId)).rejects.toThrow(ConflictError);
    });

    it('should reject connect from disconnected state', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);

      await expect(lifecycleManager.connect(connectionId)).rejects.toThrow(ConflictError);
    });

    it('should reject connect from failed state', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.fail(connectionId, 'test failure');

      await expect(lifecycleManager.connect(connectionId)).rejects.toThrow(ConflictError);
    });
  });

  describe('disconnect', () => {
    it('should transition from connected to disconnected', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      const state = await lifecycleManager.disconnect(connectionId);

      expect(state.status).toBe('disconnected');
      expect(state.lastDisconnectTime).toBeInstanceOf(Date);
    });

    it('should reject disconnect from registered state', async () => {
      await lifecycleManager.initialize(connectionId);

      await expect(lifecycleManager.disconnect(connectionId)).rejects.toThrow(ConflictError);
    });

    it('should reject disconnect from disconnected state', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);

      await expect(lifecycleManager.disconnect(connectionId)).rejects.toThrow(ConflictError);
    });

    it('should reject disconnect when not initialized', async () => {
      await expect(lifecycleManager.disconnect(connectionId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('reconnect', () => {
    it('should transition from disconnected to connected', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);
      const state = await lifecycleManager.reconnect(connectionId);

      expect(state.status).toBe('connected');
      expect(state.lastConnectionAttempt).toBeInstanceOf(Date);
      expect(state.lastSuccessfulConnection).toBeInstanceOf(Date);
    });

    it('should reject reconnect from registered state', async () => {
      await lifecycleManager.initialize(connectionId);

      await expect(lifecycleManager.reconnect(connectionId)).rejects.toThrow(ConflictError);
    });

    it('should reject reconnect from connected state', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);

      await expect(lifecycleManager.reconnect(connectionId)).rejects.toThrow(ConflictError);
    });

    it('should reject reconnect when not initialized', async () => {
      await expect(lifecycleManager.reconnect(connectionId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('reset', () => {
    it('should reset from connected to registered', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      const state = await lifecycleManager.reset(connectionId);

      expect(state.status).toBe('registered');
      expect(state.lastConnectionAttempt).toBeNull();
      expect(state.lastSuccessfulConnection).toBeNull();
      expect(state.lastDisconnectTime).toBeNull();
      expect(state.lastFailure).toBeNull();
      expect(state.failureReason).toBeNull();
      expect(state.retryCount).toBe(0);
    });

    it('should reset from disconnected to registered', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);
      const state = await lifecycleManager.reset(connectionId);

      expect(state.status).toBe('registered');
    });

    it('should reset from failed to registered', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.fail(connectionId, 'failure');
      const state = await lifecycleManager.reset(connectionId);

      expect(state.status).toBe('registered');
      expect(state.retryCount).toBe(0);
    });

    it('should reset when already registered', async () => {
      await lifecycleManager.initialize(connectionId);
      const state = await lifecycleManager.reset(connectionId);

      expect(state.status).toBe('registered');
    });

    it('should reject reset when not initialized', async () => {
      await expect(lifecycleManager.reset(connectionId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('fail', () => {
    it('should transition from connecting to failed', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      const state = await lifecycleManager.fail(connectionId, 'connection timeout');

      expect(state.status).toBe('failed');
      expect(state.lastFailure).toBeInstanceOf(Date);
      expect(state.failureReason).toBe('connection timeout');
      expect(state.retryCount).toBe(1);
    });

    it('should increment retry count on repeated failures', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);

      await lifecycleManager.fail(connectionId, 'failure 1');
      const state = await lifecycleManager.fail(connectionId, 'failure 2');

      expect(state.retryCount).toBe(2);
      expect(state.failureReason).toBe('failure 2');
    });

    it('should reject fail from registered state', async () => {
      await lifecycleManager.initialize(connectionId);

      await expect(lifecycleManager.fail(connectionId, 'no reason')).rejects.toThrow(ConflictError);
    });

    it('should reject fail from disconnected state', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);

      await expect(lifecycleManager.fail(connectionId, 'no reason')).rejects.toThrow(ConflictError);
    });

    it('should reject fail when not initialized', async () => {
      await expect(lifecycleManager.fail(connectionId, 'reason')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getState', () => {
    it('should retrieve runtime state after initialization', async () => {
      await lifecycleManager.initialize(connectionId);
      const state = await lifecycleManager.getState(connectionId);

      expect(state.connectionId).toBe(connectionId);
      expect(state.status).toBe('registered');
    });

    it('should reflect current state after transitions', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      const state = await lifecycleManager.getState(connectionId);

      expect(state.status).toBe('connected');
    });

    it('should throw when state does not exist', async () => {
      await expect(lifecycleManager.getState('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listStates', () => {
    it('should return all initialized runtime states', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        id: 'conn-2',
        name: 'Connection 2',
      });
      const conn3 = await connectionRegistry.register({
        ...validInput,
        id: 'conn-3',
        name: 'Connection 3',
      });

      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.initialize(conn2.id);
      await lifecycleManager.initialize(conn3.id);

      const states = await lifecycleManager.listStates();

      expect(states).toHaveLength(3);
    });

    it('should return empty array when no states exist', async () => {
      const states = await lifecycleManager.listStates();

      expect(states).toEqual([]);
    });

    it('should only return initialized states, not all connections', async () => {
      await lifecycleManager.initialize(connectionId);

      const states = await lifecycleManager.listStates();

      expect(states).toHaveLength(1);
    });
  });

  describe('invalid transitions', () => {
    it('should provide meaningful error details on invalid transition', async () => {
      await lifecycleManager.initialize(connectionId);

      try {
        await lifecycleManager.disconnect(connectionId);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        if (error instanceof ConflictError) {
          expect(error.statusCode).toBe(409);
          expect(error.code).toBe('CONFLICT');
          expect(error.details).toMatchObject({
            currentStatus: 'registered',
            requestedStatus: 'disconnecting',
          });
        }
      }
    });

    it('should fail from connecting state', async () => {
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);

      const state = await lifecycleManager.fail(connectionId, 'simulated error');
      expect(state.status).toBe('failed');
    });

    it('should allow full lifecycle: registered -> connected -> disconnected', async () => {
      await lifecycleManager.initialize(connectionId);

      let state = await lifecycleManager.connect(connectionId);
      expect(state.status).toBe('connected');

      state = await lifecycleManager.disconnect(connectionId);
      expect(state.status).toBe('disconnected');
    });

    it('should allow full lifecycle with reconnect: registered -> connected -> disconnected -> connected', async () => {
      await lifecycleManager.initialize(connectionId);

      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);
      const state = await lifecycleManager.reconnect(connectionId);

      expect(state.status).toBe('connected');
    });

    it('should allow reset from any state to registered', async () => {
      await lifecycleManager.initialize(connectionId);

      let state = await lifecycleManager.reset(connectionId);
      expect(state.status).toBe('registered');

      await lifecycleManager.connect(connectionId);
      state = await lifecycleManager.reset(connectionId);
      expect(state.status).toBe('registered');

      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);
      state = await lifecycleManager.reset(connectionId);
      expect(state.status).toBe('registered');

      await lifecycleManager.connect(connectionId);
      await lifecycleManager.fail(connectionId, 'error');
      state = await lifecycleManager.reset(connectionId);
      expect(state.status).toBe('registered');
    });
  });

  describe('transport integration', () => {
    it('should call transport.connect during connect', async () => {
      const connectSpy = vi.spyOn(transport, 'connect');
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);

      expect(connectSpy).toHaveBeenCalledWith(connectionId);
    });

    it('should transition to failed when transport.connect fails', async () => {
      vi.spyOn(transport, 'connect').mockResolvedValue({
        success: false,
        connectionId,
        status: 'failed',
        error: 'Connection refused',
      });

      await lifecycleManager.initialize(connectionId);
      const state = await lifecycleManager.connect(connectionId);

      expect(state.status).toBe('failed');
      expect(state.failureReason).toBe('Connection refused');
      expect(state.lastFailure).toBeInstanceOf(Date);
      expect(state.retryCount).toBe(1);
    });

    it('should call transport.disconnect during disconnect', async () => {
      const disconnectSpy = vi.spyOn(transport, 'disconnect');
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);

      expect(disconnectSpy).toHaveBeenCalledWith(connectionId);
    });

    it('should transition to failed when transport.disconnect fails', async () => {
      vi.spyOn(transport, 'disconnect').mockResolvedValue({
        success: false,
        connectionId,
        status: 'failed',
        error: 'Disconnect failed',
      });

      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      const state = await lifecycleManager.disconnect(connectionId);

      expect(state.status).toBe('failed');
      expect(state.failureReason).toBe('Disconnect failed');
    });

    it('should call transport.connect during reconnect', async () => {
      const connectSpy = vi.spyOn(transport, 'connect');
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);
      await lifecycleManager.reconnect(connectionId);

      expect(connectSpy).toHaveBeenCalledWith(connectionId);
    });

    it('should transition to failed when reconnect transport fails', async () => {
      vi.spyOn(transport, 'connect')
        .mockResolvedValueOnce({ success: true, connectionId, status: 'connected' })
        .mockResolvedValueOnce({
          success: false,
          connectionId,
          status: 'failed',
          error: 'Reconnection refused',
        });

      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);
      const state = await lifecycleManager.reconnect(connectionId);

      expect(state.status).toBe('failed');
      expect(state.failureReason).toBe('Reconnection refused');
      expect(state.retryCount).toBe(1);
    });

    it('should use default error message when transport connect fails without reason', async () => {
      vi.spyOn(transport, 'connect').mockResolvedValue({
        success: false,
        connectionId,
        status: 'failed',
      });

      await lifecycleManager.initialize(connectionId);
      const state = await lifecycleManager.connect(connectionId);

      expect(state.status).toBe('failed');
      expect(state.failureReason).toBe('Transport connection failed');
    });

    it('should use default error message when transport disconnect fails without reason', async () => {
      vi.spyOn(transport, 'disconnect').mockResolvedValue({
        success: false,
        connectionId,
        status: 'failed',
      });

      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      const state = await lifecycleManager.disconnect(connectionId);

      expect(state.status).toBe('failed');
      expect(state.failureReason).toBe('Transport disconnect failed');
    });

    it('should not modify the connection definition when transport operations occur', async () => {
      const connection = await connectionRegistry.get(connectionId);
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);
      await lifecycleManager.disconnect(connectionId);

      const connectionAfter = await connectionRegistry.get(connectionId);
      expect(connectionAfter).toEqual(connection);
    });

    it('should handle inline transport mock for per-test isolation', async () => {
      const mockTransport: Transport = {
        connect: vi.fn().mockResolvedValue({ success: true, connectionId, status: 'connected' }),
        disconnect: vi.fn().mockResolvedValue({
          success: true,
          connectionId,
          status: 'disconnected',
        }),
        getStatus: vi.fn().mockResolvedValue({ connectionId, status: 'connected' }),
        supportsCapability: vi.fn().mockReturnValue(true),
      };
      const isolated = new LifecycleManager(runtimeRepository, connectionRegistry, mockTransport);

      await isolated.initialize(connectionId);
      const state = await isolated.connect(connectionId);

      expect(state.status).toBe('connected');
      expect(mockTransport.connect).toHaveBeenCalledWith(connectionId);
    });
  });

  describe('runtime state isolation', () => {
    it('should not modify the connection definition', async () => {
      const connection = await connectionRegistry.get(connectionId);
      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.connect(connectionId);

      const connectionAfter = await connectionRegistry.get(connectionId);
      expect(connectionAfter).toEqual(connection);
    });

    it('should maintain separate state for different connections', async () => {
      const conn2 = await connectionRegistry.register({
        ...validInput,
        id: 'conn-2',
        name: 'Connection 2',
      });

      await lifecycleManager.initialize(connectionId);
      await lifecycleManager.initialize(conn2.id);
      await lifecycleManager.connect(connectionId);

      const state1 = await lifecycleManager.getState(connectionId);
      const state2 = await lifecycleManager.getState(conn2.id);

      expect(state1.status).toBe('connected');
      expect(state2.status).toBe('registered');
    });

    it('should allow deletion from runtime repository without affecting registry', async () => {
      const connection = await connectionRegistry.get(connectionId);
      await lifecycleManager.initialize(connectionId);

      await runtimeRepository.delete(connectionId);

      const connections = await connectionRegistry.list();
      expect(connections).toHaveLength(1);
      expect(connections[0]).toEqual(connection);
    });
  });
});
