import { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from './app.js';
import { startServer } from './server.js';

describe('server creation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should start the server on correct host and port', async () => {
    const listenSpy = vi.spyOn(app, 'listen').mockResolvedValue(undefined as unknown as void);
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation((_event, _listener) => process);

    await startServer(app);

    expect(listenSpy).toHaveBeenCalled();
    processOnSpy.mockRestore();
  });

  it('should exit process if server start fails', async () => {
    const listenSpy = vi.spyOn(app, 'listen').mockRejectedValue(new Error('Address in use'));
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation((_event, _listener) => process);
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as (code?: string | number | null) => never);

    await startServer(app);

    expect(listenSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
