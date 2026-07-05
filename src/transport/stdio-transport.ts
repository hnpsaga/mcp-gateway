import { BaseTransport } from './base-transport.js';

export class StdioTransport extends BaseTransport {
  supportsCapability(capability: string): boolean {
    if (capability === 'stdio') return true;
    return super.supportsCapability(capability);
  }
}
