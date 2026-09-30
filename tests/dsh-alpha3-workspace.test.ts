import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { NdjsonBridgeTransport } from '../src/bridge-ndjson-transport';
import type { BridgeWorkspaceReadResult } from '../src/bridge-protocol';
import { BridgeProtocolClient } from '../src/bridge-protocol-client';
import { createBridgeOverlay } from '../src/managed-bridge-process';
import { ProjectIndexStore } from '../src/project-index';

const CANDIDATE_VERSION = '0.1.2-alpha.3';
const fixtureRoot = path.join(process.cwd(), 'tests', 'runtime-candidate-fixture');
const dshBinPath = path.join(fixtureRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const probePath = path.join(process.cwd(), 'tests', 'fixtures', 'dsh-alpha3-workspace-probe.mjs');
let temporaryRoot = '';

beforeAll(async () => {
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  temporaryRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'dsh-alpha3-workspace-')));
  await Promise.all([
    mkdir(path.join(temporaryRoot, 'workspace-one'), { recursive: true }),
    mkdir(path.join(temporaryRoot, 'workspace-two'), { recursive: true }),
  ]);
});

afterAll(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe.runIf(existsSync(dshBinPath))('DSH 0.1.2-alpha.3 公开 Workspace 接缝', () => {
  it('真实读取公开 WorkspaceRegistry、canonical path、稳定 ID 与跨进程持久化', async () => {
    const dshHome = path.join(temporaryRoot, 'dsh-home');
    const seed = await runProbe('seed', dshHome);
    expect(seed.report).toMatchObject({
      phase: 'seed',
      status: 'passed',
      repeatedId: seed.report.firstId,
      workspaces: [
        {
          path: path.join(temporaryRoot, 'workspace-two'),
          title: 'D1 Alpha3 Second',
          status: 'ok',
          sessionIds: [],
        },
        {
          path: path.join(temporaryRoot, 'workspace-one'),
          title: 'D1 Alpha3 First',
          status: 'ok',
          sessionIds: [],
        },
      ],
    });
    const restored = await runProbe('restore', dshHome);
    expect(restored.report).toMatchObject({
      phase: 'restore',
      status: 'passed',
      workspaces: seed.report.workspaces,
    });
    const firstId = seed.report['firstId'];
    const secondId = seed.report['secondId'];
    if (typeof firstId !== 'string' || typeof secondId !== 'string') throw new Error('Workspace ID 缺失');
    const readback = await readThroughBridge(dshHome, [firstId, secondId, 'missing-workspace']);
    expect(readback.items).toMatchObject([
      { workspaceId: firstId, status: 'available', title: 'D1 Alpha3 First' },
      { workspaceId: secondId, status: 'available', title: 'D1 Alpha3 Second' },
      { workspaceId: 'missing-workspace', status: 'missing' },
    ]);
    const references = readback.items.flatMap(item => item.status === 'available'
      ? [{ workspaceId: item.workspaceId, canonicalPath: item.canonicalPath }]
      : []);
    await mkdir(path.join(temporaryRoot, 'vault'));
    const options = {
      stateDirectory: path.join(temporaryRoot, 'plugin-state'),
      vaultPath: path.join(temporaryRoot, 'vault'),
    };
    const saved = await new ProjectIndexStore(options).createProject({
      projectId: 'd1-real-project', displayName: '真实双目录项目', workspaces: references, pinned: true,
    });
    expect((await new ProjectIndexStore(options).load()).document).toEqual(saved);
    expect(seed.stdout + seed.stderr + restored.stdout + restored.stderr).not.toContain('fixture-key');
  }, 60_000);
});

async function readThroughBridge(dshHome: string, workspaceIds: readonly string[]): Promise<BridgeWorkspaceReadResult> {
  const overlayPath = path.join(temporaryRoot, 'read-bridge.cordis.patch.yml');
  await writeFile(overlayPath, createBridgeOverlay(path.join(process.cwd(), 'obsidian-bridge.mjs')), 'utf8');
  const child = spawn(process.execPath, [dshBinPath, '--profile', 'headless', '--patch', overlayPath], {
    cwd: path.join(temporaryRoot, 'workspace-one'),
    env: { ...process.env, DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: '1', DSH_PERMISSION_MODE: 'read-only' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const stderr = collect(child.stderr);
  const exit = waitForExit(child, 30_000);
  const client = new BridgeProtocolClient(new NdjsonBridgeTransport(child.stdout, child.stdin), {
    requestTimeoutMs: 15_000,
  });
  try {
    await client.initialize();
    const readback = await client.readWorkspaces(workspaceIds);
    await client.shutdown();
    expect(await exit).toBe(0);
    expect(client.failure).toBeUndefined();
    expect(await stderr).not.toContain('fixture-key');
    return readback;
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await exit.catch(() => undefined);
  }
}

async function runProbe(phase: 'seed' | 'restore', dshHome: string): Promise<{
  readonly report: Record<string, unknown>;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const phaseRoot = path.join(temporaryRoot, phase);
  const reportPath = path.join(phaseRoot, 'report.json');
  const overlayPath = path.join(phaseRoot, 'd1-workspace.cordis.patch.yml');
  await mkdir(phaseRoot, { recursive: true });
  await writeFile(overlayPath, createProbeOverlay(), { encoding: 'utf8', mode: 0o600 });
  const child = spawn(process.execPath, [
    dshBinPath,
    '--profile',
    'headless',
    '--patch',
    overlayPath,
  ], {
    cwd: path.join(temporaryRoot, 'workspace-one'),
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_D1_PHASE: phase,
      DSH_D1_REPORT_PATH: reportPath,
      DSH_D1_FIRST_PATH: path.join(temporaryRoot, 'workspace-one'),
      DSH_D1_SECOND_PATH: path.join(temporaryRoot, 'workspace-two'),
      DSH_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout = collect(child.stdout);
  const stderr = collect(child.stderr);
  const exit = await waitForExit(child, 30_000);
  const output = { stdout: await stdout, stderr: await stderr };
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as Record<string, unknown>;
  if (exit !== 0 || report.status !== 'passed') {
    throw new Error([
      `DSH ${CANDIDATE_VERSION} Workspace ${phase} probe failed: exit=${String(exit)}`,
      `report=${JSON.stringify(report)}`,
      `stderr=${output.stderr.slice(-2_048)}`,
    ].join('\n'));
  }
  return { report, ...output };
}

function createProbeOverlay(): string {
  return [
    '# D1 candidate-only Workspace probe; never installed into a user DSH profile.',
    '- id: code-runtime',
    '  disabled: true',
    '- id: headless-startup',
    '  disabled: true',
    '- id: headless-runner',
    '  disabled: true',
    '- insert:',
    '    - id: workspace',
    "      name: '@deepseek-ai/dsh-workspace'",
    `    - id: d1-workspace-probe\n      name: ${JSON.stringify(pathToFileURL(probePath).href)}\n      inject: [workspaceRegistry]`,
    '',
  ].join('\n');
}

function collect(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let output = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output = `${output}${chunk}`.slice(-16 * 1024); });
    stream.on('end', () => resolve(output));
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('DSH Workspace probe did not exit in time'));
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
