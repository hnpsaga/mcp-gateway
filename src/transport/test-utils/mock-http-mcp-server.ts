import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export interface MockHttpServerConfig {
  serverCapabilities?: Record<string, unknown>;
  protocolVersion?: string;
  tools?: Array<Record<string, unknown>>;
  resources?: Array<Record<string, unknown>>;
  prompts?: Array<Record<string, unknown>>;
  failMethods?: string[];
  delayMs?: number;
  failAllRequests?: boolean;
}

export class MockHttpMcpServer {
  private server: Server | null = null;
  private readonly config: MockHttpServerConfig;
  private _port: number = 0;

  constructor(config: MockHttpServerConfig = {}) {
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

  get port(): number {
    return this._port;
  }

  get url(): string {
    return `http://localhost:${this._port}`;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        this.server = null;
        resolve();
      });
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf-8');
    });

    req.on('end', () => {
      if (this.config.failAllRequests) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }

      let request: { jsonrpc?: string; id?: number; method?: string; params?: unknown };

      try {
        request = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }),
        );
        return;
      }

      if (request.jsonrpc !== '2.0') {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: { code: -32600, message: 'Invalid Request' },
          }),
        );
        return;
      }

      if (!request.method) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: { code: -32600, message: 'Invalid Request: method required' },
          }),
        );
        return;
      }

      if (this.config.delayMs && this.config.delayMs > 0) {
        setTimeout(() => this.sendResponse(res, request), this.config.delayMs);
      } else {
        this.sendResponse(res, request);
      }
    });
  }

  private sendResponse(
    res: ServerResponse,
    request: { jsonrpc?: string; id?: number; method?: string; params?: unknown },
  ): void {
    const id = request.id ?? null;

    if (id === null) {
      res.statusCode = 202;
      res.end('{}');
      return;
    }

    if (this.config.failMethods?.includes(request.method ?? '')) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: `Method '${request.method}' failed intentionally` },
        }),
      );
      return;
    }

    switch (request.method) {
      case 'initialize':
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: this.config.protocolVersion,
              serverCapabilities: this.config.serverCapabilities,
              serverInfo: { name: 'mock-http-mcp-server', version: '1.0.0' },
            },
          }),
        );
        break;

      case 'notifications/initialized':
        res.statusCode = 202;
        res.end('{}');
        break;

      case 'tools/list':
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { tools: this.config.tools },
          }),
        );
        break;

      case 'tools/call':
        res.statusCode = 200;
        res.end(
          JSON.stringify({
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
          }),
        );
        break;

      case 'resources/list':
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { resources: this.config.resources },
          }),
        );
        break;

      case 'resources/read':
        res.statusCode = 200;
        res.end(
          JSON.stringify({
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
          }),
        );
        break;

      case 'prompts/list':
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { prompts: this.config.prompts },
          }),
        );
        break;

      case 'prompts/get':
        res.statusCode = 200;
        res.end(
          JSON.stringify({
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
          }),
        );
        break;

      default:
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          }),
        );
    }
  }
}
