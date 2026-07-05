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

export class StdioProcessManager {
  private process: ChildProcess | null = null;
  private buffer = '';
  private killed = false;
  private callbacks: ProcessCallbacks | null = null;

  spawn(options: StdioProcessOptions, callbacks: ProcessCallbacks): void {
    if (this.process) {
      throw new Error('Process already running');
    }

    this.killed = false;
    this.callbacks = callbacks;

    this.process = spawn(options.command, options.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env ? { ...process.env, ...options.env } : process.env,
      cwd: options.cwd,
    });

    this.process.stdin?.setDefaultEncoding('utf-8');

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
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
      try {
        this.callbacks?.onStderr(chunk.toString('utf-8'));
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

      proc.on('exit', () => {
        clearTimeout(exitTimer);
        resolve();
      });

      proc.on('close', () => {
        clearTimeout(exitTimer);
        resolve();
      });

      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(exitTimer);
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.process !== null && !this.killed;
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }

  isKilled(): boolean {
    return this.killed;
  }
}
