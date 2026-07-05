import type { RuntimeConnectionState } from './runtime-connection-state.js';
import type { RuntimeStateRepository } from './runtime-state-repository.js';

export class InMemoryRuntimeStateRepository implements RuntimeStateRepository {
  private readonly states: Map<string, RuntimeConnectionState> = new Map();

  async save(state: RuntimeConnectionState): Promise<void> {
    this.states.set(state.connectionId, state);
  }

  async findById(connectionId: string): Promise<RuntimeConnectionState | null> {
    return this.states.get(connectionId) ?? null;
  }

  async findAll(): Promise<RuntimeConnectionState[]> {
    return Array.from(this.states.values());
  }

  async delete(connectionId: string): Promise<void> {
    this.states.delete(connectionId);
  }
}
