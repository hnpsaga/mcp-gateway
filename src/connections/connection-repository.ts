import type { Connection } from './connection.js';

export interface ConnectionRepository {
  create(connection: Connection): Promise<Connection>;
  update(id: string, data: Partial<Connection>): Promise<Connection>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Connection | null>;
  findAll(): Promise<Connection[]>;
}
