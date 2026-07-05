export type ExecutionStatus = 'success' | 'error';

export interface ExecutionError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ExecuteToolRequest {
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ReadResourceRequest {
  connectionId: string;
  resourceName: string;
}

export interface ExecutePromptRequest {
  connectionId: string;
  promptName: string;
  arguments: Record<string, unknown>;
}

export interface ExecuteToolResponse {
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  requestedAt: Date;
  executedAt: Date;
  status: ExecutionStatus;
  result?: unknown;
  error?: ExecutionError;
}

export interface ReadResourceResponse {
  connectionId: string;
  resourceName: string;
  requestedAt: Date;
  executedAt: Date;
  status: ExecutionStatus;
  contents?: unknown;
  error?: ExecutionError;
}

export interface ExecutePromptResponse {
  connectionId: string;
  promptName: string;
  arguments: Record<string, unknown>;
  requestedAt: Date;
  executedAt: Date;
  status: ExecutionStatus;
  result?: unknown;
  error?: ExecutionError;
}
