import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TASK_WORKSPACE_MAX_FILE_BYTES,
  TaskWorkspaceLedger,
} from '../src/task-workspace';
import { ElectronTaskWorkspaceFileActions } from '../src/task-workspace-file-actions';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async root => await rm(root, {
    force: true,
    recursive: true,
  })));
});

describe('任务文件原生操作宿主', () => {
  it('每次操作都复验工作区与普通文件，并只复制用户明确请求的路径或文本', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.workspace, 'README.md'), '真实内容\n', 'utf8');
    const copied: string[] = [];
    const opened: string[] = [];
    const revealed: string[] = [];
    const actions = new ElectronTaskWorkspaceFileActions(fixture.ledger, {
      copyText: value => copied.push(value),
      openPath: async (filePath) => {
        opened.push(filePath);
        return '';
      },
      showItemInFolder: filePath => revealed.push(filePath),
    });
    const workspace = await fixture.ledger.validateWorkspace(fixture.workspace);

    await actions.copyRelativePath(workspace, 'README.md');
    await actions.copyAbsolutePath(workspace, 'README.md');
    await actions.copyCurrentContent(workspace, 'README.md');
    await actions.openCurrentFile(workspace, 'README.md');
    await actions.revealFile(workspace, 'README.md');

    const absolutePath = path.join(workspace.path, 'README.md');
    expect(copied).toEqual(['README.md', absolutePath, '真实内容\n']);
    expect(opened).toEqual([absolutePath]);
    expect(revealed).toEqual([absolutePath]);
  });

  it('拒绝越界、排除目录和非 UTF-8 当前内容', async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.workspace, 'node_modules'));
    await writeFile(path.join(fixture.workspace, 'node_modules', 'hidden.txt'), 'hidden', 'utf8');
    await writeFile(path.join(fixture.workspace, 'binary.bin'), Buffer.from([0xff, 0xfe]));
    await writeFile(
      path.join(fixture.workspace, 'too-large.txt'),
      Buffer.alloc(DEFAULT_TASK_WORKSPACE_MAX_FILE_BYTES + 1, 0x61),
    );
    const actions = new ElectronTaskWorkspaceFileActions(fixture.ledger, {
      copyText: () => undefined,
      openPath: async () => '',
      showItemInFolder: () => undefined,
    });
    const workspace = await fixture.ledger.validateWorkspace(fixture.workspace);

    await expect(actions.copyAbsolutePath(workspace, '..\\outside.txt'))
      .rejects.toMatchObject({ code: 'file_action_path_invalid' });
    await expect(actions.copyCurrentContent(workspace, 'node_modules/hidden.txt'))
      .rejects.toMatchObject({ code: 'file_action_path_invalid' });
    await expect(actions.copyCurrentContent(workspace, 'binary.bin'))
      .rejects.toMatchObject({ code: 'file_action_not_text' });
    await expect(actions.copyCurrentContent(workspace, 'too-large.txt'))
      .rejects.toMatchObject({ code: 'file_action_too_large' });
  });

  it('原生或文件系统失败只返回脱敏诊断，不暴露工作区绝对路径', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.workspace, 'README.md'), 'content', 'utf8');
    const actions = new ElectronTaskWorkspaceFileActions(fixture.ledger, {
      copyText: () => undefined,
      openPath: async filePath => `无法打开 ${filePath}`,
      showItemInFolder: () => undefined,
    });
    const workspace = await fixture.ledger.validateWorkspace(fixture.workspace);

    await expect(actions.openCurrentFile(workspace, 'README.md')).rejects.toMatchObject({
      code: 'file_action_open_failed',
      message: '系统默认应用无法打开当前文件。',
    });
    await expect(actions.copyCurrentContent(workspace, 'missing.md')).rejects.toMatchObject({
      code: 'file_action_copy_failed',
      message: '无法复制当前文件内容。',
    });
  });

  it.skipIf(process.platform === 'win32')('拒绝符号链接文件', async () => {
    const fixture = await createFixture();
    const outside = path.join(fixture.root, 'outside.txt');
    await writeFile(outside, 'outside', 'utf8');
    await symlink(outside, path.join(fixture.workspace, 'link.txt'), 'file');
    const actions = new ElectronTaskWorkspaceFileActions(fixture.ledger, {
      copyText: () => undefined,
      openPath: async () => '',
      showItemInFolder: () => undefined,
    });
    const workspace = await fixture.ledger.validateWorkspace(fixture.workspace);

    await expect(actions.openCurrentFile(workspace, 'link.txt'))
      .rejects.toMatchObject({ code: 'file_action_target_invalid' });
  });
});

async function createFixture(): Promise<{
  readonly ledger: TaskWorkspaceLedger;
  readonly root: string;
  readonly workspace: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-task-file-actions-'));
  temporaryRoots.push(root);
  const vault = path.join(root, 'vault');
  const state = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  await Promise.all([mkdir(vault), mkdir(state), mkdir(workspace)]);
  return {
    ledger: new TaskWorkspaceLedger({ stateDirectory: state, vaultPath: vault }),
    root,
    workspace,
  };
}
