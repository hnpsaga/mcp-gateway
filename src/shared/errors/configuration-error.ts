import { AppError } from './app-error.js';

export class ConfigurationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}
