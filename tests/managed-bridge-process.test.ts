import { constants } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ManagedBridgeProcess,
  createBridgeOverlay,
  createDshLaunchSpec,
} from '../src/managed-bridge-process';

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'fake-dsh.mjs');
let bridgePath = '';
let temporaryRoot = '';
let fakeCommand = '';

beforeAll(async () => {
  vi.stubGlobal('window', {
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
  });
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'managed-bridge-test-'));
  await mkdir(path.join(temporaryRoot, 'vault'));
  bridgePath = path.join(temporaryRoot, 'obsidian-bridge.mjs');
  await writeFile(bridgePath, 'export {};\n', 'utf8');
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
  it('把 overlay 与 DSH 原生会话根分离、强制只读启动、握手并正常关闭', async () => {
    const stateDirectory = path.join(temporaryRoot, 'graceful-state');
    const dshHome = path.join(temporaryRoot, 'graceful-dsh-home');
    const environmentFile = path.join(temporaryRoot, 'graceful-environment.json');
    const manager = createManager('managed-graceful', stateDirectory, dshHome, {
      FAKE_DSH_ENV_FILE: environmentFile,
    });
    const client = await manager.start();
    expect(client.connectionState).toBe('ready');
    await expect(manager.shutdown()).resolves.toEqual({ outcome: 'graceful' });

    const overlay = await readFile(path.join(stateDirectory, 'obsidian-bridge.cordis.patch.yml'), 'utf8');
    expect(overlay).toBe(createBridgeOverlay(bridgePath));
    expect(overlay).toContain('disabled: true');
    expect(overlay).toContain('inject: [agents, agentDefaultModel, tools]');
    expect(overlay).not.toContain('DEEPSEEK_API_KEY');
    await expect(readFile(environmentFile, 'utf8').then((value) => JSON.parse(value) as unknown))
      .resolves.toEqual({
        dshHome,
        permissionMode: 'read-only',
        telemetryDisabled: '1',
      });
  });

  it('shutdown 超时后终止整个子进程树，并只返回限长脱敏诊断', async () => {
    const stateDirectory = path.join(temporaryRoot, 'forced-state');
    const dshHome = path.join(temporaryRoot, 'forced-dsh-home');
    const pidFile = path.join(temporaryRoot, 'managed-child.pid');
    const manager = createManager('managed-hang-with-child', stateDirectory, dshHome, {
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

  it('运行目录落入 Vault 时在执行任何 DSH 检查前 fail closed', async () => {
    const vaultPath = path.join(temporaryRoot, 'vault');
    const missingCommand = path.join(
      temporaryRoot,
      process.platform === 'win32' ? 'missing-dsh.cmd' : 'missing-dsh',
    );
    const manager = new ManagedBridgeProcess({
      bridgePath,
      command: missingCommand,
      dshHome: path.join(temporaryRoot, 'boundary-dsh-home'),
      stateDirectory: path.join(vaultPath, '.runtime'),
      vaultPath,
      workingDirectory: process.cwd(),
    });

    await expect(manager.start()).rejects.toThrow('插件运行状态目录 不得位于 Vault 内');
  });
});

function createManager(
  scenario: string,
  stateDirectory: string,
  dshHome: string,
  extraEnvironment: NodeJS.ProcessEnv = {},
): ManagedBridgeProcess {
  return new ManagedBridgeProcess({
    bridgePath,
    command: fakeCommand,
    dshHome,
    environment: {
      ...process.env,
      ...extraEnvironment,
      FAKE_DSH_SCENARIO: scenario,
    },
    requestTimeoutMs: 1_500,
    stateDirectory,
    shutdownTimeoutMs: 250,
    startTimeoutMs: 2_000,
    vaultPath: path.join(temporaryRoot, 'vault'),
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
