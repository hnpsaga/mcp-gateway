import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const connectionsTable = sqliteTable('connections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  transport_type: text('transport_type').notNull(),
  transport_config: text('transport_config').notNull().default('{}'),
  enabled: integer('enabled').notNull().default(1),
  tags: text('tags').notNull().default('[]'),
  metadata: text('metadata').notNull().default('{}'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const discoveryCacheTable = sqliteTable('discovery_cache', {
  connection_id: text('connection_id').primaryKey(),
  discovered_at: text('discovered_at').notNull(),
  tools: text('tools').notNull().default('[]'),
  resources: text('resources').notNull().default('[]'),
  prompts: text('prompts').notNull().default('[]'),
});

export const runtimeStateTable = sqliteTable('runtime_state', {
  connection_id: text('connection_id').primaryKey(),
  status: text('status').notNull(),
  last_connection_attempt: text('last_connection_attempt'),
  last_successful_connection: text('last_successful_connection'),
  last_disconnect_time: text('last_disconnect_time'),
  last_failure: text('last_failure'),
  failure_reason: text('failure_reason'),
  retry_count: integer('retry_count').notNull().default(0),
  runtime_metadata: text('runtime_metadata').notNull().default('{}'),
});
