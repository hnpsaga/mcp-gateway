import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InternalError } from '../shared/errors/index.js';
import { JsonRpcClient, JsonRpcError, JsonRpcTimeoutError } from './json-rpc-client.js';

describe('JsonRpcClient', () => {
  let client: JsonRpcClient;
  let outgoingMessages: string[];

  beforeEach(() => {
    client = new JsonRpcClient(1000);
    outgoingMessages = [];
    client.setMessageHandler((message: string) => {
      outgoingMessages.push(message);
    });
  });

  describe('request', () => {
    it('should send a JSON-RPC request with correct structure', async () => {
      const responsePromise = client.request('test.method', { key: 'value' });

      expect(outgoingMessages).toHaveLength(1);
      const sent = JSON.parse(outgoingMessages[0]);
      expect(sent.jsonrpc).toBe('2.0');
      expect(sent.method).toBe('test.method');
      expect(sent.params).toEqual({ key: 'value' });
      expect(typeof sent.id).toBe('number');

      client.handleData(JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { success: true } }));

      const response = await responsePromise;
      expect(response.result).toEqual({ success: true });
    });

    it('should increment request IDs', async () => {
      client.request('method1');
      client.request('method2');

      const msg1 = JSON.parse(outgoingMessages[0]);
      const msg2 = JSON.parse(outgoingMessages[1]);
      expect(msg2.id).toBe(msg1.id + 1);
    });

    it('should correlate responses to the correct request', async () => {
      const promise1 = client.request('first');
      const id1 = JSON.parse(outgoingMessages[0]).id;

      const promise2 = client.request('second');
      const id2 = JSON.parse(outgoingMessages[1]).id;

      client.handleData(
        JSON.stringify({ jsonrpc: '2.0', id: id2, result: { data: 'second response' } }),
      );
      client.handleData(
        JSON.stringify({ jsonrpc: '2.0', id: id1, result: { data: 'first response' } }),
      );

      const result1 = await promise1;
      const result2 = await promise2;

      expect(result1.result).toEqual({ data: 'first response' });
      expect(result2.result).toEqual({ data: 'second response' });
    });

    it('should reject with JsonRpcError on protocol error response', async () => {
      const promise = client.request('failing.method');

      const id = JSON.parse(outgoingMessages[0]).id;
      client.handleData(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found' },
        }),
      );

      await expect(promise).rejects.toThrow(JsonRpcError);
      await expect(promise).rejects.toThrow('Method not found');
    });

    it('should include error code in JsonRpcError', async () => {
      try {
        const promise = client.request('test');
        const id = JSON.parse(outgoingMessages[0]).id;
        client.handleData(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: 'Internal error', data: { detail: 'fail' } },
          }),
        );
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonRpcError);
        if (error instanceof JsonRpcError) {
          expect(error.rpcCode).toBe(-32603);
          expect(error.rpcData).toEqual({ detail: 'fail' });
        }
      }
    });

    it('should reject with timeout when no response received', async () => {
      await expect(client.request('timeout.method', undefined, 50)).rejects.toThrow(
        JsonRpcTimeoutError,
      );
    });

    it('should reject with timeout error message containing method and timeout', async () => {
      try {
        await client.request('slow.method', undefined, 50);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonRpcTimeoutError);
        if (error instanceof JsonRpcTimeoutError) {
          expect(error.message).toContain('slow.method');
          expect(error.message).toContain('50ms');
        }
      }
    });

    it('should support concurrent requests', async () => {
      const promise1 = client.request('req1');
      const id1 = JSON.parse(outgoingMessages[0]).id;

      const promise2 = client.request('req2');
      const id2 = JSON.parse(outgoingMessages[1]).id;

      const promise3 = client.request('req3');
      const id3 = JSON.parse(outgoingMessages[2]).id;

      client.handleData(JSON.stringify({ jsonrpc: '2.0', id: id1, result: { seq: 1 } }));
      client.handleData(JSON.stringify({ jsonrpc: '2.0', id: id2, result: { seq: 2 } }));
      client.handleData(JSON.stringify({ jsonrpc: '2.0', id: id3, result: { seq: 3 } }));

      const results = await Promise.all([promise1, promise2, promise3]);
      expect(results.map((r) => r.result)).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
    });
  });

  describe('notification', () => {
    it('should send a JSON-RPC notification without an id', async () => {
      client.notification('notifications/initialized', { ready: true });

      expect(outgoingMessages).toHaveLength(1);
      const sent = JSON.parse(outgoingMessages[0]);
      expect(sent.jsonrpc).toBe('2.0');
      expect(sent.method).toBe('notifications/initialized');
      expect(sent.params).toEqual({ ready: true });
      expect(sent.id).toBeUndefined();
    });

    it('should not expect a response for notifications', () => {
      client.notification('notifications/test');
      expect(outgoingMessages).toHaveLength(1);
    });
  });

  describe('handleData', () => {
    it('should handle multiple JSON messages separated by newlines', async () => {
      const promise1 = client.request('first');
      const id1 = JSON.parse(outgoingMessages[0]).id;

      const promise2 = client.request('second');
      const id2 = JSON.parse(outgoingMessages[1]).id;

      const batch = [
        JSON.stringify({ jsonrpc: '2.0', id: id1, result: { msg: 'first' } }),
        JSON.stringify({ jsonrpc: '2.0', id: id2, result: { msg: 'second' } }),
      ].join('\n');

      client.handleData(batch);

      const r1 = await promise1;
      const r2 = await promise2;
      expect(r1.result).toEqual({ msg: 'first' });
      expect(r2.result).toEqual({ msg: 'second' });
    });

    it('should handle a JSON-RPC batch array', async () => {
      const promise1 = client.request('a');
      const id1 = JSON.parse(outgoingMessages[0]).id;

      const promise2 = client.request('b');
      const id2 = JSON.parse(outgoingMessages[1]).id;

      client.handleData(
        JSON.stringify([
          { jsonrpc: '2.0', id: id1, result: { letter: 'A' } },
          { jsonrpc: '2.0', id: id2, result: { letter: 'B' } },
        ]),
      );

      const r1 = await promise1;
      const r2 = await promise2;
      expect(r1.result).toEqual({ letter: 'A' });
      expect(r2.result).toEqual({ letter: 'B' });
    });

    it('should ignore invalid JSON without throwing', () => {
      expect(() => client.handleData('not json')).not.toThrow();
    });

    it('should ignore non-JSON-RPC messages', () => {
      expect(() => client.handleData(JSON.stringify({ hello: 'world' }))).not.toThrow();
    });

    it('should ignore responses with unknown IDs', () => {
      expect(() =>
        client.handleData(JSON.stringify({ jsonrpc: '2.0', id: 999, result: {} })),
      ).not.toThrow();
    });
  });

  describe('close', () => {
    it('should reject all pending requests', async () => {
      const promise1 = client.request('req1');
      const promise2 = client.request('req2');

      client.close();

      const results = await Promise.allSettled([promise1, promise2]);
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('rejected');
      if (results[0].status === 'rejected') {
        expect(results[0].reason).toBeInstanceOf(InternalError);
      }
      if (results[1].status === 'rejected') {
        expect(results[1].reason).toBeInstanceOf(InternalError);
      }
    });

    it('should clear pending requests', () => {
      client.request('req').catch(() => {});
      client.close();

      expect(client.pendingCount()).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      client.close();
      client.close();
      expect(client.pendingCount()).toBe(0);
    });
  });

  describe('pendingCount', () => {
    it('should return the number of pending requests', () => {
      expect(client.pendingCount()).toBe(0);

      client.request('a');
      expect(client.pendingCount()).toBe(1);

      client.request('b');
      expect(client.pendingCount()).toBe(2);
    });
  });

  describe('message handler', () => {
    it('should throw when sending without a message handler', () => {
      const bareClient = new JsonRpcClient();
      expect(() => bareClient.request('test')).rejects.toThrow();
    });
  });

  describe('setMessageHandler', () => {
    it('should replace the outgoing message handler', () => {
      const messages: string[] = [];
      const handler = vi.fn((msg: string) => {
        messages.push(msg);
      });

      const c = new JsonRpcClient();
      c.setMessageHandler(handler);
      c.notification('test');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(JSON.parse(messages[0]).method).toBe('test');
    });
  });
});
