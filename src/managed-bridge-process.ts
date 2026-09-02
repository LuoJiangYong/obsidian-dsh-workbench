import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { NdjsonBridgeTransport } from './bridge-ndjson-transport';
import { BridgeProtocolClient } from './bridge-protocol-client';
import { TARGET_BRIDGE_DSH_VERSION } from './bridge-protocol';
import { DshHealthProbe, redactDiagnostic } from './dsh-health';
import { validateDshCommand } from './dsh-settings';
import {
  prepareWorkbenchRuntimeStorage,
  resolveWorkbenchRuntimeStorage,
} from './runtime-storage';

export interface ManagedBridgeProcessOptions {
  readonly bridgePath: string;
  readonly command: string;
  readonly dshHome?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly permissionMode?: 'read-only' | 'workspace-write';
  readonly requestTimeoutMs?: number;
  readonly stateDirectory: string;
  readonly shutdownTimeoutMs?: number;
  readonly startTimeoutMs?: number;
  readonly vaultPath: string;
  readonly workingDirectory: string;
}

export interface ManagedBridgeShutdownResult {
  readonly outcome: 'forced' | 'graceful';
  readonly diagnostic?: string;
}

export interface DshLaunchSpec {
  readonly args: readonly string[];
  readonly command: string;
}

const DEFAULT_START_TIMEOUT_MS = 15_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;
const STDERR_LIMIT = 2 * 1024;
const OVERLAY_FILENAME = 'obsidian-bridge.cordis.patch.yml';

export class ManagedBridgeProcess {
  private child: ChildProcessWithoutNullStreams | undefined;
  private clientValue: BridgeProtocolClient | undefined;
  private closePromise: Promise<void> | undefined;
  private disposed = false;
  private stderrTail = '';
  private readonly environment: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly requestTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly startTimeoutMs: number;

  constructor(private readonly options: ManagedBridgeProcessOptions) {
    this.environment = options.environment ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
    validateOptions(options, this.platform);
  }

  get client(): BridgeProtocolClient | undefined {
    return this.clientValue;
  }

  async start(): Promise<BridgeProtocolClient> {
    if (this.disposed) throw new Error('受管 bridge 已释放');
    if (this.child) throw new Error('受管 bridge 已启动');

    const configuredStorage = resolveWorkbenchRuntimeStorage({
      environment: this.environment,
      platform: this.platform,
      vaultPath: this.options.vaultPath,
    });
    const storage = await prepareWorkbenchRuntimeStorage({
      dshHome: this.options.dshHome ?? configuredStorage.dshHome,
      platform: this.platform,
      stateDirectory: this.options.stateDirectory,
      vaultPath: this.options.vaultPath,
      workingDirectory: this.options.workingDirectory,
    });
    const health = await new DshHealthProbe({
      environment: this.environment,
      expectedVersion: TARGET_BRIDGE_DSH_VERSION,
      platform: this.platform,
      timeoutMs: this.startTimeoutMs,
    }).check(this.options.command);
    if (health.status !== 'available') {
      throw new Error(`DSH ${TARGET_BRIDGE_DSH_VERSION} 启动前检查失败：${health.status}`);
    }
    await mkdir(this.options.workingDirectory, { recursive: true });
    const overlayPath = path.join(storage.stateDirectory, OVERLAY_FILENAME);
    await writeFile(
      overlayPath,
      createBridgeOverlay(this.options.bridgePath),
      { encoding: 'utf8', mode: 0o600 },
    );

    const launch = createDshLaunchSpec(
      this.options.command,
      ['--profile', 'headless', '--patch', overlayPath],
      this.platform,
      this.environment,
    );
    const child = spawn(launch.command, [...launch.args], {
      cwd: this.options.workingDirectory,
      detached: this.platform !== 'win32',
      env: {
        ...this.environment,
        DSH_HOME: storage.dshHome,
        DSH_PERMISSION_MODE: this.options.permissionMode ?? 'read-only',
        DSH_TELEMETRY_DISABLED: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: this.platform === 'win32',
    });
    this.child = child;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-STDERR_LIMIT);
    });
    this.closePromise = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
      child.once('error', () => resolve());
    });

    const transport = new NdjsonBridgeTransport(child.stdout, child.stdin);
    const client = new BridgeProtocolClient(transport, { requestTimeoutMs: this.requestTimeoutMs });
    this.clientValue = client;
    try {
      await client.initialize();
      return client;
    } catch (error) {
      await this.forceTerminate();
      throw new Error(
        `正式 bridge 握手失败：${error instanceof Error ? error.message : '未知错误'}${this.diagnosticSuffix()}`,
      );
    }
  }

  async shutdown(): Promise<ManagedBridgeShutdownResult> {
    if (!this.child || !this.clientValue || !this.closePromise) {
      return { outcome: 'graceful' };
    }
    try {
      await this.clientValue.shutdown();
      if (await settlesBefore(this.closePromise, this.shutdownTimeoutMs)) {
        this.clearProcess();
        return { outcome: 'graceful' };
      }
    } catch {
      // The bounded force-termination path below owns every shutdown failure.
    }
    await this.forceTerminate();
    return {
      outcome: 'forced',
      ...(this.readDiagnostic() ? { diagnostic: this.readDiagnostic() } : {}),
    };
  }

  async dispose(): Promise<ManagedBridgeShutdownResult> {
    if (this.disposed) return { outcome: 'graceful' };
    this.disposed = true;
    return await this.shutdown();
  }

  terminateImmediately(): void {
    if (this.disposed && !this.child) return;
    this.disposed = true;
    const child = this.child;
    if (child) terminateProcessTree(child, this.platform, this.environment);
    this.clearProcess();
  }

  private async forceTerminate(): Promise<void> {
    const child = this.child;
    if (!child) return;
    terminateProcessTree(child, this.platform, this.environment);
    if (this.closePromise) await settlesBefore(this.closePromise, this.shutdownTimeoutMs);
    this.clearProcess();
  }

  private clearProcess(): void {
    this.child = undefined;
    this.clientValue = undefined;
    this.closePromise = undefined;
  }

  private readDiagnostic(): string {
    let diagnostic = this.stderrTail;
    for (const sensitivePath of [
      this.options.bridgePath,
      this.options.dshHome,
      this.options.stateDirectory,
      this.options.vaultPath,
      this.options.workingDirectory,
    ].filter((value): value is string => value !== undefined)) {
      diagnostic = diagnostic.split(sensitivePath).join('[PATH]');
    }
    return redactDiagnostic(diagnostic).slice(-STDERR_LIMIT);
  }

  private diagnosticSuffix(): string {
    const diagnostic = this.readDiagnostic();
    return diagnostic ? `；诊断：${diagnostic}` : '';
  }
}

export function createBridgeOverlay(bridgePath: string): string {
  const bridgeUrl = pathToFileURL(bridgePath).href;
  return [
    '# 由 DeepSeek Harness Workbench 生成；仅作用于本次受管 bridge 启动。',
    '- id: code-runtime',
    '  disabled: true',
    '- id: headless-startup',
    '  disabled: true',
    '- id: headless-runner',
    '  disabled: true',
    '- insert:',
    '    - id: workspace',
    "      name: '@deepseek-ai/dsh-workspace'",
    '    - id: session-controller',
    "      name: '@deepseek-ai/dsh-api-session-controller'",
    '    - id: obsidian-bridge',
    `      name: ${JSON.stringify(bridgeUrl)}`,
    '      inject: [agents, agentDefaultModel, sessionController, tools]',
    '',
  ].join('\n');
}

export function createDshLaunchSpec(
  command: string,
  fixedArgs: readonly string[],
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): DshLaunchSpec {
  if (platform !== 'win32') return { command, args: fixedArgs };
  const isAbsolute = path.win32.isAbsolute(command);
  const extension = isAbsolute ? path.win32.extname(command).toLowerCase() : '';
  if (isAbsolute && (extension === '.exe' || extension === '.com')) {
    return { command, args: fixedArgs };
  }
  const comSpec = environment.ComSpec
    ?? environment.COMSPEC
    ?? path.win32.join(environment.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe');
  const payload = [command, ...fixedArgs].map(quoteCmdArgument).join(' ');
  return { command: comSpec, args: ['/d', '/s', '/c', `"${payload}"`] };
}

function quoteCmdArgument(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function validateOptions(options: ManagedBridgeProcessOptions, platform: NodeJS.Platform): void {
  const commandError = validateDshCommand(options.command, platform);
  if (commandError) throw new Error(commandError);
  for (const [label, value] of [
    ['bridgePath', options.bridgePath],
    ['stateDirectory', options.stateDirectory],
    ['vaultPath', options.vaultPath],
    ['workingDirectory', options.workingDirectory],
  ] as const) {
    if (!path.isAbsolute(value)) throw new Error(`${label} 必须是绝对路径`);
  }
  if (!existsSync(options.bridgePath)) throw new Error('正式 bridge artifact 不存在');
}

function terminateProcessTree(
  child: ChildProcessWithoutNullStreams,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): void {
  const pid = child.pid;
  if (pid === undefined) {
    child.kill('SIGKILL');
    return;
  }
  if (platform === 'win32') {
    const taskkill = path.win32.join(
      environment.SystemRoot ?? 'C:\\Windows',
      'System32',
      'taskkill.exe',
    );
    spawnSync(taskkill, ['/pid', String(pid), '/t', '/f'], {
      env: environment,
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

async function settlesBefore(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = window.setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
