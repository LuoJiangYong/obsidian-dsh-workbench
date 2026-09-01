import {
  spawn,
  spawnSync,
  type ChildProcess,
} from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { validateDshCommand } from './dsh-settings';

export const TARGET_DSH_VERSION = '0.1.2-alpha.3';

export type DshHealthResult =
  | { readonly status: 'unchecked' }
  | { readonly status: 'checking' }
  | { readonly status: 'available'; readonly version: string }
  | { readonly status: 'unsupported-version'; readonly version: string }
  | { readonly status: 'invalid-command'; readonly message: string }
  | { readonly status: 'not-found' }
  | { readonly status: 'invalid-output' }
  | { readonly status: 'timed-out' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly diagnostic: string };

interface DshHealthProbeOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly expectedVersion?: string;
  readonly platform?: NodeJS.Platform;
  readonly timeoutMs?: number;
}

interface ActiveProbe {
  readonly child: ChildProcess;
  cancelStatus: 'cancelled' | 'timed-out' | undefined;
}

interface LaunchSpec {
  readonly args: string[];
  readonly command: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const STDOUT_LIMIT = 8 * 1024;
const STDERR_LIMIT = 2 * 1024;
const VERSION_PATTERN = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/u;

export class DshHealthProbe {
  private activeProbe: ActiveProbe | undefined;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly expectedVersion: string;
  private readonly platform: NodeJS.Platform;
  private readonly timeoutMs: number;

  constructor(options: DshHealthProbeOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.expectedVersion = options.expectedVersion ?? TARGET_DSH_VERSION;
    this.platform = options.platform ?? process.platform;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async check(rawCommand: string): Promise<DshHealthResult> {
    const command = rawCommand.trim();
    const validationError = validateDshCommand(command, this.platform);
    if (validationError) return { status: 'invalid-command', message: validationError };
    if (this.platform === 'win32' && !this.isWindowsCommandAvailable(command)) {
      return { status: 'not-found' };
    }
    if (this.activeProbe) {
      return { status: 'failed', diagnostic: '已有 DSH 健康检查正在运行。' };
    }

    const launch = this.createLaunchSpec(command);
    return await new Promise<DshHealthResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const child = spawn(launch.command, launch.args, {
        detached: this.platform !== 'win32',
        env: this.environment,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        windowsVerbatimArguments: this.platform === 'win32',
      });
      const activeProbe: ActiveProbe = { child, cancelStatus: undefined };
      this.activeProbe = activeProbe;

      const settle = (result: DshHealthResult): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (this.activeProbe === activeProbe) this.activeProbe = undefined;
        resolve(result);
      };

      const timeout = window.setTimeout(() => {
        activeProbe.cancelStatus = 'timed-out';
        this.terminateProcessTree(child);
      }, this.timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout = appendHead(stdout, chunk, STDOUT_LIMIT);
      });
      child.stderr.on('data', (chunk: string) => {
        stderr = appendTail(stderr, chunk, STDERR_LIMIT);
      });

      child.once('error', (error: NodeJS.ErrnoException) => {
        if (activeProbe.cancelStatus) {
          settle({ status: activeProbe.cancelStatus });
          return;
        }
        settle(error.code === 'ENOENT' ? { status: 'not-found' } : {
          status: 'failed',
          diagnostic: '无法启动 DSH 健康检查进程。',
        });
      });

      child.once('close', (exitCode) => {
        if (activeProbe.cancelStatus) {
          settle({ status: activeProbe.cancelStatus });
          return;
        }

        if (exitCode !== 0) {
          settle({
            status: 'failed',
            diagnostic: redactDiagnostic(stderr) || `DSH 健康检查退出码：${String(exitCode)}`,
          });
          return;
        }

        const version = stdout.match(VERSION_PATTERN)?.[0];
        if (!version) {
          settle({ status: 'invalid-output' });
          return;
        }
        settle(version === this.expectedVersion
          ? { status: 'available', version }
          : { status: 'unsupported-version', version });
      });
    });
  }

  dispose(): void {
    const activeProbe = this.activeProbe;
    if (!activeProbe) return;
    activeProbe.cancelStatus = 'cancelled';
    this.terminateProcessTree(activeProbe.child);
  }

  private createLaunchSpec(command: string): LaunchSpec {
    if (this.platform !== 'win32') return { command, args: ['--version'] };

    const isAbsolute = path.win32.isAbsolute(command);
    const extension = isAbsolute ? path.win32.extname(command).toLowerCase() : '';
    if (isAbsolute && (extension === '.exe' || extension === '.com')) {
      return { command, args: ['--version'] };
    }

    const comSpec = this.environment.ComSpec
      ?? this.environment.COMSPEC
      ?? path.win32.join(this.environment.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe');
    const commandLine = isAbsolute
      ? `""${command}" --version"`
      : `${command} --version`;
    return { command: comSpec, args: ['/d', '/s', '/c', commandLine] };
  }

  private isWindowsCommandAvailable(command: string): boolean {
    if (path.win32.isAbsolute(command)) return existsSync(command);

    const where = path.win32.join(
      this.environment.SystemRoot ?? 'C:\\Windows',
      'System32',
      'where.exe',
    );
    return spawnSync(where, [command], {
      env: this.environment,
      stdio: 'ignore',
      windowsHide: true,
    }).status === 0;
  }

  private terminateProcessTree(child: ChildProcess): void {
    const pid = child.pid;
    if (pid === undefined) {
      child.kill();
      return;
    }

    if (this.platform === 'win32') {
      const taskkill = path.win32.join(
        this.environment.SystemRoot ?? 'C:\\Windows',
        'System32',
        'taskkill.exe',
      );
      spawnSync(taskkill, ['/pid', String(pid), '/t', '/f'], {
        env: this.environment,
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }

    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function appendHead(current: string, chunk: string, limit: number): string {
  if (current.length >= limit) return current;
  return `${current}${chunk}`.slice(0, limit);
}

function appendTail(current: string, chunk: string, limit: number): string {
  return `${current}${chunk}`.slice(-limit);
}

export function redactDiagnostic(rawDiagnostic: string): string {
  return rawDiagnostic
    .replace(/\bBearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/gu, '[REDACTED]')
    .replace(
      /\b((?:DEEPSEEK_API_KEY|API_KEY|AUTHORIZATION|TOKEN)\s*[=:]\s*)\S+/giu,
      '$1[REDACTED]',
    )
    .trim();
}
