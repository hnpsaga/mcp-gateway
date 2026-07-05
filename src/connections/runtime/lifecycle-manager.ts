import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { getLogger, traceSpan } from '../../shared/observability/index.js';
import { activeConnectionsGauge } from '../../shared/observability/metrics.js';
import type { Transport } from '../../transport/transport.js';
import type { ConnectionRegistry } from '../connection-registry.js';
import type { ConnectionStatus } from './connection-status.js';
import { STATUS_TRANSITIONS } from './connection-status.js';
import type { RuntimeConnectionState } from './runtime-connection-state.js';
import type { RuntimeStateRepository } from './runtime-state-repository.js';

export class LifecycleManager {
  constructor(
    private readonly runtimeRepository: RuntimeStateRepository,
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly transport: Transport,
  ) {}

  private async updateMetrics(): Promise<void> {
    try {
      const states = await this.runtimeRepository.findAll();
      activeConnectionsGauge.set(states.filter((s) => s.status === 'connected').length);
    } catch {
      // Avoid failing business logic on metrics update error
    }
  }

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
    await this.updateMetrics();
    return state;
  }

  async connect(connectionId: string): Promise<RuntimeConnectionState> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'LifecycleManager' });
    activeLogger.info({ args: [connectionId] }, 'Starting LifecycleManager.connect');

    return traceSpan('LifecycleManager.connect', async (span) => {
      if (span) {
        span.setAttribute('service', 'LifecycleManager');
        span.setAttribute('method', 'connect');
        span.setAttribute('connectionId', connectionId);
      }

      try {
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

        const result = await this.transport.connect(connectionId);

        if (result.success) {
          const connectedState: RuntimeConnectionState = {
            ...connectingState,
            status: 'connected',
            lastSuccessfulConnection: new Date(),
          };
          await this.runtimeRepository.save(connectedState);
          await this.updateMetrics();

          const diff = process.hrtime(start);
          const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
          activeLogger.info({ durationMs }, 'Completed LifecycleManager.connect successfully');
          return connectedState;
        }

        const failedState: RuntimeConnectionState = {
          ...connectingState,
          status: 'failed',
          lastFailure: new Date(),
          failureReason: result.error ?? 'Transport connection failed',
          retryCount: state.retryCount + 1,
        };
        await this.runtimeRepository.save(failedState);
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: failedState.failureReason },
          `Error in LifecycleManager.connect: ${failedState.failureReason}`,
        );
        return failedState;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in LifecycleManager.connect: ${msg}`);
        throw error;
      }
    });
  }

  async disconnect(connectionId: string): Promise<RuntimeConnectionState> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'LifecycleManager' });
    activeLogger.info({ args: [connectionId] }, 'Starting LifecycleManager.disconnect');

    return traceSpan('LifecycleManager.disconnect', async (span) => {
      if (span) {
        span.setAttribute('service', 'LifecycleManager');
        span.setAttribute('method', 'disconnect');
        span.setAttribute('connectionId', connectionId);
      }

      try {
        const state = await this.getExistingState(connectionId);
        this.assertValidTransition(state.status, 'disconnecting');

        const disconnectingState: RuntimeConnectionState = {
          ...state,
          status: 'disconnecting',
        };
        await this.runtimeRepository.save(disconnectingState);

        const result = await this.transport.disconnect(connectionId);

        if (result.success) {
          const disconnectedState: RuntimeConnectionState = {
            ...disconnectingState,
            status: 'disconnected',
            lastDisconnectTime: new Date(),
          };
          await this.runtimeRepository.save(disconnectedState);
          await this.updateMetrics();

          const diff = process.hrtime(start);
          const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
          activeLogger.info({ durationMs }, 'Completed LifecycleManager.disconnect successfully');
          return disconnectedState;
        }

        const failedState: RuntimeConnectionState = {
          ...disconnectingState,
          status: 'failed',
          lastFailure: new Date(),
          failureReason: result.error ?? 'Transport disconnect failed',
          retryCount: state.retryCount + 1,
        };
        await this.runtimeRepository.save(failedState);
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: failedState.failureReason },
          `Error in LifecycleManager.disconnect: ${failedState.failureReason}`,
        );
        return failedState;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in LifecycleManager.disconnect: ${msg}`);
        throw error;
      }
    });
  }

  async reconnect(connectionId: string): Promise<RuntimeConnectionState> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'LifecycleManager' });
    activeLogger.info({ args: [connectionId] }, 'Starting LifecycleManager.reconnect');

    return traceSpan('LifecycleManager.reconnect', async (span) => {
      if (span) {
        span.setAttribute('service', 'LifecycleManager');
        span.setAttribute('method', 'reconnect');
        span.setAttribute('connectionId', connectionId);
      }

      try {
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

        const result = await this.transport.connect(connectionId);

        if (result.success) {
          const connectedState: RuntimeConnectionState = {
            ...connectingState,
            status: 'connected',
            lastSuccessfulConnection: new Date(),
          };
          await this.runtimeRepository.save(connectedState);
          await this.updateMetrics();

          const diff = process.hrtime(start);
          const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
          activeLogger.info({ durationMs }, 'Completed LifecycleManager.reconnect successfully');
          return connectedState;
        }

        const failedState: RuntimeConnectionState = {
          ...connectingState,
          status: 'failed',
          lastFailure: new Date(),
          failureReason: result.error ?? 'Transport connection failed',
          retryCount: state.retryCount + 1,
        };
        await this.runtimeRepository.save(failedState);
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.error(
          { durationMs, error: failedState.failureReason },
          `Error in LifecycleManager.reconnect: ${failedState.failureReason}`,
        );
        return failedState;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in LifecycleManager.reconnect: ${msg}`);
        throw error;
      }
    });
  }

  async reset(connectionId: string): Promise<RuntimeConnectionState> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'LifecycleManager' });
    activeLogger.info({ args: [connectionId] }, 'Starting LifecycleManager.reset');

    return traceSpan('LifecycleManager.reset', async (span) => {
      if (span) {
        span.setAttribute('service', 'LifecycleManager');
        span.setAttribute('method', 'reset');
        span.setAttribute('connectionId', connectionId);
      }

      try {
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
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed LifecycleManager.reset successfully');
        return resetState;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in LifecycleManager.reset: ${msg}`);
        throw error;
      }
    });
  }

  async fail(connectionId: string, reason: string): Promise<RuntimeConnectionState> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'LifecycleManager' });
    activeLogger.info({ args: [connectionId, reason] }, 'Starting LifecycleManager.fail');

    return traceSpan('LifecycleManager.fail', async (span) => {
      if (span) {
        span.setAttribute('service', 'LifecycleManager');
        span.setAttribute('method', 'fail');
        span.setAttribute('connectionId', connectionId);
      }

      try {
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
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed LifecycleManager.fail successfully');
        return failedState;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in LifecycleManager.fail: ${msg}`);
        throw error;
      }
    });
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
