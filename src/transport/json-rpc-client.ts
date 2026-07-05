import { InternalError, ValidationError } from '../shared/errors/index.js';

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

export class JsonRpcParseError extends InternalError {
  constructor(message: string, details?: unknown) {
    super(`JSON-RPC parse error: ${message}`, details);
    this.name = 'JsonRpcParseError';
  }
}

export class JsonRpcMessageTooLargeError extends ValidationError {
  constructor(size: number, maxSize: number) {
    super(`JSON-RPC message exceeds maximum size: ${size} bytes (max: ${maxSize} bytes)`, {
      size,
      maxSize,
    });
    this.name = 'JsonRpcMessageTooLargeError';
  }
}

export type OutgoingMessageHandler = (message: string) => void;
export type NotificationHandler = (method: string, params: unknown) => void;

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
  createdAt: number;
}

export interface JsonRpcClientConfig {
  defaultTimeout?: number;
  maxMessageSize?: number;
  maxPendingRequests?: number;
}

export class JsonRpcClient {
  private nextId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private readonly defaultTimeout: number;
  private readonly maxMessageSize: number;
  private readonly maxPendingRequests: number;
  private seenIds = new Set<number>();
  private totalBytesReceived = 0;
  private closed = false;
  private notificationHandler?: NotificationHandler;

  constructor(config?: number | JsonRpcClientConfig) {
    if (typeof config === 'number' || config === undefined) {
      this.defaultTimeout = config ?? 30000;
      this.maxMessageSize = 1048576;
      this.maxPendingRequests = 100;
    } else {
      this.defaultTimeout = config.defaultTimeout ?? 30000;
      this.maxMessageSize = config.maxMessageSize ?? 1048576;
      this.maxPendingRequests = config.maxPendingRequests ?? 100;
    }
  }

  setNotificationHandler(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  async request(
    method: string,
    params?: unknown,
    timeout?: number,
    abortSignal?: AbortSignal,
  ): Promise<JsonRpcSuccessResponse> {
    if (this.closed) {
      throw new InternalError('Cannot send request: JSON-RPC client is closed', { method });
    }

    if (this.pendingRequests.size >= this.maxPendingRequests) {
      throw new InternalError(
        `Too many pending requests: ${this.pendingRequests.size} (max: ${this.maxPendingRequests})`,
        { method, pendingCount: this.pendingRequests.size, maxPending: this.maxPendingRequests },
      );
    }

    const id = this.nextId++;
    const requestTimeout = timeout ?? this.defaultTimeout;

    let finalParams = params;
    if (['tools/call', 'resources/read', 'prompts/get', 'completion/complete'].includes(method)) {
      const progressToken = `progress-${id}`;
      const paramsObj = (params as Record<string, unknown>) ?? {};
      if (!paramsObj._meta) {
        finalParams = {
          ...paramsObj,
          _meta: {
            progressToken,
          },
        };
      }
    }

    return new Promise<JsonRpcSuccessResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.seenIds.delete(id);
        reject(new JsonRpcTimeoutError(method, requestTimeout));
      }, requestTimeout);

      let onAbort: (() => void) | undefined;

      if (abortSignal) {
        if (abortSignal.aborted) {
          clearTimeout(timer);
          reject(new Error('Request aborted'));
          return;
        }

        onAbort = () => {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          this.seenIds.delete(id);

          this.notification('notifications/cancelled', {
            requestId: id,
            reason: 'Request aborted by client',
          });

          reject(new Error('Request aborted'));
        };
        abortSignal.addEventListener('abort', onAbort);
      }

      this.pendingRequests.set(id, {
        resolve: (response: JsonRpcResponse) => {
          clearTimeout(timer);
          if (abortSignal && onAbort) {
            abortSignal.removeEventListener('abort', onAbort);
          }
          if ('result' in response) {
            resolve(response);
          } else {
            const err = response.error;
            reject(new JsonRpcError(err.code, err.message, err.data));
          }
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          if (abortSignal && onAbort) {
            abortSignal.removeEventListener('abort', onAbort);
          }
          reject(error);
        },
        timer,
        method,
        createdAt: Date.now(),
      });

      this.sendMessage({ jsonrpc: '2.0', id, method, params: finalParams });
    });
  }

  notification(method: string, params?: unknown): void {
    if (this.closed) return;
    const msg = { jsonrpc: '2.0' as const, method, params };
    this.sendMessage(msg as JsonRpcRequest);
  }

  handleData(data: string): void {
    const totalBytes = Buffer.byteLength(data, 'utf-8');
    this.totalBytesReceived += totalBytes;

    if (totalBytes > this.maxMessageSize) {
      return;
    }

    const lines = data.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (Buffer.byteLength(trimmed, 'utf-8') > this.maxMessageSize) {
        continue;
      }

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
    if (this.closed) return;
    this.closed = true;

    const error = new InternalError('JSON-RPC client closed before receiving response');
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
    this.seenIds.clear();
  }

  pendingCount(): number {
    return this.pendingRequests.size;
  }

  isClosed(): boolean {
    return this.closed;
  }

  resetStats(): void {
    this.totalBytesReceived = 0;
    this.seenIds.clear();
  }

  private sendMessage(request: JsonRpcRequest): void {
    const line = JSON.stringify(request) + '\n';
    this.messageHandler(line);
  }

  private handleMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) return;

    const msg = message as Record<string, unknown>;

    if (msg.jsonrpc !== '2.0') {
      const rawId = msg.id;
      if (typeof rawId === 'number' && this.pendingRequests.has(rawId)) {
        const pending = this.pendingRequests.get(rawId)!;
        pending.reject(new ValidationError('Invalid JSON-RPC version: expected "2.0"', msg));
        this.pendingRequests.delete(rawId);
      }
      return;
    }

    if (msg.id !== undefined && msg.id !== null && typeof msg.method === 'string') {
      const errorResponse: JsonRpcErrorResponse = {
        jsonrpc: '2.0',
        id: typeof msg.id === 'number' ? msg.id : 0,
        error: {
          code: -32601,
          message: `Method not found: ${msg.method}`,
        },
      };
      this.messageHandler(JSON.stringify(errorResponse) + '\n');
      return;
    }

    if ((msg.id === undefined || msg.id === null) && typeof msg.method === 'string') {
      this.notificationHandler?.(msg.method, msg.params);
      return;
    }

    if (typeof msg.id !== 'number') {
      return;
    }

    if (this.seenIds.has(msg.id)) {
      return;
    }

    if (this.pendingRequests.has(msg.id)) {
      this.seenIds.add(msg.id);
      const pending = this.pendingRequests.get(msg.id)!;

      if ('result' in msg) {
        pending.resolve(msg as unknown as JsonRpcSuccessResponse);
      } else if ('error' in msg) {
        const error = msg.error as { code: number; message: string; data?: unknown };
        pending.reject(new JsonRpcError(error.code, error.message, error.data));
      } else {
        pending.reject(
          new JsonRpcParseError('Invalid JSON-RPC response: missing result and error', { msg }),
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
