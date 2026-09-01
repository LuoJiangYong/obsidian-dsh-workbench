import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { NdjsonBridgeTransport } from '../src/bridge-ndjson-transport';
import { BridgeProtocolClient } from '../src/bridge-protocol-client';
import { createBridgeOverlay, createDshLaunchSpec } from '../src/managed-bridge-process';

const CANDIDATE_VERSION = '0.1.2-alpha.3';
const CANDIDATE_INTEGRITY = 'sha512-VvATzYmQ4LMJREJ9e2POKksSHRfqP3y9pghplLBaQBuw2BqfbC0mQUVsaPwxe4wlcpj+riEgn8OJB01YnpF+3A==';
const SESSION_CONTROLLER_INTEGRITY = 'sha512-uMkeiIXaK49KF8ddU4nWMBVikOxEc8uG5jsRDpCsU9VwXflbsILWxWs7/v3t+jPxDwwbDQIo038YHULvJU4BlQ==';
const fixtureRoot = path.join(process.cwd(), 'tests', 'runtime-candidate-fixture');
const candidatePackagePath = path.join(fixtureRoot, 'package.json');
const candidateLockPath = path.join(fixtureRoot, 'package-lock.json');
const dshBinPath = path.join(fixtureRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const dshShimPath = path.join(
  fixtureRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'dsh.cmd' : 'dsh',
);
const probePath = path.join(process.cwd(), 'tests', 'fixtures', 'dsh-alpha3-control-probe.mjs');
const bridgePath = path.join(process.cwd(), 'obsidian-bridge.mjs');
let temporaryRoot = '';

describe('DSH 0.1.2-alpha.3 独立候选身份契约', () => {
  it('只在隔离夹具精确锁定候选版本和 npm integrity，不改生产 rc.2 夹具', async () => {
    const [candidatePackage, candidateLock, productionFixture, rootPackage] = await Promise.all([
      readJson(candidatePackagePath),
      readJson(candidateLockPath),
      readJson(path.join(process.cwd(), 'tests', 'runtime-fixture', 'package.json')),
      readJson(path.join(process.cwd(), 'package.json')),
    ]);
    const candidate = asRecord(candidatePackage);
    const candidatePackages = asRecord(asRecord(candidateLock)['packages']);
    const installed = asRecord(candidatePackages['node_modules/@deepseek-ai/dsh']);
    const sessionController = asRecord(
      candidatePackages['node_modules/@deepseek-ai/dsh-api-session-controller'],
    );
    const directDshPackages = Object.entries(candidatePackages)
      .filter(([packagePath]) => /^node_modules\/@deepseek-ai\/dsh(?:-[^/]+)?$/u.test(packagePath))
      .map(([packagePath, metadata]) => ({
        packagePath,
        version: asRecord(metadata)['version'],
      }));
    const production = asRecord(productionFixture);
    const root = asRecord(rootPackage);

    expect(asRecord(candidate['dependencies'])['@deepseek-ai/dsh']).toBe(CANDIDATE_VERSION);
    expect(asRecord(asRecord(candidatePackages[''])['dependencies'])['@deepseek-ai/dsh'])
      .toBe(CANDIDATE_VERSION);
    expect(installed).toMatchObject({ version: CANDIDATE_VERSION, integrity: CANDIDATE_INTEGRITY });
    expect(sessionController).toMatchObject({
      version: CANDIDATE_VERSION,
      integrity: SESSION_CONTROLLER_INTEGRITY,
    });
    expect(directDshPackages.length).toBeGreaterThan(200);
    expect(directDshPackages.every(entry => entry.version === CANDIDATE_VERSION)).toBe(true);
    expect(asRecord(production['dependencies'])['@deepseek-ai/dsh']).toBe('0.1.1-rc.2');
    expect(asRecord(root['dependencies'])['@deepseek-ai/dsh']).toBeUndefined();
    expect(asRecord(root['devDependencies'])['@deepseek-ai/dsh']).toBeUndefined();
  });
});

describe.runIf(existsSync(dshBinPath))('DSH 0.1.2-alpha.3 正式控制面候选运行验收', () => {
  beforeAll(async () => {
    vi.stubGlobal('window', {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
    });
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'dsh-alpha3-control-'));
    await mkdir(path.join(temporaryRoot, 'workspace'), { recursive: true });
  });

  afterAll(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true });
    vi.unstubAllGlobals();
  });

  it('真实 shim 读回精确版本', () => {
    const launch = createDshLaunchSpec(dshShimPath, ['--version'], process.platform, process.env);
    const result = spawnSync(launch.command, [...launch.args], {
      encoding: 'utf8',
      env: process.env,
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
    });
    expect({ status: result.status, stderr: result.stderr.trim() }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout.trim()).toBe(CANDIDATE_VERSION);
  });

  it('真实 artifact 加载当前 bridge 并完成握手、session 创建/关闭和正常退出', async () => {
    expect(existsSync(bridgePath)).toBe(true);
    const phaseRoot = path.join(temporaryRoot, 'bridge');
    const overlayPath = path.join(phaseRoot, 'bridge.cordis.patch.yml');
    await mkdir(phaseRoot, { recursive: true });
    await writeFile(overlayPath, createBridgeOverlay(bridgePath), { encoding: 'utf8', mode: 0o600 });
    const child = spawn(process.execPath, [
      dshBinPath,
      '--profile',
      'headless',
      '--patch',
      overlayPath,
    ], {
      cwd: path.join(temporaryRoot, 'workspace'),
      env: {
        ...process.env,
        DSH_HOME: path.join(temporaryRoot, 'bridge-dsh-home'),
        DSH_PERMISSION_MODE: 'read-only',
        DSH_TELEMETRY_DISABLED: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const pid = child.pid;
    const stderr = collect(child.stderr);
    const exitPromise = waitForExit(child, 30_000);
    const client = new BridgeProtocolClient(
      new NdjsonBridgeTransport(child.stdout, child.stdin),
      { requestTimeoutMs: 15_000 },
    );
    let closed = false;
    try {
      await client.initialize();
      await client.createSession({ sessionId: 'runtime-migration-alpha3-bridge', mode: 'chat' });
      await client.closeSession('runtime-migration-alpha3-bridge');
      await client.shutdown();
      expect(await exitPromise).toBe(0);
      closed = true;
      expect(client.failure).toBeUndefined();
      expect(await stderr).not.toContain('fixture-key');
      if (pid !== undefined) await expectProcessGone(pid);
    } finally {
      if (!closed && pid !== undefined && isProcessRunning(pid)) child.kill('SIGKILL');
      await exitPromise.catch(() => undefined);
    }
  }, 60_000);

  it('真实 artifact 跨两个进程创建、列举、恢复并投影标题、附件和一次性权限，关闭后零残留', async () => {
    const seed = await runProbe('seed');
    expect(seed.report).toMatchObject({
      phase: 'seed',
      status: 'passed',
      sessionId: 'obsidian-dsh-workbench-runtime-migration-alpha3',
      listed: {
        blank: false,
        sessionId: 'obsidian-dsh-workbench-runtime-migration-alpha3',
      },
      attachment: { bytesMatched: true, mediaType: 'image/webp', sourceMediaType: 'image/png' },
      approval: {
        outcome: 'allowed-once',
        request: { callId: 'runtime-migration-alpha3-call', toolName: 'read' },
      },
      follow: { type: 'snapshot' },
      control: { type: 'baseline', sessionPresent: true },
    });
    expect(asRecord(seed.report['history'])['eventTypes']).toEqual(expect.arrayContaining([
      'approval/asked',
      'approval/decided',
      'approval/policy',
      'permission/preset',
      'session/title',
      'turn/end',
      'turn/start',
      'user/message',
    ]));
    expect(asRecord(seed.report['listed'])['projectionKeys']).toContain('title');
    expect(asRecord(seed.report['control'])['projectionKeys']).toContain('title');

    const restored = await runProbe('restore');
    expect(restored.report).toMatchObject({
      phase: 'restore',
      status: 'passed',
      sessionId: 'obsidian-dsh-workbench-runtime-migration-alpha3',
      coldListed: {
        blank: false,
        running: false,
        sessionId: 'obsidian-dsh-workbench-runtime-migration-alpha3',
      },
      liveAgentRestored: true,
      attachment: { bytesMatched: true, mediaType: 'image/webp', sourceMediaType: 'image/png' },
      follow: { type: 'snapshot' },
      control: { type: 'baseline', sessionPresent: true },
    });
    expect(asRecord(restored.report['history'])['titleEvents']).toEqual([
      'Runtime migration alpha3 candidate',
      'Runtime migration alpha3 restored',
    ]);
    expect(asRecord(restored.report['follow'])['recordTypes']).toEqual(expect.arrayContaining([
      'approval/decided',
      'session/title',
      'user/message',
    ]));

    const sessionsRoot = path.join(temporaryRoot, 'dsh-home', 'sessions');
    const artifacts = await readdir(sessionsRoot, { recursive: true });
    expect(artifacts.some(entry => /session\.jsonl(?:\.zstd)?$/u.test(entry))).toBe(true);
    expect(seed.stdout + seed.stderr + restored.stdout + restored.stderr).not.toContain('fixture-key');
  }, 120_000);
});

async function runProbe(phase: 'seed' | 'restore'): Promise<{
  readonly report: Record<string, unknown>;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const phaseRoot = path.join(temporaryRoot, phase);
  const reportPath = path.join(phaseRoot, 'report.json');
  const overlayPath = path.join(phaseRoot, 'r1-control.cordis.patch.yml');
  await mkdir(phaseRoot, { recursive: true });
  await writeFile(overlayPath, createProbeOverlay(), { encoding: 'utf8', mode: 0o600 });
  const child = spawn(process.execPath, [
    dshBinPath,
    '--profile',
    'headless',
    '--patch',
    overlayPath,
  ], {
    cwd: path.join(temporaryRoot, 'workspace'),
    env: {
      ...process.env,
      DSH_HOME: path.join(temporaryRoot, 'dsh-home'),
      DSH_PERMISSION_MODE: 'workspace-write',
      DSH_R1_PHASE: phase,
      DSH_R1_REPORT_PATH: reportPath,
      DSH_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const pid = child.pid;
  const stdout = collect(child.stdout);
  const stderr = collect(child.stderr);
  const exit = await waitForExit(child, 45_000);
  if (pid !== undefined) await expectProcessGone(pid);
  const output = { stdout: await stdout, stderr: await stderr };
  const report = asRecord(await readJson(reportPath));
  if (exit !== 0 || report['status'] !== 'passed') {
    throw new Error([
      `DSH alpha.3 ${phase} probe failed: exit=${String(exit)}`,
      `report=${JSON.stringify(report)}`,
      `stderr=${output.stderr.slice(-2_048)}`,
    ].join('\n'));
  }
  return { report, ...output };
}

function createProbeOverlay(): string {
  return [
    '# R1 candidate-only overlay; never installed into a user DSH profile.',
    '- id: code-runtime',
    '  disabled: true',
    '- id: headless-startup',
    '  disabled: true',
    '- id: headless-runner',
    '  disabled: true',
    '- id: session-title-llm',
    '  disabled: true',
    '- insert:',
    '    - id: workspace',
    "      name: '@deepseek-ai/dsh-workspace'",
    '    - id: session-controller',
    "      name: '@deepseek-ai/dsh-api-session-controller'",
    '    - id: r1-control-probe',
    `      name: ${JSON.stringify(pathToFileURL(probePath).href)}`,
    '      inject: [agents, approval, attachments, sessionController, sessions]',
    '',
  ].join('\n');
}

function collect(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let output = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      output = `${output}${chunk}`.slice(-16 * 1024);
    });
    stream.on('end', () => resolve(output));
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('DSH alpha.3 candidate process did not exit in time'));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function expectProcessGone(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isProcessRunning(pid)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  expect(isProcessRunning(pid)).toBe(false);
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
