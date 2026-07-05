import { BaseTransport } from './base-transport.js';

export class StreamableHttpTransport extends BaseTransport {
  supportsCapability(capability: string): boolean {
    if (capability === 'streamable-http') return true;
    return super.supportsCapability(capability);
  }
}
