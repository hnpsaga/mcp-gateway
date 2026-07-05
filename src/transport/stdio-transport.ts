import { BaseTransport } from './base-transport.js';
import type { DiscoverCapabilitiesResult } from './transport-result.js';

export class StdioTransport extends BaseTransport {
  async discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult> {
    return {
      success: true,
      connectionId,
      capabilities: {
        tools: [
          {
            name: 'calculate',
            description: 'Perform mathematical calculations',
            inputSchema: {
              type: 'object',
              properties: { expression: { type: 'string' } },
            },
          },
          {
            name: 'read_file',
            description: 'Read contents of a file',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
        ],
        resources: [
          {
            name: 'Config',
            uri: 'file:///data/config.json',
            description: 'Application configuration',
            mimeType: 'application/json',
          },
          {
            name: 'Settings',
            uri: 'file:///data/settings.json',
            description: 'User settings',
            mimeType: 'application/json',
          },
        ],
        prompts: [
          {
            name: 'analyze_code',
            description: 'Analyze source code',
            arguments: [{ name: 'language', description: 'Programming language', required: true }],
          },
          {
            name: 'review_changes',
            description: 'Review code changes',
            arguments: [{ name: 'diff', description: 'Git diff content', required: true }],
          },
        ],
      },
    };
  }

  supportsCapability(capability: string): boolean {
    if (capability === 'stdio') return true;
    return super.supportsCapability(capability);
  }
}
