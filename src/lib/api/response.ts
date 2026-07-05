import type { ErrorResponse } from '../../shared/response/error-response.js';
import type { PaginationMeta } from '../../shared/response/pagination.js';
import type { SuccessResponse } from '../../shared/response/success-response.js';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function createSuccessResponse<T>(data: T, meta?: PaginationMeta): SuccessResponse<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: unknown,
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}
