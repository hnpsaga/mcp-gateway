import { beforeEach, describe, expect, it } from 'vitest';

import { StdioTransport } from './stdio-transport.js';
import { StreamableHttpTransport } from './streamable-http-transport.js';

describe('StdioTransport', () => {
  let transport: StdioTransport;

  beforeEach(() => {
    transport = new StdioTransport();
  });

  it('should return successful connect result', async () => {
    const result = await transport.connect('conn-1');

    expect(result.success).toBe(true);
    expect(result.connectionId).toBe('conn-1');
    expect(result.status).toBe('connected');
    expect(result.error).toBeUndefined();
  });

  it('should return successful disconnect result', async () => {
    const result = await transport.disconnect('conn-1');

    expect(result.success).toBe(true);
    expect(result.connectionId).toBe('conn-1');
    expect(result.status).toBe('disconnected');
    expect(result.error).toBeUndefined();
  });

  it('should return connected status from getStatus', async () => {
    const result = await transport.getStatus('conn-1');

    expect(result.connectionId).toBe('conn-1');
    expect(result.status).toBe('connected');
    expect(result.details).toBeUndefined();
  });

  it('should discover capabilities with tools, resources, and prompts', async () => {
    const result = await transport.discoverCapabilities('conn-1');

    expect(result.success).toBe(true);
    expect(result.connectionId).toBe('conn-1');
    expect(result.capabilities).toBeDefined();
    expect(result.capabilities!.tools).toHaveLength(2);
    expect(result.capabilities!.resources).toHaveLength(2);
    expect(result.capabilities!.prompts).toHaveLength(2);
    expect(result.capabilities!.tools[0].name).toBe('calculate');
    expect(result.capabilities!.resources[0].name).toBe('Config');
    expect(result.capabilities!.prompts[0].name).toBe('analyze_code');
  });

  it('should support stdio capability', () => {
    expect(transport.supportsCapability('stdio')).toBe(true);
  });

  it('should support basic capabilities', () => {
    expect(transport.supportsCapability('connect')).toBe(true);
    expect(transport.supportsCapability('disconnect')).toBe(true);
    expect(transport.supportsCapability('status')).toBe(true);
  });

  it('should support discover-capabilities capability', () => {
    expect(transport.supportsCapability('discover-capabilities')).toBe(true);
  });

  it('should not support unknown capabilities', () => {
    expect(transport.supportsCapability('tool-discovery')).toBe(false);
    expect(transport.supportsCapability('execution')).toBe(false);
    expect(transport.supportsCapability('unknown')).toBe(false);
  });

  it('should handle multiple connection IDs independently', async () => {
    const result1 = await transport.connect('conn-a');
    const result2 = await transport.connect('conn-b');

    expect(result1.connectionId).toBe('conn-a');
    expect(result2.connectionId).toBe('conn-b');
  });
});

describe('StreamableHttpTransport', () => {
  let transport: StreamableHttpTransport;

  beforeEach(() => {
    transport = new StreamableHttpTransport();
  });

  it('should return successful connect result', async () => {
    const result = await transport.connect('conn-1');

    expect(result.success).toBe(true);
    expect(result.connectionId).toBe('conn-1');
    expect(result.status).toBe('connected');
    expect(result.error).toBeUndefined();
  });

  it('should return successful disconnect result', async () => {
    const result = await transport.disconnect('conn-1');

    expect(result.success).toBe(true);
    expect(result.connectionId).toBe('conn-1');
    expect(result.status).toBe('disconnected');
    expect(result.error).toBeUndefined();
  });

  it('should return connected status from getStatus', async () => {
    const result = await transport.getStatus('conn-1');

    expect(result.connectionId).toBe('conn-1');
    expect(result.status).toBe('connected');
  });

  it('should discover capabilities with tools, resources, and prompts', async () => {
    const result = await transport.discoverCapabilities('conn-1');

    expect(result.success).toBe(true);
    expect(result.connectionId).toBe('conn-1');
    expect(result.capabilities).toBeDefined();
    expect(result.capabilities!.tools).toHaveLength(2);
    expect(result.capabilities!.resources).toHaveLength(2);
    expect(result.capabilities!.prompts).toHaveLength(2);
    expect(result.capabilities!.tools[0].name).toBe('get_weather');
    expect(result.capabilities!.resources[0].name).toBe('Weather API');
    expect(result.capabilities!.prompts[0].name).toBe('summarize');
  });

  it('should support streamable-http capability', () => {
    expect(transport.supportsCapability('streamable-http')).toBe(true);
  });

  it('should support basic capabilities', () => {
    expect(transport.supportsCapability('connect')).toBe(true);
    expect(transport.supportsCapability('disconnect')).toBe(true);
    expect(transport.supportsCapability('status')).toBe(true);
  });

  it('should support discover-capabilities capability', () => {
    expect(transport.supportsCapability('discover-capabilities')).toBe(true);
  });

  it('should not support unknown capabilities', () => {
    expect(transport.supportsCapability('stdio')).toBe(false);
    expect(transport.supportsCapability('tool-execution')).toBe(false);
    expect(transport.supportsCapability('unknown')).toBe(false);
  });

  it('should handle connection IDs with special characters', async () => {
    const result = await transport.connect('conn-with-special_chars@123');
    expect(result.connectionId).toBe('conn-with-special_chars@123');
  });
});
