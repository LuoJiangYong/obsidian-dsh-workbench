import {
  lstat,
  readFile,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_TASK_WORKSPACE_MAX_FILE_BYTES,
  TaskWorkspaceError,
  type TaskWorkspaceSelection,
} from './task-workspace';
import {
  isPathContained,
  taskPathHasExcludedDirectory,
} from './task-workspace-policy';
import type { TaskWorkspaceValidator } from './task-workspace-host';

export interface TaskWorkspaceFileActionsHost {
  copyAbsolutePath(workspace: TaskWorkspaceSelection, relativePath: string): Promise<void>;
  copyCurrentContent(workspace: TaskWorkspaceSelection, relativePath: string): Promise<void>;
  copyRelativePath(workspace: TaskWorkspaceSelection, relativePath: string): Promise<void>;
  openCurrentFile(workspace: TaskWorkspaceSelection, relativePath: string): Promise<void>;
  revealFile(workspace: TaskWorkspaceSelection, relativePath: string): Promise<void>;
}

interface NativeFileActions {
  copyText(value: string): void;
  openPath(filePath: string): Promise<string>;
  showItemInFolder(filePath: string): void;
}

export class ElectronTaskWorkspaceFileActions implements TaskWorkspaceFileActionsHost {
  private nativeActions: NativeFileActions | undefined;

  constructor(
    private readonly validator: TaskWorkspaceValidator,
    nativeActions?: NativeFileActions,
  ) {
    this.nativeActions = nativeActions;
  }

  async copyAbsolutePath(
    workspace: TaskWorkspaceSelection,
    relativePath: string,
  ): Promise<void> {
    await this.runAction('file_action_copy_failed', '无法复制当前文件路径。', async () => {
      this.getNativeActions().copyText(
        await this.resolveSafePath(workspace, relativePath, false),
      );
    });
  }

  async copyCurrentContent(
    workspace: TaskWorkspaceSelection,
    relativePath: string,
  ): Promise<void> {
    await this.runAction('file_action_copy_failed', '无法复制当前文件内容。', async () => {
      const filePath = await this.resolveSafePath(workspace, relativePath, true);
      const content = await readFile(filePath);
      if (content.byteLength > DEFAULT_TASK_WORKSPACE_MAX_FILE_BYTES) {
        throw new TaskWorkspaceError('file_action_too_large', '当前文件超过可复制上限。');
      }
      const text = content.toString('utf8');
      if (!Buffer.from(text, 'utf8').equals(content)) {
        throw new TaskWorkspaceError('file_action_not_text', '当前文件不是可复制的 UTF-8 文本。');
      }
      this.getNativeActions().copyText(text);
    });
  }

  async copyRelativePath(
    workspace: TaskWorkspaceSelection,
    relativePath: string,
  ): Promise<void> {
    await this.runAction('file_action_copy_failed', '无法复制当前文件路径。', async () => {
      await this.resolveSafePath(workspace, relativePath, false);
      this.getNativeActions().copyText(normalizeRelativePath(relativePath));
    });
  }

  async openCurrentFile(
    workspace: TaskWorkspaceSelection,
    relativePath: string,
  ): Promise<void> {
    await this.runAction('file_action_open_failed', '系统默认应用无法打开当前文件。', async () => {
      const filePath = await this.resolveSafePath(workspace, relativePath, true);
      const error = await this.getNativeActions().openPath(filePath);
      if (error) {
        throw new TaskWorkspaceError(
          'file_action_open_failed',
          '系统默认应用无法打开当前文件。',
        );
      }
    });
  }

  async revealFile(
    workspace: TaskWorkspaceSelection,
    relativePath: string,
  ): Promise<void> {
    await this.runAction('file_action_reveal_failed', '资源管理器无法定位当前文件。', async () => {
      const filePath = await this.resolveSafePath(workspace, relativePath, false);
      this.getNativeActions().showItemInFolder(filePath);
    });
  }

  private getNativeActions(): NativeFileActions {
    this.nativeActions ??= loadNativeFileActions();
    return this.nativeActions;
  }

  private async runAction(
    code: string,
    message: string,
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (error instanceof TaskWorkspaceError) throw error;
      throw new TaskWorkspaceError(code, message);
    }
  }

  private async resolveSafePath(
    workspace: TaskWorkspaceSelection,
    relativePath: string,
    requireCurrentFile: boolean,
  ): Promise<string> {
    const currentWorkspace = await this.validator.validateWorkspace(workspace.path);
    if (currentWorkspace.path !== workspace.path) {
      throw new TaskWorkspaceError('workspace_identity_changed', '任务工作区真实路径已经变化。');
    }
    if (!isSafeRelativePath(relativePath)
      || taskPathHasExcludedDirectory(currentWorkspace.path, relativePath)) {
      throw new TaskWorkspaceError('file_action_path_invalid', '文件路径不在允许的任务工作区范围内。');
    }
    const target = path.resolve(currentWorkspace.path, relativePath);
    if (!isPathContained(currentWorkspace.path, target)) {
      throw new TaskWorkspaceError('file_action_path_escape', '文件路径越过任务工作区。');
    }
    if (!requireCurrentFile) {
      try {
        return await this.assertCurrentFile(currentWorkspace.path, target);
      } catch (error) {
        const candidate = error as NodeJS.ErrnoException;
        if (candidate.code === 'ENOENT') return target;
        throw error;
      }
    }
    return await this.assertCurrentFile(currentWorkspace.path, target);
  }

  private async assertCurrentFile(workspacePath: string, target: string): Promise<string> {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new TaskWorkspaceError('file_action_target_invalid', '当前目标不是普通文件。');
    }
    const canonical = await realpath(target);
    if (!isPathContained(workspacePath, canonical)) {
      throw new TaskWorkspaceError('file_action_path_escape', '当前文件越过任务工作区。');
    }
    return canonical;
  }
}

function loadNativeFileActions(): NativeFileActions {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Obsidian 桌面 renderer 运行时提供 Electron。
  const electron = require('electron') as {
    readonly clipboard?: { writeText(value: string): void };
    readonly shell?: {
      openPath(filePath: string): Promise<string>;
      showItemInFolder(filePath: string): void;
    };
  };
  if (!electron.clipboard || !electron.shell) {
    throw new Error('Obsidian 桌面文件操作接口不可用。');
  }
  const { clipboard, shell } = electron;
  return {
    copyText: (value) => clipboard.writeText(value),
    openPath: async (filePath) => await shell.openPath(filePath),
    showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
  };
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && !path.isAbsolute(value)
    && !value.includes('\0')
    && !value.split(/[\\/]+/u).includes('..');
}

function normalizeRelativePath(value: string): string {
  return value.split(/[\\/]+/u).join('/');
}
