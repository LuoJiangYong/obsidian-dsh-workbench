import { describe, expect, it } from 'vitest';

import {
  ElectronTaskWorkspaceHost,
  type TaskWorkspaceValidator,
} from '../src/task-workspace-host';

describe('Obsidian 任务工作区选择宿主', () => {
  it('只把用户在原生目录选择器中确认的路径交给统一边界校验', async () => {
    const validator = new RecordingWorkspaceValidator();
    const host = new ElectronTaskWorkspaceHost(
      validator,
      async () => 'C:\\workspaces\\project',
    );

    await expect(host.selectWorkspace()).resolves.toEqual({
      name: 'project',
      path: 'C:\\workspaces\\project',
    });
    expect(validator.paths).toEqual(['C:\\workspaces\\project']);
  });

  it('用户取消时不校验、不保存也不制造错误工作区', async () => {
    const validator = new RecordingWorkspaceValidator();
    const host = new ElectronTaskWorkspaceHost(validator, async () => null);

    await expect(host.selectWorkspace()).resolves.toBeNull();
    expect(validator.paths).toEqual([]);
  });
});

class RecordingWorkspaceValidator implements TaskWorkspaceValidator {
  readonly paths: string[] = [];

  validateWorkspace = async (workspacePath: string) => {
    this.paths.push(workspacePath);
    return { name: 'project', path: workspacePath };
  };
}
