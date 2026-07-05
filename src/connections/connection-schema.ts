import { z } from 'zod';

import { TRANSPORT_TYPES } from './transport-type.js';

const transportConfigSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const createConnectionSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional().default(''),
    transportType: z.enum(TRANSPORT_TYPES),
    transportConfig: transportConfigSchema,
    enabled: z.boolean().optional().default(true),
    tags: z.array(z.string()).optional().default([]),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .superRefine((data, ctx) => {
    if (
      data.transportType === 'stdio' &&
      (!data.transportConfig.command || typeof data.transportConfig.command !== 'string')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Command is required for stdio transport',
        path: ['transportConfig', 'command'],
      });
    }

    if (
      data.transportType === 'streamable-http' &&
      (!data.transportConfig.url || typeof data.transportConfig.url !== 'string')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid URL is required for streamable-http transport',
        path: ['transportConfig', 'url'],
      });
    }
  });

export const updateConnectionSchema = z
  .object({
    name: z.string().min(1, 'Name is required').optional(),
    description: z.string().optional(),
    transportType: z.enum(TRANSPORT_TYPES).optional(),
    transportConfig: transportConfigSchema.optional(),
    enabled: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.transportType === 'stdio' && data.transportConfig) {
      if (!data.transportConfig.command || typeof data.transportConfig.command !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Command is required for stdio transport',
          path: ['transportConfig', 'command'],
        });
      }
    }

    if (data.transportType === 'streamable-http' && data.transportConfig) {
      if (!data.transportConfig.url || typeof data.transportConfig.url !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid URL is required for streamable-http transport',
          path: ['transportConfig', 'url'],
        });
      }
    }
  });
