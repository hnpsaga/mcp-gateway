import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { config } from '../../config/index.js';
import { telemetryContextStorage } from './context.js';
import { logger } from './logger.js';

let sdk: NodeSDK | null = null;

export function initializeTracing() {
  if (!config.OTEL_ENABLED) {
    return;
  }

  logger.info('Initializing OpenTelemetry tracing...');

  const exporter = new OTLPTraceExporter({
    // Standard configuration or env vars (OTEL_EXPORTER_OTLP_ENDPOINT) will be picked up by OTLPTraceExporter automatically
  });

  sdk = new NodeSDK({
    traceExporter: exporter,
    serviceName: 'mcp-gateway',
  });

  try {
    sdk.start();
    logger.info('OpenTelemetry tracing initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to start OpenTelemetry NodeSDK');
  }
}

export async function shutdownTracing() {
  if (sdk) {
    logger.info('Shutting down OpenTelemetry tracing...');
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry tracing shut down successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to shut down OpenTelemetry NodeSDK');
    }
  }
}

export const tracer = opentelemetry.trace.getTracer('mcp-gateway');

export async function traceSpan<T>(
  name: string,
  operation: (span: opentelemetry.Span | null) => Promise<T>,
  attributes?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  if (!config.OTEL_ENABLED) {
    return operation(null);
  }

  return tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        for (const [k, v] of Object.entries(attributes)) {
          if (v !== undefined) {
            span.setAttribute(k, v);
          }
        }
      }

      const store = telemetryContextStorage.getStore();
      if (store?.requestId) {
        span.setAttribute('request.id', store.requestId);
      }

      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
