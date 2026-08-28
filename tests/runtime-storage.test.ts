import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  prepareWorkbenchRuntimeStorage,
  resolveWorkbenchRuntimeStorage,
} from '../src/runtime-storage';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe('Workbench 运行数据存储边界', () => {
  it('按 Vault 哈希解析系统应用数据目录，并继承 DSH 原生会话根', () => {
    const resolved = resolveWorkbenchRuntimeStorage({
      environment: { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' },
      homeDirectory: 'C:\\Users\\tester',
      platform: 'win32',
      vaultPath: 'D:\\Knowledge\\Personal Vault',
    });

    expect(resolved).toMatchObject({
      dshHome: 'C:\\Users\\tester\\.dsh',
      dshHomeDisplay: '~/.dsh',
    });
    expect(resolved.stateDirectory).toMatch(
      /^C:\\Users\\tester\\AppData\\Local\\DeepSeek Harness Workbench\\vaults\\[a-f0-9]{32}$/u,
    );
    expect(resolved.stateDirectory).not.toContain('Personal Vault');
  });

  it('尊重显式 DSH_HOME，但不把其绝对路径用作界面标签', () => {
    const resolved = resolveWorkbenchRuntimeStorage({
      environment: { DSH_HOME: '~/custom-dsh', XDG_STATE_HOME: '/var/state/tester' },
      homeDirectory: '/home/tester',
      platform: 'linux',
      vaultPath: '/data/knowledge',
    });

    expect(resolved.dshHome).toBe('/home/tester/custom-dsh');
    expect(resolved.dshHomeDisplay).toBe('$DSH_HOME');
    expect(resolved.stateDirectory).toMatch(
      /^\/var\/state\/tester\/deepseek-harness-workbench\/vaults\/[a-f0-9]{32}$/u,
    );
  });

  it('创建 Vault 外状态目录，并拒绝 Vault 内的状态目录或 DSH_HOME', async () => {
    const root = await createTemporaryRoot();
    const vaultPath = path.join(root, 'vault');
    const stateDirectory = path.join(root, 'state', 'vault-key');
    const dshHome = path.join(root, 'dsh-home');
    await Promise.all([mkdir(vaultPath), mkdir(dshHome)]);

    await expect(prepareWorkbenchRuntimeStorage({
      dshHome,
      stateDirectory,
      vaultPath,
      workingDirectory: stateDirectory,
    })).resolves.toMatchObject({ stateDirectory: await realPathForAssertion(stateDirectory) });

    await expect(prepareWorkbenchRuntimeStorage({
      dshHome,
      stateDirectory: path.join(vaultPath, '.runtime'),
      vaultPath,
      workingDirectory: stateDirectory,
    })).rejects.toThrow('插件运行状态目录 不得位于 Vault 内');
    await expect(prepareWorkbenchRuntimeStorage({
      dshHome: path.join(vaultPath, '.dsh'),
      stateDirectory,
      vaultPath,
      workingDirectory: stateDirectory,
    })).rejects.toThrow('DSH_HOME 不得位于 Vault 内');
    await expect(prepareWorkbenchRuntimeStorage({
      dshHome,
      stateDirectory,
      vaultPath,
      workingDirectory: path.join(vaultPath, 'workspace'),
    })).rejects.toThrow('DSH 工作目录 不得位于 Vault 内');
  });

  it.runIf(process.platform !== 'win32')('拒绝经符号链接回到 Vault 的状态目录', async () => {
    const root = await createTemporaryRoot();
    const vaultPath = path.join(root, 'vault');
    const linkPath = path.join(root, 'state-link');
    const dshHome = path.join(root, 'dsh-home');
    await Promise.all([mkdir(vaultPath), mkdir(dshHome)]);
    await symlink(vaultPath, linkPath, 'dir');

    await expect(prepareWorkbenchRuntimeStorage({
      dshHome,
      stateDirectory: path.join(linkPath, 'runtime'),
      vaultPath,
      workingDirectory: dshHome,
    })).rejects.toThrow('插件运行状态目录 不得位于 Vault 内');
  });
});

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-runtime-storage-'));
  temporaryRoots.push(root);
  return root;
}

async function realPathForAssertion(candidate: string): Promise<string> {
  await mkdir(candidate, { recursive: true });
  return realpath(candidate);
}
