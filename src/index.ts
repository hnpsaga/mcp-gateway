import { initializeTracing } from './shared/observability/index.js';
initializeTracing();

import { buildApp } from './app.js';
import { startServer } from './server.js';

async function main() {
  const app = await buildApp();
  await startServer(app);
}

main().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
