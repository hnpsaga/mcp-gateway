import type { TransportType } from '../connections/transport-type.js';
import { TRANSPORT_TYPES } from '../connections/transport-type.js';
import { ValidationError } from '../shared/errors/index.js';
import { StdioTransport } from './stdio-transport.js';
import { StreamableHttpTransport } from './streamable-http-transport.js';
import type { Transport } from './transport.js';

export class TransportFactory {
  static createTransport(transportType: TransportType): Transport {
    switch (transportType) {
      case 'stdio':
        return new StdioTransport();
      case 'streamable-http':
        return new StreamableHttpTransport();
      default:
        throw new ValidationError(`Unsupported transport type: '${transportType}'`, {
          transportType,
          supportedTypes: [...TRANSPORT_TYPES],
        });
    }
  }
}
