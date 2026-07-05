import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { CreateConnectionInput } from '../connections/connection.js';
import { ConnectionRegistry } from '../connections/connection-registry.js';
import { InMemoryConnectionRepository } from '../connections/in-memory-connection-repository.js';
import { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { InMemoryDiscoveryCache } from '../discovery/in-memory-discovery-cache.js';
import { ExecutionEngine } from '../execution/execution-engine.js';
import { StdioTransport } from './stdio-transport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mockServerPath = join(__dirname, 'test-utils', 'mock-mcp-server.ts');

async function createConnectedEnvironment() {
  const connectionRepository = new InMemoryConnectionRepository();
  const connectionRegistry = new ConnectionRegistry(connectionRepository);

  const input: CreateConnectionInput = {
    name: 'Mock MCP Server',
    transportType: 'stdio',
    transportConfig: {
      command: 'npx',
      args: ['tsx', mockServerPath],
    },
  };

  const connection = await connectionRegistry.register(input);
  const transport = new StdioTransport(connectionRegistry);
  const cache = new InMemoryDiscoveryCache();
  const discoveryEngine = new DiscoveryEngine(connectionRegistry, transport, cache);
  const executionEngine = new ExecutionEngine(connectionRegistry, discoveryEngine, transport);

  const connectResult = await transport.connect(connection.id);
  if (!connectResult.success) {
    throw new Error(`Failed to connect: ${connectResult.error}`);
  }

  return {
    connectionRegistry,
    connection,
    transport,
    discoveryEngine,
    executionEngine,
    cache,
    connectionId: connection.id,
  };
}

describe('Discovery integration with real StdioTransport', () => {
  it('should discover tools from a real MCP server', async () => {
    const env = await createConnectedEnvironment();

    const result = await env.discoveryEngine.discover(env.connectionId);

    expect(result.connectionId).toBe(env.connectionId);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.some((t) => t.name === 'echo')).toBe(true);
    expect(result.tools.some((t) => t.name === 'calculate')).toBe(true);
    expect(result.discoveredAt).toBeInstanceOf(Date);

    await env.transport.disconnect(env.connectionId);
  });

  it('should discover resources from a real MCP server', async () => {
    const env = await createConnectedEnvironment();

    const result = await env.discoveryEngine.discover(env.connectionId);

    expect(result.resources.length).toBeGreaterThan(0);
    expect(result.resources.some((r) => r.name === 'Config')).toBe(true);
    expect(result.resources.some((r) => r.name === 'Settings')).toBe(true);

    const config = result.resources.find((r) => r.name === 'Config');
    expect(config!.uri).toBe('file:///data/config.json');
    expect(config!.mimeType).toBe('application/json');

    await env.transport.disconnect(env.connectionId);
  });

  it('should discover prompts from a real MCP server', async () => {
    const env = await createConnectedEnvironment();

    const result = await env.discoveryEngine.discover(env.connectionId);

    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.prompts.some((p) => p.name === 'analyze_code')).toBe(true);

    const prompt = result.prompts.find((p) => p.name === 'analyze_code');
    expect(prompt!.arguments).toHaveLength(1);
    expect(prompt!.arguments![0].name).toBe('language');
    expect(prompt!.arguments![0].required).toBe(true);

    await env.transport.disconnect(env.connectionId);
  });

  it('should cache discovery results', async () => {
    const env = await createConnectedEnvironment();

    await env.discoveryEngine.discover(env.connectionId);
    const cached = env.discoveryEngine.getCached(env.connectionId);

    expect(cached.connectionId).toBe(env.connectionId);
    expect(cached.tools.length).toBeGreaterThan(0);

    await env.transport.disconnect(env.connectionId);
  });

  it('should refresh discovery results', async () => {
    const env = await createConnectedEnvironment();

    const first = await env.discoveryEngine.discover(env.connectionId);
    const firstTimestamp = first.discoveredAt.getTime();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const refreshed = await env.discoveryEngine.refresh(env.connectionId);

    expect(refreshed.discoveredAt.getTime()).toBeGreaterThan(firstTimestamp);
    expect(refreshed.tools).toEqual(first.tools);

    await env.transport.disconnect(env.connectionId);
  });
});

describe('Execution integration with real StdioTransport', () => {
  it('should execute a tool successfully through the execution engine', async () => {
    const env = await createConnectedEnvironment();

    await env.discoveryEngine.discover(env.connectionId);

    const response = await env.executionEngine.executeTool({
      connectionId: env.connectionId,
      toolName: 'echo',
      arguments: { message: 'hello world' },
    });

    expect(response.status).toBe('success');
    expect(response.toolName).toBe('echo');
    expect(response.connectionId).toBe(env.connectionId);
    expect(response.requestedAt).toBeInstanceOf(Date);
    expect(response.executedAt).toBeInstanceOf(Date);
    expect(response.result).toBeDefined();

    await env.transport.disconnect(env.connectionId);
  });

  it('should read a resource successfully through the execution engine', async () => {
    const env = await createConnectedEnvironment();

    await env.discoveryEngine.discover(env.connectionId);

    const response = await env.executionEngine.readResource({
      connectionId: env.connectionId,
      resourceName: 'Config',
    });

    expect(response.status).toBe('success');
    expect(response.resourceName).toBe('Config');
    expect(response.contents).toBeDefined();

    await env.transport.disconnect(env.connectionId);
  });

  it('should execute a prompt successfully through the execution engine', async () => {
    const env = await createConnectedEnvironment();

    await env.discoveryEngine.discover(env.connectionId);

    const response = await env.executionEngine.executePrompt({
      connectionId: env.connectionId,
      promptName: 'analyze_code',
      arguments: { language: 'typescript' },
    });

    expect(response.status).toBe('success');
    expect(response.promptName).toBe('analyze_code');
    expect(response.result).toBeDefined();

    await env.transport.disconnect(env.connectionId);
  });

  it('should fail execution for unknown tool', async () => {
    const env = await createConnectedEnvironment();

    await env.discoveryEngine.discover(env.connectionId);

    await expect(
      env.executionEngine.executeTool({
        connectionId: env.connectionId,
        toolName: 'nonexistent_tool',
        arguments: {},
      }),
    ).rejects.toThrow('not found');

    await env.transport.disconnect(env.connectionId);
  });

  it('should fail execution when discovery has not been run', async () => {
    const env = await createConnectedEnvironment();

    await expect(
      env.executionEngine.executeTool({
        connectionId: env.connectionId,
        toolName: 'echo',
        arguments: {},
      }),
    ).rejects.toThrow('No cached discovery results found');

    await env.transport.disconnect(env.connectionId);
  });

  it('should return error when transport execution fails', async () => {
    const connectionRepository = new InMemoryConnectionRepository();
    const connectionRegistry = new ConnectionRegistry(connectionRepository);

    const input: CreateConnectionInput = {
      name: 'Failing Server',
      transportType: 'stdio',
      transportConfig: {
        command: 'npx',
        args: ['tsx', mockServerPath],
        env: { MOCK_SERVER_FAIL_METHODS: JSON.stringify(['tools/call']) },
      },
    };

    const connection = await connectionRegistry.register(input);
    const transport = new StdioTransport(connectionRegistry);
    const cache = new InMemoryDiscoveryCache();
    const discoveryEngine = new DiscoveryEngine(connectionRegistry, transport, cache);
    const executionEngine = new ExecutionEngine(connectionRegistry, discoveryEngine, transport);

    await transport.connect(connection.id);
    await discoveryEngine.discover(connection.id);

    const response = await executionEngine.executeTool({
      connectionId: connection.id,
      toolName: 'echo',
      arguments: { message: 'test' },
    });

    expect(response.status).toBe('error');
    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe('EXECUTION_ERROR');

    await transport.disconnect(connection.id);
  });
});
