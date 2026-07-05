import { timingSafeEqual } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { UnauthorizedError } from './auth-error.js';

export interface AuthMiddlewareOptions {
  enabled: boolean;
  apiKeys: string[];
  headerName: string;
  bearerEnabled: boolean;
  swaggerAuthenticate: boolean;
}

const PUBLIC_PATHS = ['/health', '/api/v1/health'];

export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

function extractApiKey(
  request: FastifyRequest,
  headerName: string,
  bearerEnabled: boolean,
): string | null {
  const key = request.headers[headerName.toLowerCase()] as string | undefined;
  if (key) return key;

  if (bearerEnabled) {
    const authHeader = request.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
  }

  return null;
}

function isPublicPath(url: string): boolean {
  return PUBLIC_PATHS.some((path) => url === path);
}

function isSwaggerPath(url: string): boolean {
  return url.startsWith('/documentation');
}

export function createAuthHook(options: AuthMiddlewareOptions) {
  return async function authHook(request: FastifyRequest, _reply: FastifyReply) {
    if (!options.enabled) return;

    const url = request.url;

    if (isPublicPath(url)) return;

    if (isSwaggerPath(url) && !options.swaggerAuthenticate) return;

    const key = extractApiKey(request, options.headerName, options.bearerEnabled);

    if (!key) {
      throw new UnauthorizedError('Missing API key');
    }

    const isValid = options.apiKeys.some((validKey) => constantTimeCompare(key, validKey));

    if (!isValid) {
      throw new UnauthorizedError('Invalid API key');
    }
  };
}
