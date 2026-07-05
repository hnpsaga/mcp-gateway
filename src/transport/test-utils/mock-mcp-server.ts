import { createInterface } from 'node:readline';

type JsonRpcRequest = {
  jsonrpc: string;
  id?: number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export interface MockServerConfig {
  serverCapabilities?: Record<string, unknown>;
  protocolVersion?: string;
  tools?: Array<Record<string, unknown>>;
  resources?: Array<Record<string, unknown>>;
  prompts?: Array<Record<string, unknown>>;
  failMethods?: string[];
  crashOnMethod?: string;
  delayMs?: number;
}

export class MockMcpServer {
  private readonly config: MockServerConfig;
  private rl: ReturnType<typeof createInterface> | null = null;

  constructor(config: MockServerConfig = {}) {
    this.config = {
      serverCapabilities: { tools: true, resources: true, prompts: true },
      protocolVersion: '2024-11-05',
      tools: [
        {
          name: 'echo',
          description: 'Echo back the input',
          inputSchema: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
        {
          name: 'calculate',
          description: 'Perform a calculation',
          inputSchema: {
            type: 'object',
            properties: { expression: { type: 'string' } },
          },
        },
      ],
      resources: [
        {
          name: 'Config',
          uri: 'file:///data/config.json',
          description: 'Application configuration',
          mimeType: 'application/json',
        },
        {
          name: 'Settings',
          uri: 'file:///data/settings.json',
          description: 'User settings',
          mimeType: 'application/json',
        },
      ],
      prompts: [
        {
          name: 'analyze_code',
          description: 'Analyze source code',
          arguments: [{ name: 'language', description: 'Programming language', required: true }],
        },
      ],
      failMethods: [],
      ...config,
    };
  }

  start(): void {
    this.rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

    this.rl.on('line', (line: string) => {
      if (!line.trim()) return;

      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        this.sendResponse({
          jsonrpc: '2.0',
          id: 0,
          error: { code: -32700, message: 'Parse error' },
        });
        return;
      }

      if (request.jsonrpc !== '2.0') {
        if (request.id !== undefined) {
          this.sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' },
          });
        }
        return;
      }

      if (request.id === undefined) {
        return;
      }

      if (this.config.delayMs && this.config.delayMs > 0) {
        setTimeout(() => this.handleRequest(request), this.config.delayMs);
      } else {
        this.handleRequest(request);
      }
    });
  }

  private handleRequest(request: JsonRpcRequest): void {
    const id = request.id!;

    if (this.config.crashOnMethod && request.method === this.config.crashOnMethod) {
      process.exit(1);
    }

    if (this.config.failMethods?.includes(request.method)) {
      this.sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Method '${request.method}' failed intentionally` },
      });
      return;
    }

    switch (request.method) {
      case 'initialize':
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: this.config.protocolVersion,
            serverCapabilities: this.config.serverCapabilities,
            serverInfo: { name: 'mock-mcp-server', version: '1.0.0' },
          },
        });
        break;

      case 'notifications/initialized':
        break;

      case 'tools/list':
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          result: { tools: this.config.tools },
        });
        break;

      case 'tools/call':
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Executed ${(request.params as Record<string, unknown>)?.name ?? 'unknown'}`,
              },
            ],
          },
        });
        break;

      case 'resources/list':
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          result: { resources: this.config.resources },
        });
        break;

      case 'resources/read':
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri: (request.params as Record<string, unknown>)?.uri,
                text: 'Resource content',
                mimeType: 'application/json',
              },
            ],
          },
        });
        break;

      case 'prompts/list':
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          result: { prompts: this.config.prompts },
        });
        break;

      case 'prompts/get':
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            description: `Prompt: ${(request.params as Record<string, unknown>)?.name as string}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Prompt content',
                },
              },
            ],
          },
        });
        break;

      default:
        this.sendResponse({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        });
    }
  }

  private sendResponse(response: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

function main(): void {
  const config: MockServerConfig = {};

  const serverCapabilitiesStr = process.env.MOCK_SERVER_CAPABILITIES;
  if (serverCapabilitiesStr) {
    config.serverCapabilities = JSON.parse(serverCapabilitiesStr) as Record<string, unknown>;
  }

  const toolsStr = process.env.MOCK_SERVER_TOOLS;
  if (toolsStr) {
    config.tools = JSON.parse(toolsStr) as Array<Record<string, unknown>>;
  }

  const resourcesStr = process.env.MOCK_SERVER_RESOURCES;
  if (resourcesStr) {
    config.resources = JSON.parse(resourcesStr) as Array<Record<string, unknown>>;
  }

  const promptsStr = process.env.MOCK_SERVER_PROMPTS;
  if (promptsStr) {
    config.prompts = JSON.parse(promptsStr) as Array<Record<string, unknown>>;
  }

  const failMethodsStr = process.env.MOCK_SERVER_FAIL_METHODS;
  if (failMethodsStr) {
    config.failMethods = JSON.parse(failMethodsStr) as string[];
  }

  if (process.env.MOCK_SERVER_CRASH_METHOD) {
    config.crashOnMethod = process.env.MOCK_SERVER_CRASH_METHOD;
  }

  if (process.env.MOCK_SERVER_DELAY_MS) {
    config.delayMs = Number(process.env.MOCK_SERVER_DELAY_MS);
  }

  const server = new MockMcpServer(config);
  server.start();
}

if (
  process.argv[1]?.endsWith('mock-mcp-server.ts') ||
  process.argv[1]?.endsWith('mock-mcp-server.js')
) {
  main();
}
