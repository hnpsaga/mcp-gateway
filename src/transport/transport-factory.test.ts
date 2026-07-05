import { describe, expect, it } from 'vitest';

import { ValidationError } from '../shared/errors/index.js';
import { StdioTransport } from './stdio-transport.js';
import { StreamableHttpTransport } from './streamable-http-transport.js';
import { TransportFactory } from './transport-factory.js';

describe('TransportFactory', () => {
  it('should create StdioTransport for stdio type', () => {
    const transport = TransportFactory.createTransport('stdio');
    expect(transport).toBeInstanceOf(StdioTransport);
  });

  it('should create StreamableHttpTransport for streamable-http type', () => {
    const transport = TransportFactory.createTransport('streamable-http');
    expect(transport).toBeInstanceOf(StreamableHttpTransport);
  });

  it('should return Transport interface for stdio', () => {
    const transport = TransportFactory.createTransport('stdio');
    expect(transport.connect).toBeInstanceOf(Function);
    expect(transport.disconnect).toBeInstanceOf(Function);
    expect(transport.getStatus).toBeInstanceOf(Function);
    expect(transport.supportsCapability).toBeInstanceOf(Function);
  });

  it('should return Transport interface for streamable-http', () => {
    const transport = TransportFactory.createTransport('streamable-http');
    expect(transport.connect).toBeInstanceOf(Function);
    expect(transport.disconnect).toBeInstanceOf(Function);
    expect(transport.getStatus).toBeInstanceOf(Function);
    expect(transport.supportsCapability).toBeInstanceOf(Function);
  });

  it('should return a new instance on each call', () => {
    const transport1 = TransportFactory.createTransport('stdio');
    const transport2 = TransportFactory.createTransport('stdio');
    expect(transport1).not.toBe(transport2);
  });

  it('should throw ValidationError for unsupported transport type', () => {
    expect(() => TransportFactory.createTransport('unknown' as never)).toThrow(ValidationError);
  });

  it('should include supported types in error details for unsupported type', () => {
    try {
      TransportFactory.createTransport('unknown' as never);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (error instanceof ValidationError) {
        expect(error.details).toMatchObject({
          transportType: 'unknown',
          supportedTypes: ['stdio', 'streamable-http'],
        });
      }
    }
  });

  it('should throw descriptive error message for unsupported type', () => {
    expect(() => TransportFactory.createTransport('nonsense' as never)).toThrow(
      "Unsupported transport type: 'nonsense'",
    );
  });
});
