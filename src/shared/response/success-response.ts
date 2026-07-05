import type { PaginationMeta } from './pagination.js';

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}
