import type { RuntimeConnectionState } from './runtime-connection-state.js';

export interface RuntimeStateRepository {
  save(state: RuntimeConnectionState): Promise<void>;
  findById(connectionId: string): Promise<RuntimeConnectionState | null>;
  findAll(): Promise<RuntimeConnectionState[]>;
  delete(connectionId: string): Promise<void>;
}
