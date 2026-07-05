import { InternalError } from '../shared/errors/index.js';

export interface HttpClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface HttpClientResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export class HttpClientError extends InternalError {
  public readonly statusCode: number;
  public readonly responseBody: string;

  constructor(statusCode: number, message: string, responseBody: string) {
    super(message, { statusCode, responseBody });
    this.name = 'HttpClientError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class HttpClientTimeoutError extends InternalError {
  constructor(url: string, timeout: number) {
    super(`HTTP request timed out after ${timeout}ms: ${url}`, { url, timeout });
    this.name = 'HttpClientTimeoutError';
  }
}

export class HttpClient {
  private readonly defaults: Required<HttpClientConfig>;

  constructor(config: HttpClientConfig) {
    this.defaults = {
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
      headers: config.headers ?? {},
      timeout: config.timeout ?? 30000,
    };
  }

  async post(
    path: string,
    body: string,
    overrides?: { headers?: Record<string, string>; timeout?: number },
  ): Promise<HttpClientResult> {
    const url = `${this.defaults.baseUrl}${path}`;
    const timeout = overrides?.timeout ?? this.defaults.timeout;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaults.headers,
      ...(overrides?.headers ?? {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = await response.text();

      if (!response.ok) {
        throw new HttpClientError(
          response.status,
          `HTTP ${response.status}: ${response.statusText}`,
          responseBody,
        );
      }

      return {
        status: response.status,
        body: responseBody,
        headers: responseHeaders,
      };
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof HttpClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpClientTimeoutError(url, timeout);
      }

      throw new InternalError(`HTTP request failed: ${(error as Error).message}`, {
        url,
        method: 'POST',
      });
    }
  }
}
