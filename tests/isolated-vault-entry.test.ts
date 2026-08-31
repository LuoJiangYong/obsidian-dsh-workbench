import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const verifierPath = path.join(repositoryRoot, 'scripts', 'verify-isolated-vault.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (temporaryRoot) => {
    await rm(temporaryRoot, { recursive: true, force: true });
  }));
});

describe('G0-2 专用隔离 Vault 只读预检', () => {
  it('从 Obsidian 注册表唯一解析专用 Vault，输出脱敏清单且不修改输入', async () => {
    const fixture = await createFixture();
    const before = await snapshotFiles(fixture.root);

    const result = await runVerifier(['--obsidian-config', fixture.registryPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain(fixture.root);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      status: 'ready',
      mode: 'dry-run',
      source: 'obsidian-desktop-vault-registry',
      vault: {
        name: 'obsidian-dsh-workbench-evidence',
        path: '[redacted]',
      },
      plugin: {
        id: 'deepseek-harness-workbench',
        manifest: 'verified',
      },
      guards: {
        vaultWrite: 'not-authorized',
        automaticUiInteraction: 'not-authorized',
        otherPluginVault: 'rejected',
      },
      checklist: [
        { id: 'registry-source', result: 'passed' },
        { id: 'dedicated-vault-identity', result: 'passed' },
        { id: 'canonical-path-confinement', result: 'passed' },
        { id: 'plugin-manifest-id', result: 'passed' },
        { id: 'default-read-only', result: 'passed' },
      ],
    });
    expect(await snapshotFiles(fixture.root)).toEqual(before);
  });

  it('缺少专用 Vault 时 fail closed，且不会把注册表路径写入错误输出', async () => {
    const fixture = await createFixture({ registeredVaults: {} });

    const result = await runVerifier(['--obsidian-config', fixture.registryPath]);

    expectBlocked(result, 'dedicated_vault_not_found', fixture.root);
  });

  it('注册表只包含另一个插件 Vault 时明确拒绝', async () => {
    const fixture = await createFixture({
      vaultName: 'obsidian-trend-radar-evidence',
      pluginId: 'obsidian-trend-radar',
    });

    const result = await runVerifier(['--obsidian-config', fixture.registryPath]);

    expectBlocked(result, 'forbidden_vault', fixture.root);
  });

  it('专用目录中的插件 ID 不匹配时 fail closed', async () => {
    const fixture = await createFixture({ pluginId: 'wrong-plugin' });

    const result = await runVerifier(['--obsidian-config', fixture.registryPath]);

    expectBlocked(result, 'plugin_id_mismatch', fixture.root);
  });

  it('插件目录通过符号链接或 junction 越出 Vault 时 fail closed', async () => {
    const fixture = await createFixture({ createPluginDirectory: false });
    const externalPluginDirectory = path.join(fixture.root, 'external-plugin');
    await mkdir(externalPluginDirectory, { recursive: true });
    await writeFile(
      path.join(externalPluginDirectory, 'manifest.json'),
      JSON.stringify({ id: 'deepseek-harness-workbench' }),
      'utf8',
    );
    await symlink(
      externalPluginDirectory,
      fixture.pluginDirectory,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await runVerifier(['--obsidian-config', fixture.registryPath]);

    expectBlocked(result, 'plugin_path_escape', fixture.root);
  });

  it('专用 Vault 路径本身是符号链接或 junction 时拒绝别名', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-workbench-vault-alias-'));
    temporaryRoots.push(root);
    const targetVaultPath = path.join(root, 'target', 'obsidian-dsh-workbench-evidence');
    const targetPluginDirectory = path.join(
      targetVaultPath,
      '.obsidian',
      'plugins',
      'deepseek-harness-workbench',
    );
    await mkdir(targetPluginDirectory, { recursive: true });
    await writeFile(
      path.join(targetPluginDirectory, 'manifest.json'),
      JSON.stringify({ id: 'deepseek-harness-workbench' }),
      'utf8',
    );
    const aliasVaultPath = path.join(root, 'obsidian-dsh-workbench-evidence');
    await symlink(
      targetVaultPath,
      aliasVaultPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const registryPath = path.join(root, 'obsidian.json');
    await writeFile(
      registryPath,
      JSON.stringify({ vaults: { dedicated: { path: aliasVaultPath } } }),
      'utf8',
    );

    const result = await runVerifier(['--obsidian-config', registryPath]);

    expectBlocked(result, 'vault_path_alias_rejected', root);
  });

  it('重复的专用 Vault 注册项与任何写入参数都 fail closed', async () => {
    const duplicateFixture = await createFixture();
    await writeFile(
      duplicateFixture.registryPath,
      JSON.stringify({
        vaults: {
          first: { path: duplicateFixture.vaultPath },
          second: { path: duplicateFixture.vaultPath },
        },
      }),
      'utf8',
    );

    expectBlocked(
      await runVerifier(['--obsidian-config', duplicateFixture.registryPath]),
      'dedicated_vault_ambiguous',
      duplicateFixture.root,
    );
    expectBlocked(await runVerifier(['--write']), 'vault_write_not_authorized');
  });
});

interface FixtureOptions {
  createPluginDirectory?: boolean;
  pluginId?: string;
  registeredVaults?: Record<string, { path: string }>;
  vaultName?: string;
}

async function createFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-workbench-vault-'));
  temporaryRoots.push(root);
  const vaultName = options.vaultName ?? 'obsidian-dsh-workbench-evidence';
  const vaultPath = path.join(root, vaultName);
  const pluginDirectory = path.join(
    vaultPath,
    '.obsidian',
    'plugins',
    'deepseek-harness-workbench',
  );
  await mkdir(
    options.createPluginDirectory === false ? path.dirname(pluginDirectory) : pluginDirectory,
    { recursive: true },
  );
  if (options.createPluginDirectory !== false) {
    await writeFile(
      path.join(pluginDirectory, 'manifest.json'),
      JSON.stringify({ id: options.pluginId ?? 'deepseek-harness-workbench' }),
      'utf8',
    );
  }
  const registryPath = path.join(root, 'obsidian.json');
  await writeFile(
    registryPath,
    JSON.stringify({
      vaults: options.registeredVaults ?? {
        dedicated: { path: vaultPath },
      },
    }),
    'utf8',
  );
  return { root, vaultPath, pluginDirectory, registryPath };
}

async function runVerifier(args: string[]) {
  return new Promise<{ exitCode: number | null; stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [verifierPath, ...args], {
      cwd: repositoryRoot,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (exitCode) => {
      resolve({ exitCode, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function expectBlocked(
  result: { exitCode: number | null; stderr: string; stdout: string },
  code: string,
  redactedPath?: string,
) {
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  if (redactedPath !== undefined) expect(result.stderr).not.toContain(redactedPath);
  expect(JSON.parse(result.stderr)).toEqual({
    schemaVersion: 1,
    status: 'blocked',
    mode: 'dry-run',
    code,
  });
}

async function snapshotFiles(root: string): Promise<Record<string, { hash: string; mtimeMs: number }>> {
  const snapshot: Record<string, { hash: string; mtimeMs: number }> = {};
  await visit(root);
  return snapshot;

  async function visit(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(root, entryPath).replaceAll('\\', '/');
      const [content, fileStat] = await Promise.all([readFile(entryPath), stat(entryPath)]);
      snapshot[relativePath] = {
        hash: createHash('sha256').update(content).digest('hex'),
        mtimeMs: fileStat.mtimeMs,
      };
    }
  }
}
