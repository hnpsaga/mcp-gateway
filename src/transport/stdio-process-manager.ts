import { type ChildProcess, spawn } from 'node:child_process';

export interface StdioProcessOptions {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export type StdoutHandler = (data: string) => void;
export type StderrHandler = (data: string) => void;
export type ExitHandler = (code: number | null, signal: string | null) => void;
export type ErrorHandler = (error: Error) => void;

export interface ProcessCallbacks {
  onStdout: StdoutHandler;
  onStderr: StderrHandler;
  onExit: ExitHandler;
  onError: ErrorHandler;
}

export interface StdioProcessManagerConfig {
  maxStdoutBufferSize?: number;
  maxStderrBufferSize?: number;
  startupTimeout?: number;
}

export class StdioProcessManager {
  private process: ChildProcess | null = null;
  private buffer = '';
  private killed = false;
  private callbacks: ProcessCallbacks | null = null;
  private readonly maxStdoutBufferSize: number;
  private readonly maxStderrBufferSize: number;
  private readonly startupTimeout: number;
  private stdoutBytesRead = 0;
  private stderrBuffer = '';
  private stderrBytesRead = 0;
  private spawned = false;

  constructor(config: StdioProcessManagerConfig = {}) {
    this.maxStdoutBufferSize = config.maxStdoutBufferSize ?? 10485760;
    this.maxStderrBufferSize = config.maxStderrBufferSize ?? 1048576;
    this.startupTimeout = config.startupTimeout ?? 15000;
  }

  spawn(options: StdioProcessOptions, callbacks: ProcessCallbacks): void {
    if (this.process) {
      throw new Error('Process already running');
    }

    this.killed = false;
    this.spawned = false;
    this.callbacks = callbacks;
    this.stdoutBytesRead = 0;
    this.stderrBuffer = '';
    this.stderrBytesRead = 0;

    this.process = spawn(options.command, options.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env ? { ...process.env, ...options.env } : process.env,
      cwd: options.cwd,
    });

    this.spawned = true;
    this.process.stdin?.setDefaultEncoding('utf-8');

    this.process.stdout?.on('data', (chunk: Buffer) => {
      const chunkStr = chunk.toString('utf-8');
      this.stdoutBytesRead += chunk.byteLength;

      if (this.stdoutBytesRead > this.maxStdoutBufferSize) {
        return;
      }

      this.buffer += chunkStr;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.length > 0) {
          try {
            this.callbacks?.onStdout(line);
          } catch {
            // Ignore handler errors
          }
        }
      }
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const chunkStr = chunk.toString('utf-8');
      this.stderrBytesRead += chunk.byteLength;

      if (this.stderrBytesRead > this.maxStderrBufferSize) {
        return;
      }

      this.stderrBuffer += chunkStr;
      try {
        this.callbacks?.onStderr(chunkStr);
      } catch {
        // Ignore handler errors
      }
    });

    this.process.on('error', (error: Error) => {
      if (!this.killed) {
        this.callbacks?.onError(error);
      }
    });

    this.process.on('exit', (code: number | null, signal: string | null) => {
      if (!this.killed) {
        this.callbacks?.onExit(code, signal);
      }
      this.process = null;
    });

    this.process.on('close', () => {
      this.process = null;
    });
  }

  send(message: string): void {
    if (!this.process?.stdin) {
      throw new Error('Process not running');
    }
    this.process.stdin.write(message);
  }

  async kill(timeout = 5000): Promise<void> {
    if (!this.process) {
      this.killed = true;
      return;
    }

    this.killed = true;

    return new Promise<void>((resolve) => {
      const proc = this.process!;
      const exitTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process may already be dead
        }
        resolve();
      }, timeout);

      const onExit = () => {
        clearTimeout(exitTimer);
        resolve();
      };

      proc.once('exit', onExit);
      proc.once('close', onExit);

      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(exitTimer);
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.process !== null && !this.killed && this.spawned;
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }

  isKilled(): boolean {
    return this.killed;
  }

  getStderrOutput(): string {
    return this.stderrBuffer;
  }

  getStdoutBytesRead(): number {
    return this.stdoutBytesRead;
  }

  getStderrBytesRead(): number {
    return this.stderrBytesRead;
  }
}
