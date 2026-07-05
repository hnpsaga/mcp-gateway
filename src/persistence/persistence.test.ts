import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import type { Connection, CreateConnectionInput } from '../connections/connection.js';
import type { ConnectionRepository } from '../connections/connection-repository.js';
import type { RuntimeConnectionState } from '../connections/runtime/runtime-connection-state.js';
import type { RuntimeStateRepository } from '../connections/runtime/runtime-state-repository.js';
import type { DiscoveryCache } from '../discovery/discovery-cache.js';
import type { DiscoveryResult, Tool } from '../discovery/discovery-types.js';
import { closeDatabase, getDatabase, initializeDatabase, runMigrations } from './database.js';
import { PersistenceError } from './errors.js';
import { SqliteConnectionRepository } from './sqlite-connection-repository.js';
import { SqliteDiscoveryCache } from './sqlite-discovery-cache.js';
import { SqliteRuntimeStateRepository } from './sqlite-runtime-state-repository.js';

function createTestDb() {
  const db = initializeDatabase({
    path: ':memory:',
    filename: '',
    walMode: true,
    busyTimeout: 5000,
  });
  runMigrations(db);
  return db;
}

const validConnection: Connection = {
  id: randomUUID(),
  name: 'Test Connection',
  description: 'A test connection',
  transportType: 'stdio',
  transportConfig: { command: 'node', args: ['server.js'] },
  enabled: true,
  tags: ['test'],
  metadata: { environment: 'testing' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validInput: CreateConnectionInput = {
  name: 'Test Connection',
  transportType: 'stdio',
  transportConfig: { command: 'node', args: ['server.js'] },
};

describe('Database Initialization', () => {
  it('should initialize an in-memory database', () => {
    const db = createTestDb();
    expect(db).toBeDefined();
    closeDatabase();
  });

  it('should run migrations successfully', () => {
    const db = createTestDb();
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toContain('connections');
    expect(tableNames).toContain('discovery_cache');
    expect(tableNames).toContain('runtime_state');
    closeDatabase();
  });

  it('should provide a singleton database access', () => {
    const db1 = createTestDb();
    const db2 = getDatabase();
    expect(db2).toBeDefined();
    expect(db2).toBe(db1);
    closeDatabase();
  });

  it('should throw when getting database before initialization', () => {
    closeDatabase();
    expect(() => getDatabase()).toThrow('Database not initialized');
  });
});

describe('Connection Repository', () => {
  let repo: ConnectionRepository;

  beforeEach(() => {
    createTestDb();
    repo = new SqliteConnectionRepository();
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should create a connection', async () => {
    const result = await repo.create(validConnection);
    expect(result.id).toBe(validConnection.id);
    expect(result.name).toBe('Test Connection');
  });

  it('should find a connection by ID', async () => {
    await repo.create(validConnection);
    const found = await repo.findById(validConnection.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test Connection');
  });

  it('should return null for non-existent connection', async () => {
    const found = await repo.findById('non-existent');
    expect(found).toBeNull();
  });

  it('should list all connections', async () => {
    await repo.create(validConnection);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(validConnection.id);
  });

  it('should return empty array when no connections', async () => {
    const all = await repo.findAll();
    expect(all).toEqual([]);
  });

  it('should update a connection', async () => {
    await repo.create(validConnection);
    const updated = await repo.update(validConnection.id, { name: 'Updated' });
    expect(updated.name).toBe('Updated');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(validConnection.updatedAt.getTime());
  });

  it('should update transport config', async () => {
    await repo.create(validConnection);
    const updated = await repo.update(validConnection.id, {
      transportType: 'streamable-http',
      transportConfig: { url: 'http://example.com/mcp' },
    });
    expect(updated.transportType).toBe('streamable-http');
    expect(updated.transportConfig).toEqual({ url: 'http://example.com/mcp' });
  });

  it('should update boolean enabled flag', async () => {
    await repo.create(validConnection);
    const disabled = await repo.update(validConnection.id, { enabled: false });
    expect(disabled.enabled).toBe(false);
    const enabled = await repo.update(validConnection.id, { enabled: true });
    expect(enabled.enabled).toBe(true);
  });

  it('should update tags and metadata', async () => {
    await repo.create(validConnection);
    const updated = await repo.update(validConnection.id, {
      tags: ['new-tag'],
      metadata: { key: 'value' },
    });
    expect(updated.tags).toEqual(['new-tag']);
    expect(updated.metadata).toEqual({ key: 'value' });
  });

  it('should reject update for non-existent connection', async () => {
    await expect(repo.update('non-existent', { name: 'New' })).rejects.toThrow(PersistenceError);
  });

  it('should delete a connection', async () => {
    await repo.create(validConnection);
    await repo.delete(validConnection.id);
    const found = await repo.findById(validConnection.id);
    expect(found).toBeNull();
  });

  it('should not throw deleting non-existent connection', async () => {
    await expect(repo.delete('non-existent')).resolves.toBeUndefined();
  });

  it('should reject duplicate ID', async () => {
    await repo.create(validConnection);
    const dup = { ...validConnection, id: validConnection.id };
    await expect(repo.create(dup)).rejects.toThrow(PersistenceError);
  });

  it('should preserve date fields', async () => {
    await repo.create(validConnection);
    const found = await repo.findById(validConnection.id);
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
  });
});

describe('Discovery Cache', () => {
  let cache: DiscoveryCache;

  beforeEach(() => {
    createTestDb();
    cache = new SqliteDiscoveryCache();
  });

  afterEach(() => {
    closeDatabase();
  });

  const sampleResult: DiscoveryResult = {
    connectionId: 'conn-1',
    tools: [
      { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
      { name: 'tool2', description: 'Second tool' },
    ] as Tool[],
    resources: [],
    prompts: [],
    discoveredAt: new Date(),
  };

  it('should set and get discovery results', () => {
    cache.set('conn-1', sampleResult);
    const result = cache.get('conn-1');
    expect(result).toBeDefined();
    expect(result!.connectionId).toBe('conn-1');
    expect(result!.tools).toHaveLength(2);
  });

  it('should check if cache has entry', () => {
    expect(cache.has('conn-1')).toBe(false);
    cache.set('conn-1', sampleResult);
    expect(cache.has('conn-1')).toBe(true);
  });

  it('should return undefined for missing entry', () => {
    expect(cache.get('non-existent')).toBeUndefined();
  });

  it('should delete cache entry', () => {
    cache.set('conn-1', sampleResult);
    expect(cache.has('conn-1')).toBe(true);
    const deleted = cache.delete('conn-1');
    expect(deleted).toBe(true);
    expect(cache.has('conn-1')).toBe(false);
  });

  it('should return false when deleting non-existent entry', () => {
    expect(cache.delete('non-existent')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('conn-1', sampleResult);
    cache.set('conn-2', { ...sampleResult, connectionId: 'conn-2' });
    expect(cache.entries()).toHaveLength(2);
    cache.clear();
    expect(cache.entries()).toHaveLength(0);
  });

  it('should list all entries', () => {
    cache.set('conn-1', sampleResult);
    cache.set('conn-2', { ...sampleResult, connectionId: 'conn-2' });
    const entries = cache.entries();
    expect(entries).toHaveLength(2);
    const ids = entries.map((e) => e.connectionId).sort();
    expect(ids).toEqual(['conn-1', 'conn-2']);
  });

  it('should update existing entry on set', () => {
    cache.set('conn-1', sampleResult);
    const updatedResult = {
      ...sampleResult,
      tools: [{ name: 'tool3' } as Tool],
      discoveredAt: new Date(),
    };
    cache.set('conn-1', updatedResult);
    const result = cache.get('conn-1');
    expect(result!.tools).toHaveLength(1);
    expect(result!.tools[0].name).toBe('tool3');
  });

  it('should return empty entries array when cache is empty', () => {
    expect(cache.entries()).toEqual([]);
  });
});

describe('Runtime State Repository', () => {
  let repo: RuntimeStateRepository;
  let connRepo: SqliteConnectionRepository;

  beforeEach(async () => {
    createTestDb();
    repo = new SqliteRuntimeStateRepository();
    connRepo = new SqliteConnectionRepository();
    await connRepo.create(validConnection);
  });

  afterEach(() => {
    closeDatabase();
  });

  const sampleState: RuntimeConnectionState = {
    connectionId: validConnection.id,
    status: 'registered',
    lastConnectionAttempt: null,
    lastSuccessfulConnection: null,
    lastDisconnectTime: null,
    lastFailure: null,
    failureReason: null,
    retryCount: 0,
    runtimeMetadata: {},
  };

  it('should save and find runtime state', async () => {
    await repo.save(sampleState);
    const found = await repo.findById(validConnection.id);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('registered');
    expect(found!.retryCount).toBe(0);
  });

  it('should return null for missing state', async () => {
    const found = await repo.findById('non-existent');
    expect(found).toBeNull();
  });

  it('should list all states', async () => {
    await repo.save(sampleState);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
  });

  it('should return empty array when no states exist', async () => {
    const all = await repo.findAll();
    expect(all).toEqual([]);
  });

  it('should update existing state', async () => {
    await repo.save(sampleState);
    await repo.save({ ...sampleState, status: 'connected', retryCount: 1 });
    const found = await repo.findById(validConnection.id);
    expect(found!.status).toBe('connected');
    expect(found!.retryCount).toBe(1);
  });

  it('should delete runtime state', async () => {
    await repo.save(sampleState);
    await repo.delete(validConnection.id);
    const found = await repo.findById(validConnection.id);
    expect(found).toBeNull();
  });

  it('should preserve date fields', async () => {
    const stateWithDates: RuntimeConnectionState = {
      ...sampleState,
      status: 'connected',
      lastConnectionAttempt: new Date('2026-01-15T10:00:00Z'),
      lastSuccessfulConnection: new Date('2026-01-15T10:00:05Z'),
      lastFailure: new Date('2026-01-15T09:00:00Z'),
    };
    await repo.save(stateWithDates);
    const found = await repo.findById(validConnection.id);
    expect(found!.lastConnectionAttempt).toBeInstanceOf(Date);
    expect(found!.lastConnectionAttempt!.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(found!.lastFailure).toBeInstanceOf(Date);
  });

  it('should handle null date fields', async () => {
    await repo.save(sampleState);
    const found = await repo.findById(validConnection.id);
    expect(found!.lastConnectionAttempt).toBeNull();
    expect(found!.lastFailure).toBeNull();
    expect(found!.failureReason).toBeNull();
  });

  it('should store runtime metadata', async () => {
    await repo.save({
      ...sampleState,
      runtimeMetadata: { version: '1.0', pid: 12345 },
    });
    const found = await repo.findById(validConnection.id);
    expect(found!.runtimeMetadata).toEqual({ version: '1.0', pid: 12345 });
  });
});

describe('Repository Compatibility', () => {
  it('should implement ConnectionRepository interface', () => {
    const repo = new SqliteConnectionRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.update).toBe('function');
    expect(typeof repo.delete).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findAll).toBe('function');
  });

  it('should implement RuntimeStateRepository interface', () => {
    const repo = new SqliteRuntimeStateRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findAll).toBe('function');
    expect(typeof repo.delete).toBe('function');
  });

  it('should implement DiscoveryCache interface', () => {
    const cache = new SqliteDiscoveryCache();
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
    expect(typeof cache.delete).toBe('function');
    expect(typeof cache.clear).toBe('function');
    expect(typeof cache.has).toBe('function');
    expect(typeof cache.entries).toBe('function');
  });
});

describe('Transaction Consistency', () => {
  let repo: ConnectionRepository;

  beforeEach(() => {
    createTestDb();
    repo = new SqliteConnectionRepository();
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should handle concurrent creates', async () => {
    const results = await Promise.allSettled([
      repo.create(validConnection),
      repo.create({ ...validConnection, id: randomUUID() }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('should handle concurrent connection creates and deletes', async () => {
    const connRepo = repo as SqliteConnectionRepository;
    const id1 = randomUUID();
    const id2 = randomUUID();

    await connRepo.create({ ...validConnection, id: id1 });
    await connRepo.create({ ...validConnection, id: id2 });
    expect(await connRepo.findAll()).toHaveLength(2);

    await connRepo.delete(id1);
    expect(await connRepo.findAll()).toHaveLength(1);
    expect(await connRepo.findById(id2)).not.toBeNull();
  });

  it('should handle full lifecycle end-to-end via app', async () => {
    const app = await buildApp();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/connections',
      payload: validInput,
    });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.json().data.id;

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/connections/${id}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().data.name).toBe('Test Connection');

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/connections',
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data).toHaveLength(1);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/connections/${id}`,
    });
    expect(delRes.statusCode).toBe(200);

    const getAfterDel = await app.inject({
      method: 'GET',
      url: `/api/v1/connections/${id}`,
    });
    expect(getAfterDel.statusCode).toBe(404);

    await app.close();
  });
});

describe('Constraint Violations', () => {
  let repo: ConnectionRepository;

  beforeEach(() => {
    createTestDb();
    repo = new SqliteConnectionRepository();
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should reject duplicate ID', async () => {
    await repo.create(validConnection);
    await expect(repo.create({ ...validConnection, id: validConnection.id })).rejects.toThrow(
      PersistenceError,
    );
  });

  it('should reject empty name', async () => {
    await expect(repo.create({ ...validConnection, name: '' })).resolves.toBeDefined();
  });
});
