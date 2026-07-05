import { AppError } from '../shared/errors/app-error.js';

export class PersistenceError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'PERSISTENCE_ERROR', details);
    this.name = 'PersistenceError';
  }
}
