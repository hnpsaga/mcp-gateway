import { AppError } from './app-error.js';

export class InternalError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'INTERNAL_ERROR', details);
    this.name = 'InternalError';
  }
}
