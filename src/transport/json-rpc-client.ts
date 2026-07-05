import { InternalError } from '../shared/errors/index.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: number;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export class JsonRpcError extends InternalError {
  public readonly rpcCode: number;
  public readonly rpcData?: unknown;

  constructor(rpcCode: number, message: string, rpcData?: unknown) {
    super(`JSON-RPC error [${rpcCode}]: ${message}`, { code: rpcCode, data: rpcData });
    this.name = 'JsonRpcError';
    this.rpcCode = rpcCode;
    this.rpcData = rpcData;
  }
}

export class JsonRpcTimeoutError extends InternalError {
  constructor(method: string, timeout: number) {
    super(`JSON-RPC request timed out after ${timeout}ms: ${method}`, { method, timeout });
    this.name = 'JsonRpcTimeoutError';
  }
}

export type OutgoingMessageHandler = (message: string) => void;

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

export class JsonRpcClient {
  private nextId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private readonly defaultTimeout: number;

  constructor(defaultTimeout = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  async request(
    method: string,
    params?: unknown,
    timeout?: number,
  ): Promise<JsonRpcSuccessResponse> {
    const id = this.nextId++;
    const requestTimeout = timeout ?? this.defaultTimeout;

    return new Promise<JsonRpcSuccessResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new JsonRpcTimeoutError(method, requestTimeout));
      }, requestTimeout);

      this.pendingRequests.set(id, {
        resolve: (response: JsonRpcResponse) => {
          clearTimeout(timer);
          resolve(response as JsonRpcSuccessResponse);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
        method,
      });

      this.sendMessage({ jsonrpc: '2.0', id, method, params });
    });
  }

  notification(method: string, params?: unknown): void {
    this.sendMessage({ jsonrpc: '2.0', method, params } as JsonRpcRequest);
  }

  handleData(data: string): void {
    const lines = data.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let messages: unknown[];
      try {
        const parsed = JSON.parse(trimmed);
        messages = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        continue;
      }

      for (const message of messages) {
        this.handleMessage(message);
      }
    }
  }

  close(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new InternalError(`JSON-RPC client closed before receiving response`, { id }));
    }
    this.pendingRequests.clear();
  }

  pendingCount(): number {
    return this.pendingRequests.size;
  }

  private sendMessage(request: JsonRpcRequest): void {
    const line = JSON.stringify(request) + '\n';
    this.messageHandler(line);
  }

  private handleMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) return;

    const msg = message as Record<string, unknown>;

    if (msg.jsonrpc !== '2.0') return;

    if (typeof msg.id === 'number' && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;

      if ('result' in msg) {
        pending.resolve(msg as unknown as JsonRpcSuccessResponse);
      } else if ('error' in msg) {
        const error = msg.error as { code: number; message: string; data?: unknown };
        pending.reject(new JsonRpcError(error.code, error.message, error.data));
      } else {
        pending.reject(
          new InternalError('Invalid JSON-RPC response: missing result and error', { msg }),
        );
      }

      this.pendingRequests.delete(msg.id);
    }
  }

  private messageHandler: OutgoingMessageHandler = () => {
    throw new InternalError('No message handler set on JsonRpcClient');
  };

  setMessageHandler(handler: OutgoingMessageHandler): void {
    this.messageHandler = handler;
  }
}
