import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { ConnectionRegistry } from '../connection-registry.js';
import type { ConnectionStatus } from './connection-status.js';
import { STATUS_TRANSITIONS } from './connection-status.js';
import type { RuntimeConnectionState } from './runtime-connection-state.js';
import type { RuntimeStateRepository } from './runtime-state-repository.js';

export class LifecycleManager {
  constructor(
    private readonly runtimeRepository: RuntimeStateRepository,
    private readonly connectionRegistry: ConnectionRegistry,
  ) {}

  async initialize(connectionId: string): Promise<RuntimeConnectionState> {
    await this.ensureConnectionExists(connectionId);

    const existing = await this.runtimeRepository.findById(connectionId);
    if (existing) {
      throw new ConflictError('Runtime state already initialized', { connectionId });
    }

    const state: RuntimeConnectionState = {
      connectionId,
      status: 'registered',
      lastConnectionAttempt: null,
      lastSuccessfulConnection: null,
      lastDisconnectTime: null,
      lastFailure: null,
      failureReason: null,
      retryCount: 0,
      runtimeMetadata: {},
    };

    await this.runtimeRepository.save(state);
    return state;
  }

  async connect(connectionId: string): Promise<RuntimeConnectionState> {
    const state = await this.getExistingState(connectionId);

    if (state.status !== 'registered') {
      throw new ConflictError(
        `Cannot connect from '${state.status}' state. Use 'reconnect' from disconnected state`,
        { currentStatus: state.status, expectedStatus: 'registered' },
      );
    }

    this.assertValidTransition(state.status, 'connecting');

    const connectingState: RuntimeConnectionState = {
      ...state,
      status: 'connecting',
      lastConnectionAttempt: new Date(),
    };
    await this.runtimeRepository.save(connectingState);

    const connectedState: RuntimeConnectionState = {
      ...connectingState,
      status: 'connected',
      lastSuccessfulConnection: new Date(),
    };
    await this.runtimeRepository.save(connectedState);

    return connectedState;
  }

  async disconnect(connectionId: string): Promise<RuntimeConnectionState> {
    const state = await this.getExistingState(connectionId);
    this.assertValidTransition(state.status, 'disconnecting');

    const disconnectingState: RuntimeConnectionState = {
      ...state,
      status: 'disconnecting',
    };
    await this.runtimeRepository.save(disconnectingState);

    const disconnectedState: RuntimeConnectionState = {
      ...disconnectingState,
      status: 'disconnected',
      lastDisconnectTime: new Date(),
    };
    await this.runtimeRepository.save(disconnectedState);

    return disconnectedState;
  }

  async reconnect(connectionId: string): Promise<RuntimeConnectionState> {
    const state = await this.getExistingState(connectionId);

    if (state.status !== 'disconnected') {
      throw new ConflictError(
        `Cannot reconnect from '${state.status}' state. Use 'connect' from registered state`,
        { currentStatus: state.status, expectedStatus: 'disconnected' },
      );
    }

    this.assertValidTransition(state.status, 'connecting');

    const connectingState: RuntimeConnectionState = {
      ...state,
      status: 'connecting',
      lastConnectionAttempt: new Date(),
    };
    await this.runtimeRepository.save(connectingState);

    const connectedState: RuntimeConnectionState = {
      ...connectingState,
      status: 'connected',
      lastSuccessfulConnection: new Date(),
    };
    await this.runtimeRepository.save(connectedState);

    return connectedState;
  }

  async reset(connectionId: string): Promise<RuntimeConnectionState> {
    const state = await this.getExistingState(connectionId);

    const resetState: RuntimeConnectionState = {
      ...state,
      status: 'registered',
      lastConnectionAttempt: null,
      lastSuccessfulConnection: null,
      lastDisconnectTime: null,
      lastFailure: null,
      failureReason: null,
      retryCount: 0,
    };
    await this.runtimeRepository.save(resetState);

    return resetState;
  }

  async fail(connectionId: string, reason: string): Promise<RuntimeConnectionState> {
    const state = await this.getExistingState(connectionId);
    this.assertValidTransition(state.status, 'failed');

    const failedState: RuntimeConnectionState = {
      ...state,
      status: 'failed',
      lastFailure: new Date(),
      failureReason: reason,
      retryCount: state.retryCount + 1,
    };
    await this.runtimeRepository.save(failedState);

    return failedState;
  }

  async getState(connectionId: string): Promise<RuntimeConnectionState> {
    const state = await this.runtimeRepository.findById(connectionId);
    if (!state) {
      throw new NotFoundError('Runtime state not found', { connectionId });
    }
    return state;
  }

  async listStates(): Promise<RuntimeConnectionState[]> {
    return this.runtimeRepository.findAll();
  }

  private async ensureConnectionExists(connectionId: string): Promise<void> {
    try {
      await this.connectionRegistry.get(connectionId);
    } catch {
      throw new NotFoundError('Connection not found in registry', { connectionId });
    }
  }

  private async getExistingState(connectionId: string): Promise<RuntimeConnectionState> {
    const state = await this.runtimeRepository.findById(connectionId);
    if (!state) {
      throw new NotFoundError('Runtime state not initialized', { connectionId });
    }
    return state;
  }

  private assertValidTransition(from: ConnectionStatus, to: ConnectionStatus): void {
    const allowed = STATUS_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new ConflictError(`Invalid state transition from '${from}' to '${to}'`, {
        currentStatus: from,
        requestedStatus: to,
        allowedTransitions: allowed,
      });
    }
  }
}
