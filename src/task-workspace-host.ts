import type {
  TaskWorkspaceSelection,
} from './task-workspace';

export interface TaskWorkspaceValidator {
  validateWorkspace(workspacePath: string): Promise<TaskWorkspaceSelection>;
}

export interface TaskWorkspaceHost {
  selectWorkspace(): Promise<TaskWorkspaceSelection | null>;
}

export type NativeDirectoryPicker = () => Promise<string | null>;

interface ElectronRemoteApi {
  readonly dialog: {
    showOpenDialog(options: {
      readonly properties: readonly ['openDirectory'];
      readonly title: string;
    }): Promise<{
      readonly canceled: boolean;
      readonly filePaths: readonly string[];
    }>;
  };
}

export class ElectronTaskWorkspaceHost implements TaskWorkspaceHost {
  constructor(
    private readonly validator: TaskWorkspaceValidator,
    private readonly pickDirectory: NativeDirectoryPicker = pickNativeDirectory,
  ) {}

  async selectWorkspace(): Promise<TaskWorkspaceSelection | null> {
    const selectedPath = await this.pickDirectory();
    if (selectedPath === null) return null;
    return await this.validator.validateWorkspace(selectedPath);
  }
}

async function pickNativeDirectory(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Obsidian exposes Electron only in the desktop renderer at runtime.
  const electron = require('electron') as { readonly remote?: ElectronRemoteApi };
  if (!electron.remote) throw new Error('Obsidian 桌面端文件夹选择器不可用。');
  const result = await electron.remote.dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择 Vault 外任务工作区',
  });
  if (result.canceled) return null;
  const selectedPath = result.filePaths[0];
  if (!selectedPath) throw new Error('未返回有效的任务工作区。');
  return selectedPath;
}
