import { BaseTransport } from './base-transport.js';
import type {
  DiscoverCapabilitiesResult,
  TransportExecutePromptResult,
  TransportExecuteToolResult,
  TransportReadResourceResult,
} from './transport-result.js';

export class StreamableHttpTransport extends BaseTransport {
  async discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult> {
    return {
      success: true,
      connectionId,
      capabilities: {
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather for a location',
            inputSchema: {
              type: 'object',
              properties: { location: { type: 'string' } },
            },
          },
          {
            name: 'search_web',
            description: 'Search the web for information',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string' } },
            },
          },
        ],
        resources: [
          {
            name: 'Weather API',
            uri: 'https://api.example.com/v1/weather',
            description: 'Weather data endpoint',
            mimeType: 'application/json',
          },
          {
            name: 'Search API',
            uri: 'https://api.example.com/v1/search',
            description: 'Web search endpoint',
            mimeType: 'application/json',
          },
        ],
        prompts: [
          {
            name: 'summarize',
            description: 'Summarize text content',
            arguments: [
              { name: 'text', description: 'Text to summarize', required: true },
              { name: 'max_length', description: 'Maximum summary length', required: false },
            ],
          },
          {
            name: 'translate',
            description: 'Translate text to another language',
            arguments: [
              { name: 'text', description: 'Text to translate', required: true },
              { name: 'target_language', description: 'Target language code', required: true },
            ],
          },
        ],
      },
    };
  }

  async executeTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<TransportExecuteToolResult> {
    return {
      success: true,
      connectionId,
      result: {
        toolName,
        args,
        output: `HTTP transport executed ${toolName}`,
      },
    };
  }

  async readResource(
    connectionId: string,
    resourceName: string,
  ): Promise<TransportReadResourceResult> {
    const resourceContents: Record<string, unknown> = {
      'Weather API': { temperature: 22, condition: 'sunny', humidity: 0.45 },
      'Search API': { results: ['result 1', 'result 2'], total: 42 },
    };

    return {
      success: true,
      connectionId,
      contents: resourceContents[resourceName] ?? {
        message: `Resource '${resourceName}' not found`,
      },
    };
  }

  async executePrompt(
    connectionId: string,
    promptName: string,
    args: Record<string, unknown>,
  ): Promise<TransportExecutePromptResult> {
    return {
      success: true,
      connectionId,
      result: {
        promptName,
        args,
        response: `HTTP transport executed prompt '${promptName}'`,
      },
    };
  }

  supportsCapability(capability: string): boolean {
    if (capability === 'streamable-http') return true;
    return super.supportsCapability(capability);
  }
}
