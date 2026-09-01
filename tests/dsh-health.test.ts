import { constants } from 'node:fs';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DshHealthProbe } from '../src/dsh-health';

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'fake-dsh.mjs');
let temporaryRoot = '';
let fakeCommand = '';

beforeAll(async () => {
  vi.stubGlobal('window', {
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
  });
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'dsh-health-test-'));
  fakeCommand = path.join(temporaryRoot, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');

  if (process.platform === 'win32') {
    await writeFile(
      fakeCommand,
      `@echo off\r\n"${process.execPath}" "${fixturePath}" %*\r\n`,
      'utf8',
    );
  } else {
    await writeFile(
      fakeCommand,
      `#!/bin/sh\nexec "${process.execPath}" "${fixturePath}" "$@"\n`,
      'utf8',
    );
    await chmod(fakeCommand, 0o755);
  }
});

afterAll(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe('DSH 只读健康检查', () => {
  it('通过绝对路径返回目标版本', async () => {
    const probe = createProbe('success');

    await expect(probe.check(fakeCommand)).resolves.toMatchObject({
      status: 'available',
      version: '0.1.2-alpha.3',
    });
  });

  it('通过 PATH 裸命令解析 npm shim', async () => {
    const probe = createProbe('success', {
      PATH: `${temporaryRoot}${path.delimiter}${process.env.PATH ?? ''}`,
    });

    await expect(probe.check('dsh')).resolves.toMatchObject({
      status: 'available',
      version: '0.1.2-alpha.3',
    });
  });

  it('把缺失的绝对路径和裸命令归类为未找到', async () => {
    const missingAbsolute = path.join(
      temporaryRoot,
      process.platform === 'win32' ? 'missing-dsh.cmd' : 'missing-dsh',
    );
    const probe = createProbe('success');

    await expect(probe.check(missingAbsolute)).resolves.toMatchObject({ status: 'not-found' });
    await expect(probe.check('definitely-missing-dsh-command')).resolves.toMatchObject({
      status: 'not-found',
    });
  });

  it('区分非目标版本与无法解析的输出', async () => {
    await expect(createProbe('unsupported').check(fakeCommand)).resolves.toMatchObject({
      status: 'unsupported-version',
      version: '0.1.0-rc.6',
    });
    await expect(createProbe('invalid-output').check(fakeCommand)).resolves.toMatchObject({
      status: 'invalid-output',
    });
  });

  it('限制并脱敏 stderr 诊断', async () => {
    const result = await createProbe('secret-error').check(fakeCommand);

    expect(result).toMatchObject({ status: 'failed' });
    if (result.status !== 'failed') throw new Error('预期健康检查失败');
    expect(result.diagnostic).toContain('[REDACTED]');
    expect(result.diagnostic).not.toContain('super-secret-value');
  });

  it('超时后终止整个假运行时进程树', async () => {
    const pidFile = path.join(temporaryRoot, 'timeout-child.pid');
    const probe = createProbe('hang-with-child', { FAKE_DSH_PID_FILE: pidFile }, 250);

    await expect(probe.check(fakeCommand)).resolves.toMatchObject({ status: 'timed-out' });
    const childPid = Number.parseInt(await readFile(pidFile, 'utf8'), 10);
    await expectProcessGone(childPid);
  });

  it('dispose 取消活动检查并终止整个进程树', async () => {
    const pidFile = path.join(temporaryRoot, 'dispose-child.pid');
    const probe = createProbe('hang-with-child', { FAKE_DSH_PID_FILE: pidFile }, 10_000);
    const resultPromise = probe.check(fakeCommand);
    await waitForFile(pidFile);

    probe.dispose();

    await expect(resultPromise).resolves.toMatchObject({ status: 'cancelled' });
    const childPid = Number.parseInt(await readFile(pidFile, 'utf8'), 10);
    await expectProcessGone(childPid);
  });
});

function createProbe(
  scenario: string,
  extraEnvironment: NodeJS.ProcessEnv = {},
  timeoutMs = 2_000,
): DshHealthProbe {
  return new DshHealthProbe({
    environment: {
      ...process.env,
      ...extraEnvironment,
      FAKE_DSH_SCENARIO: scenario,
    },
    timeoutMs,
  });
}

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      await access(filePath, constants.F_OK);
      return;
    } catch {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
    }
  }
  throw new Error(`等待 PID 文件超时：${filePath}`);
}

async function expectProcessGone(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
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
