import { z } from 'zod';

export const toolSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

export const resourceSchema = z.object({
  name: z.string().min(1, 'Resource name is required'),
  uri: z.string().min(1, 'Resource URI is required'),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

const promptArgumentSchema = z.object({
  name: z.string().min(1, 'Argument name is required'),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

export const promptSchema = z.object({
  name: z.string().min(1, 'Prompt name is required'),
  description: z.string().optional(),
  arguments: z.array(promptArgumentSchema).optional(),
});

export const discoveryResultSchema = z.object({
  connectionId: z.string().min(1),
  tools: z.array(toolSchema),
  resources: z.array(resourceSchema),
  prompts: z.array(promptSchema),
  discoveredAt: z.date(),
});
