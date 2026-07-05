import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/persistence/schema.ts',
  out: './src/persistence/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/mcp-gateway.db',
  },
});
