export interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface Resource {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface DiscoveryResult {
  connectionId: string;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  discoveredAt: Date;
}

export interface CachedDiscoverySummary {
  connectionId: string;
  discoveredAt: Date;
  toolsCount: number;
  resourcesCount: number;
  promptsCount: number;
}
