import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { Config } from '../config/index.js';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;
let isMemoryDatabase = false;

export interface DatabaseConfig {
  path: string;
  filename: string;
  walMode: boolean;
  busyTimeout: number;
}

export function buildDatabaseConfig(config: Config): DatabaseConfig {
  return {
    path: config.DATABASE_PATH,
    filename: config.DATABASE_FILENAME,
    walMode: config.DATABASE_WAL_MODE,
    busyTimeout: config.DATABASE_BUSY_TIMEOUT,
  };
}

export function getDatabasePath(dbConfig: DatabaseConfig): string {
  if (dbConfig.path === ':memory:') {
    return ':memory:';
  }
  return path.join(dbConfig.path, dbConfig.filename);
}

export function initializeDatabase(dbConfig: DatabaseConfig): ReturnType<typeof drizzle> {
  const dbPath = getDatabasePath(dbConfig);

  isMemoryDatabase = dbPath === ':memory:';

  if (!isMemoryDatabase) {
    mkdirSync(dbConfig.path, { recursive: true });
  }

  const sqlite = new Database(dbPath);

  if (!isMemoryDatabase) {
    sqlite.pragma(`journal_mode = ${dbConfig.walMode ? 'wal' : 'delete'}`);
    sqlite.pragma(`busy_timeout = ${dbConfig.busyTimeout}`);
  }

  const db = drizzle(sqlite);

  sqliteInstance = sqlite;
  dbInstance = db;

  return db;
}

export function runMigrations(db: ReturnType<typeof drizzle>): void {
  migrate(db, {
    migrationsFolder: path.join(import.meta.dirname, 'migrations'),
  });
}

export function getDatabase(): ReturnType<typeof drizzle> {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
    isMemoryDatabase = false;
  }
}

export function withTransaction<T>(fn: () => T): T {
  const db = getDatabase();
  return db.transaction(fn);
}
