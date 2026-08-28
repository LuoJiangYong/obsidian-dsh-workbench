import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  STANDARD_OBSIDIAN_CONFIG_DIRECTORY,
  TaskWorkspaceLedger,
  type TaskWorkspaceLedgerOptions,
} from '../src/task-workspace';
import { taskPathHasExcludedDirectory } from '../src/task-workspace-policy';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe('任务工作区变更账本', () => {
  it('只接受与 Vault、Vault 外状态目录完全分离的普通目录', async () => {
    const fixture = await createFixture();
    const ledger = createLedger(fixture);

    await expect(ledger.validateWorkspace(fixture.workspace)).resolves.toMatchObject({
      name: 'workspace',
      path: fixture.workspace,
    });
    await expect(ledger.validateWorkspace(fixture.vault)).rejects.toMatchObject({
      code: 'workspace_vault_overlap',
    });
    await expect(ledger.validateWorkspace(fixture.root)).rejects.toMatchObject({
      code: 'workspace_vault_overlap',
    });
    await expect(ledger.validateWorkspace(fixture.stateDirectory)).rejects.toMatchObject({
      code: 'workspace_state_overlap',
    });

    const anotherVault = path.join(fixture.root, 'another-vault');
    await mkdir(path.join(anotherVault, STANDARD_OBSIDIAN_CONFIG_DIRECTORY), { recursive: true });
    await expect(ledger.validateWorkspace(anotherVault)).rejects.toMatchObject({
      code: 'workspace_is_vault',
    });
  });

  it('在 Vault 外建立基线，只报告真实文件变化并排除依赖与构建目录', async () => {
    const fixture = await createFixture();
    await Promise.all([
      mkdir(path.join(fixture.workspace, 'src'), { recursive: true }),
      mkdir(path.join(fixture.workspace, 'node_modules'), { recursive: true }),
      mkdir(path.join(fixture.workspace, 'dist'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(fixture.workspace, 'src', 'note.md'), 'one\ntwo\n', 'utf8'),
      writeFile(path.join(fixture.workspace, 'node_modules', 'ignored.md'), 'before\n', 'utf8'),
      writeFile(path.join(fixture.workspace, 'dist', 'ignored.md'), 'before\n', 'utf8'),
    ]);
    const ledger = createLedger(fixture);

    await ledger.beginTurn('turn-one', fixture.workspace);
    await Promise.all([
      writeFile(path.join(fixture.workspace, 'src', 'note.md'), 'one\nchanged\n', 'utf8'),
      writeFile(path.join(fixture.workspace, 'src', 'created.md'), 'new\n', 'utf8'),
      writeFile(path.join(fixture.workspace, 'node_modules', 'ignored.md'), 'after\n', 'utf8'),
      writeFile(path.join(fixture.workspace, 'dist', 'ignored.md'), 'after\n', 'utf8'),
    ]);

    await expect(ledger.completeTurn('turn-one')).resolves.toMatchObject({
      additions: 2,
      canUndo: true,
      changes: [
        {
          additions: 1,
          deletions: 0,
          kind: 'created',
          relativePath: 'src/created.md',
          review: { after: 'new\n', before: null },
        },
        {
          additions: 1,
          deletions: 1,
          kind: 'modified',
          relativePath: 'src/note.md',
          review: { after: 'one\nchanged\n', before: 'one\ntwo\n' },
        },
      ],
      deletions: 1,
      undone: false,
    });

    const ledgerPath = await locateLedger(fixture.stateDirectory, 'turn-one');
    expect(ledgerPath.startsWith(fixture.stateDirectory)).toBe(true);
    expect(ledgerPath.startsWith(fixture.vault)).toBe(false);
    expect(await readFile(ledgerPath, 'utf8')).not.toContain('ignored.md');
  });

  it('确认撤销后恢复修改和删除的文件，并移除本 turn 新建文件', async () => {
    const fixture = await createFixture();
    const nestedFile = path.join(fixture.workspace, 'nested', 'original.md');
    const createdFile = path.join(fixture.workspace, 'created.md');
    await mkdir(path.dirname(nestedFile), { recursive: true });
    await writeFile(nestedFile, 'original\n', 'utf8');
    const ledger = createLedger(fixture);

    await ledger.beginTurn('undo-turn', fixture.workspace);
    await rm(path.dirname(nestedFile), { force: true, recursive: true });
    await writeFile(createdFile, 'created\n', 'utf8');
    await ledger.completeTurn('undo-turn');

    await expect(ledger.undoTurn('undo-turn')).resolves.toMatchObject({
      canUndo: false,
      undone: true,
    });
    await expect(readFile(nestedFile, 'utf8')).resolves.toBe('original\n');
    await expect(readFile(createdFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(ledger.undoTurn('undo-turn')).rejects.toMatchObject({
      code: 'turn_already_undone',
    });
  });

  it('撤销前一次性校验全部当前文件，检测后续编辑时不改写任何文件', async () => {
    const fixture = await createFixture();
    const first = path.join(fixture.workspace, 'first.md');
    const second = path.join(fixture.workspace, 'second.md');
    await Promise.all([
      writeFile(first, 'first-before\n', 'utf8'),
      writeFile(second, 'second-before\n', 'utf8'),
    ]);
    const ledger = createLedger(fixture);
    await ledger.beginTurn('conflict-turn', fixture.workspace);
    await Promise.all([
      writeFile(first, 'first-after\n', 'utf8'),
      writeFile(second, 'second-after\n', 'utf8'),
    ]);
    await ledger.completeTurn('conflict-turn');
    await writeFile(second, 'user-newer-change\n', 'utf8');

    await expect(ledger.undoTurn('conflict-turn')).rejects.toMatchObject({ code: 'undo_conflict' });
    await expect(readFile(first, 'utf8')).resolves.toBe('first-after\n');
    await expect(readFile(second, 'utf8')).resolves.toBe('user-newer-change\n');
  });

  it('账本被篡改时 fail closed，不把伪造快照写回工作区', async () => {
    const fixture = await createFixture();
    const file = path.join(fixture.workspace, 'note.md');
    await writeFile(file, 'before\n', 'utf8');
    const ledger = createLedger(fixture);
    await ledger.beginTurn('tampered-turn', fixture.workspace);
    await writeFile(file, 'after\n', 'utf8');
    await ledger.completeTurn('tampered-turn');
    const ledgerPath = await locateLedger(fixture.stateDirectory, 'tampered-turn');
    const stored = JSON.parse(await readFile(ledgerPath, 'utf8')) as {
      changes: Array<{ before: { contentBase64: string } }>;
    };
    stored.changes[0]!.before.contentBase64 = Buffer.from('forged\n').toString('base64');
    await writeFile(ledgerPath, `${JSON.stringify(stored)}\n`, 'utf8');

    await expect(ledger.undoTurn('tampered-turn')).rejects.toMatchObject({
      code: 'turn_ledger_invalid',
    });
    await expect(readFile(file, 'utf8')).resolves.toBe('after\n');
  });

  it('账本目录哈希必须继续绑定原工作区，不能改写为另一目录', async () => {
    const fixture = await createFixture();
    const sourceFile = path.join(fixture.workspace, 'note.md');
    await writeFile(sourceFile, 'before\n', 'utf8');
    const ledger = createLedger(fixture);
    await ledger.beginTurn('identity-turn', fixture.workspace);
    await writeFile(sourceFile, 'after\n', 'utf8');
    await ledger.completeTurn('identity-turn');
    const replacementWorkspace = path.join(fixture.root, 'replacement-workspace');
    await mkdir(replacementWorkspace);
    await writeFile(path.join(replacementWorkspace, 'note.md'), 'after\n', 'utf8');
    const ledgerPath = await locateLedger(fixture.stateDirectory, 'identity-turn');
    const stored = JSON.parse(await readFile(ledgerPath, 'utf8')) as {
      workspace: { name: string; path: string };
    };
    stored.workspace = { name: 'replacement-workspace', path: replacementWorkspace };
    await writeFile(ledgerPath, `${JSON.stringify(stored)}\n`, 'utf8');

    await expect(ledger.undoTurn('identity-turn')).rejects.toMatchObject({
      code: 'turn_ledger_invalid',
    });
    await expect(readFile(path.join(replacementWorkspace, 'note.md'), 'utf8'))
      .resolves.toBe('after\n');
  });

  it('超出单文件上限时拒绝建立不完整基线', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.workspace, 'large.md'), 'four', 'utf8');
    const ledger = createLedger(fixture, { maxFileBytes: 3 });

    await expect(ledger.beginTurn('too-large', fixture.workspace)).rejects.toMatchObject({
      code: 'workspace_file_too_large',
    });
    await expect(locateLedger(fixture.stateDirectory, 'too-large')).rejects.toThrow();
  });

  it('建立新基线时按有效期和每工作区账本上限清理', async () => {
    const fixture = await createFixture();
    let now = new Date('2026-08-28T00:00:00.000Z');
    const ledger = createLedger(fixture, {
      maxLedgers: 2,
      now: () => now,
      retentionMs: 1_000,
    });
    await ledger.beginTurn('retained-one', fixture.workspace);
    await ledger.completeTurn('retained-one');
    now = new Date('2026-08-28T00:00:00.500Z');
    await ledger.beginTurn('retained-two', fixture.workspace);
    await ledger.completeTurn('retained-two');
    now = new Date('2026-08-28T00:00:00.600Z');
    await ledger.beginTurn('retained-three', fixture.workspace);
    await ledger.completeTurn('retained-three');

    await expect(locateLedger(fixture.stateDirectory, 'retained-one')).rejects.toThrow();
    await expect(locateLedger(fixture.stateDirectory, 'retained-two')).resolves.toBeTypeOf('string');
    await expect(locateLedger(fixture.stateDirectory, 'retained-three')).resolves.toBeTypeOf('string');

    now = new Date('2026-08-28T00:00:03.000Z');
    await ledger.beginTurn('retained-four', fixture.workspace);
    await expect(locateLedger(fixture.stateDirectory, 'retained-two')).rejects.toThrow();
    await expect(locateLedger(fixture.stateDirectory, 'retained-three')).rejects.toThrow();
  });

  it('bridge 与账本共用同一组排除目录策略', () => {
    const workspace = path.resolve('C:\\workspace');
    expect(taskPathHasExcludedDirectory(workspace, 'src/note.md')).toBe(false);
    expect(taskPathHasExcludedDirectory(workspace, 'node_modules/pkg/index.js')).toBe(true);
    expect(taskPathHasExcludedDirectory(workspace, 'dist')).toBe(true);
    expect(taskPathHasExcludedDirectory(workspace, '.git/config')).toBe(true);
  });
});

interface Fixture {
  readonly root: string;
  readonly stateDirectory: string;
  readonly vault: string;
  readonly workspace: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-task-workspace-'));
  temporaryRoots.push(root);
  const vault = path.join(root, 'vault');
  const stateDirectory = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  await Promise.all([mkdir(vault), mkdir(stateDirectory), mkdir(workspace)]);
  return { root, stateDirectory, vault, workspace };
}

function createLedger(
  fixture: Fixture,
  overrides: Partial<TaskWorkspaceLedgerOptions> = {},
): TaskWorkspaceLedger {
  return new TaskWorkspaceLedger({
    stateDirectory: fixture.stateDirectory,
    vaultPath: fixture.vault,
    ...overrides,
  });
}

async function locateLedger(stateDirectory: string, turnId: string): Promise<string> {
  const root = path.join(stateDirectory, 'task-turns');
  const directories = await readdir(root, { withFileTypes: true });
  const workspaceDirectory = directories.find(entry => entry.isDirectory());
  if (!workspaceDirectory) throw new Error('未找到工作区账本目录');
  const candidate = path.join(root, workspaceDirectory.name, `${turnId}.json`);
  await readFile(candidate, 'utf8');
  return candidate;
}
