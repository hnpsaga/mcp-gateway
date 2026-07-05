import { config } from '../../config/index.js';
import { getLogger } from './logger.js';
import {
  dbOperationsCounter,
  dbTransactionDuration,
  discoveryCacheCounter,
  discoveryRequestsCounter,
  executionCounter,
  executionDuration,
  transportFailures,
  transportProtocolErrors,
  transportReconnectAttempts,
} from './metrics.js';
import { traceSpan } from './tracer.js';

function isInfoEvent(serviceName: string, methodName: string): boolean {
  if (serviceName === 'ConnectionRegistry') {
    return ['register', 'update', 'remove', 'enable', 'disable'].includes(methodName);
  }
  if (serviceName === 'DiscoveryEngine') {
    return ['discover', 'refresh'].includes(methodName);
  }
  if (serviceName === 'ExecutionEngine') {
    return ['executeTool', 'readResource', 'executePrompt'].includes(methodName);
  }
  if (serviceName === 'Transport') {
    return ['connect', 'disconnect'].includes(methodName);
  }
  return false;
}

export function sanitize(val: unknown): unknown {
  if (val === null || val === undefined) {
    return val;
  }
  if (typeof val === 'string') {
    const lowerVal = val.toLowerCase();
    if (
      lowerVal.startsWith('bearer ') ||
      lowerVal.includes('key') ||
      lowerVal.includes('secret') ||
      lowerVal.includes('token') ||
      lowerVal.includes('password') ||
      val.length > 200
    ) {
      return '[REDACTED]';
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sanitize);
  }
  if (typeof val === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const lowerK = k.toLowerCase();
      if (
        lowerK.includes('key') ||
        lowerK.includes('secret') ||
        lowerK.includes('token') ||
        lowerK.includes('password') ||
        lowerK.includes('auth') ||
        lowerK.includes('credential') ||
        lowerK.includes('private')
      ) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitize(v);
      }
    }
    return sanitized;
  }
  return val;
}

function getDurationInSeconds(start: [number, number]): number {
  const diff = process.hrtime(start);
  return diff[0] + diff[1] / 1e9;
}

export function createTelemetryProxy<T extends object>(instance: T, serviceName: string): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') {
        return original;
      }

      return function (this: unknown, ...args: unknown[]) {
        const methodName = String(prop);
        const isInfoLogged = isInfoEvent(serviceName, methodName);

        const cleanArgs = args.map(sanitize);
        const logData: Record<string, unknown> = { service: serviceName, method: methodName };
        if (cleanArgs.length > 0) {
          logData.args = cleanArgs;
        }

        const start = process.hrtime();
        const activeLogger = getLogger().child({ component: serviceName });

        if (isInfoLogged) {
          activeLogger.info(logData, `Starting ${serviceName}.${methodName}`);
        } else {
          activeLogger.debug(logData, `Calling ${serviceName}.${methodName}`);
        }

        let result: unknown;
        try {
          result = (original as (...a: unknown[]) => unknown).apply(this, args);
        } catch (error: unknown) {
          const durationSec = getDurationInSeconds(start);
          const durationMs = durationSec * 1000;
          const err = error as Error;
          recordMetrics(serviceName, methodName, args, err, durationSec, 'failure');
          activeLogger.error(
            { durationMs, error: err },
            `Error in ${serviceName}.${methodName}: ${err.message}`,
          );
          throw error;
        }

        // If the return value is a Promise, handle it asynchronously
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return traceSpan(`${serviceName}.${methodName}`, async (span) => {
            if (span) {
              span.setAttribute('service', serviceName);
              span.setAttribute('method', methodName);
              if (cleanArgs.length > 0) {
                span.setAttribute('arguments', JSON.stringify(cleanArgs));
              }
            }

            try {
              const asyncResult = await (result as Promise<unknown>);
              const durationSec = getDurationInSeconds(start);
              const durationMs = durationSec * 1000;
              recordMetrics(serviceName, methodName, args, asyncResult, durationSec, 'success');
              if (isInfoLogged) {
                activeLogger.info(
                  { durationMs },
                  `Completed ${serviceName}.${methodName} successfully`,
                );
              } else {
                activeLogger.debug({ durationMs }, `Completed ${serviceName}.${methodName}`);
              }
              return asyncResult;
            } catch (error: unknown) {
              const durationSec = getDurationInSeconds(start);
              const durationMs = durationSec * 1000;
              const err = error as Error;
              recordMetrics(serviceName, methodName, args, err, durationSec, 'failure');
              activeLogger.error(
                { durationMs, error: err },
                `Error in ${serviceName}.${methodName}: ${err.message}`,
              );
              throw error;
            }
          });
        }

        // If the method is synchronous, process metrics and return synchronously
        const durationSec = getDurationInSeconds(start);
        const durationMs = durationSec * 1000;
        recordMetrics(serviceName, methodName, args, result, durationSec, 'success');
        if (isInfoLogged) {
          activeLogger.info({ durationMs }, `Completed ${serviceName}.${methodName} successfully`);
        } else {
          activeLogger.debug({ durationMs }, `Completed ${serviceName}.${methodName}`);
        }
        return result;
      };
    },
  });
}

function recordMetrics(
  serviceName: string,
  methodName: string,
  args: unknown[],
  resultOrError: unknown,
  durationSec: number,
  status: 'success' | 'failure',
) {
  if (!config.METRICS_ENABLED) return;

  try {
    // 1. Discovery Engine Metrics
    if (serviceName === 'DiscoveryEngine') {
      if (methodName === 'discover' || methodName === 'refresh') {
        const connectionId = (args[0] as string) || 'unknown';
        discoveryRequestsCounter.inc({ connection_id: connectionId, status });
      }
    }

    // 2. Discovery Cache Metrics
    if (serviceName === 'DiscoveryCache') {
      if (methodName === 'get') {
        const connectionId = (args[0] as string) || 'unknown';
        if (status === 'success') {
          const hit = resultOrError !== undefined ? 'hit' : 'miss';
          discoveryCacheCounter.inc({ connection_id: connectionId, result: hit });
        }
      }
    }

    // 3. Execution Engine Metrics
    if (serviceName === 'ExecutionEngine') {
      const isTool = methodName === 'executeTool';
      const isResource = methodName === 'readResource';
      const isPrompt = methodName === 'executePrompt';

      if (isTool || isResource || isPrompt) {
        const request = (args[0] || {}) as Record<string, unknown>;
        const connectionId = (request.connectionId as string) || 'unknown';
        const type = isTool ? 'tool' : isResource ? 'resource' : 'prompt';
        const name = isTool
          ? (request.toolName as string)
          : isResource
            ? (request.resourceName as string)
            : (request.promptName as string) || 'unknown';

        let executionStatus = status;
        const resultObj = resultOrError as Record<string, unknown> | undefined;
        if (status === 'success' && resultObj?.status === 'error') {
          executionStatus = 'failure';
        }

        executionCounter.inc({
          connection_id: connectionId,
          type,
          name,
          status: executionStatus === 'success' ? 'success' : 'failure',
        });
        executionDuration.observe(
          {
            connection_id: connectionId,
            type,
            name,
            status: executionStatus === 'success' ? 'success' : 'failure',
          },
          durationSec,
        );
      }
    }

    // 4. Transport Metrics
    if (serviceName === 'Transport') {
      const connectionId = (args[0] as string) || 'unknown';
      if (methodName === 'connect') {
        if (status === 'failure') {
          transportFailures.inc({ connection_id: connectionId, type: 'connect_failed' });
        } else if (resultOrError) {
          const resultObj = resultOrError as Record<string, unknown>;
          if (resultObj.success === false) {
            transportFailures.inc({ connection_id: connectionId, type: 'connect_failed' });
          }
        }
      } else if (methodName === 'reconnect') {
        transportReconnectAttempts.inc({ connection_id: connectionId });
      }

      if (status === 'success' && resultOrError) {
        const resultObj = resultOrError as Record<string, unknown>;
        if (resultObj.error) {
          const errMsg = String(resultObj.error).toLowerCase();
          if (errMsg.includes('protocol') || errMsg.includes('version')) {
            transportProtocolErrors.inc({ connection_id: connectionId });
          } else {
            transportFailures.inc({ connection_id: connectionId, type: 'execution_failed' });
          }
        }
      }
    }

    // 5. Persistence Metrics
    if (serviceName === 'ConnectionRepository' || serviceName === 'DiscoveryCache') {
      dbOperationsCounter.inc({ operation: methodName, status });
      dbTransactionDuration.observe({ operation: methodName, status }, durationSec);
    }
  } catch (err) {
    getLogger().error({ err }, 'Error recording metrics in telemetry proxy');
  }
}
