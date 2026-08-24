import { constants } from 'node:fs';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ManagedBridgeProcess,
  createBridgeOverlay,
  createDshLaunchSpec,
} from '../src/managed-bridge-process';

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'fake-dsh.mjs');
const bridgePath = path.join(process.cwd(), 'obsidian-bridge.mjs');
let temporaryRoot = '';
let fakeCommand = '';

beforeAll(async () => {
  vi.stubGlobal('window', {
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
  });
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'managed-bridge-test-'));
  fakeCommand = path.join(temporaryRoot, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
  if (process.platform === 'win32') {
    await writeFile(fakeCommand, `@echo off\r\n"${process.execPath}" "${fixturePath}" %*\r\n`, 'utf8');
  } else {
    await writeFile(fakeCommand, `#!/bin/sh\nexec "${process.execPath}" "${fixturePath}" "$@"\n`, 'utf8');
    await chmod(fakeCommand, 0o755);
  }
});

afterAll(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe('正式 bridge 受管进程', () => {
  it('在隔离 DSH_HOME 生成固定 overlay、隐藏启动、握手并正常关闭', async () => {
    const runtimeHome = path.join(temporaryRoot, 'graceful-home');
    const manager = createManager('managed-graceful', runtimeHome);
    const client = await manager.start();
    expect(client.connectionState).toBe('ready');
    await expect(manager.shutdown()).resolves.toEqual({ outcome: 'graceful' });

    const overlay = await readFile(path.join(runtimeHome, 'obsidian-bridge.cordis.patch.yml'), 'utf8');
    expect(overlay).toBe(createBridgeOverlay(bridgePath));
    expect(overlay).toContain('disabled: true');
    expect(overlay).toContain('inject: [agents, agentDefaultModel]');
    expect(overlay).not.toContain('DEEPSEEK_API_KEY');
  });

  it('shutdown 超时后终止整个子进程树，并只返回限长脱敏诊断', async () => {
    const runtimeHome = path.join(temporaryRoot, 'forced-home');
    const pidFile = path.join(temporaryRoot, 'managed-child.pid');
    const manager = createManager('managed-hang-with-child', runtimeHome, {
      FAKE_DSH_PID_FILE: pidFile,
    });
    await manager.start();
    await waitForFile(pidFile);
    const childPid = Number.parseInt(await readFile(pidFile, 'utf8'), 10);

    const result = await manager.shutdown();
    expect(result.outcome).toBe('forced');
    expect(result.diagnostic).toContain('[REDACTED]');
    expect(result.diagnostic).not.toContain('super-secret-value');
    expect(result.diagnostic).not.toContain(process.cwd());
    expect(result.diagnostic?.length).toBeLessThanOrEqual(2 * 1024);
    await expectProcessGone(childPid);
  });

  it('Windows .cmd shim 只拼接固定参数并经隐藏 cmd.exe 启动', () => {
    const spec = createDshLaunchSpec(
      'C:\\Program Files\\dsh\\dsh.cmd',
      ['--profile', 'headless', '--patch', 'C:\\runtime home\\bridge.yml'],
      'win32',
      { SystemRoot: 'C:\\Windows' },
    );
    expect(spec.command).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(spec.args).toEqual([
      '/d', '/s', '/c',
      '""C:\\Program Files\\dsh\\dsh.cmd" "--profile" "headless" "--patch" "C:\\runtime home\\bridge.yml""',
    ]);
  });
});

function createManager(
  scenario: string,
  runtimeHome: string,
  extraEnvironment: NodeJS.ProcessEnv = {},
): ManagedBridgeProcess {
  return new ManagedBridgeProcess({
    bridgePath,
    command: fakeCommand,
    environment: {
      ...process.env,
      ...extraEnvironment,
      FAKE_DSH_SCENARIO: scenario,
    },
    requestTimeoutMs: 1_500,
    runtimeHome,
    shutdownTimeoutMs: 250,
    startTimeoutMs: 2_000,
    workingDirectory: process.cwd(),
  });
}

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      await access(filePath, constants.F_OK);
      return;
    } catch {
      await new Promise(resolve => globalThis.setTimeout(resolve, 25));
    }
  }
  throw new Error(`等待 PID 文件超时：${filePath}`);
}

async function expectProcessGone(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return;
    await new Promise(resolve => globalThis.setTimeout(resolve, 25));
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
