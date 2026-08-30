import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BridgePermissionDecision } from '../src/bridge-protocol';
import type {
  NewTaskConversationHost,
  NewTaskConversationSnapshot,
  NewTaskConversationSubmitInput,
} from '../src/new-task-conversation';
import type {
  NewTaskContextHost,
  NewTaskContextPickerRequest,
} from '../src/obsidian-context-host';
import type { TaskWorkspaceHost } from '../src/task-workspace-host';
import type { TaskWorkspaceFileActionsHost } from '../src/task-workspace-file-actions';
import type { TaskWorkspaceTurnResult } from '../src/task-workspace';
import { WorkbenchView } from '../src/workbench-view';
import {
  App,
  MenuItem,
  type MockElement,
  mockObsidian,
  resetMockObsidian,
} from './mocks/obsidian';

describe('Workbench 真实对话界面', () => {
  beforeEach(() => resetMockObsidian());

  it('发送前展示只读审阅，取消保留草稿，确认后清空草稿并显示流式结果', async () => {
    const app = new App();
    const leaf = app.workspace.getLeaf('tab');
    const conversationHost = new FakeConversationHost();
    const view = new WorkbenchView(leaf as never, {
      conversationHost,
      contextHost: contextHost(),
      getDshHealth: () => ({ status: 'unchecked' }),
      onContextsChanged: () => undefined,
      openEnvironmentPanel: async () => undefined,
      runDshHealthCheck: async () => undefined,
      taskWorkspaceFileActions: taskWorkspaceFileActions(),
      taskWorkspaceHost: taskWorkspaceHost(),
    });
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    const textarea = content.findAllByTag('textarea')[0];
    if (!textarea) throw new Error('任务输入未渲染');
    expect(textarea.attributes.get('rows')).toBe('4');
    expect(content.allText()).not.toContain('与 DeepSeek Harness 对话，定义任务、选择知识库内容');
    textarea.value = '总结本轮材料';
    await textarea.trigger('input');
    const send = content.findAllByClass('dsh-new-task-composer__send')[0];
    expect(send?.disabled).toBe(false);

    await send?.click();
    const cancelledReview = mockObsidian.openModals[mockObsidian.openModals.length - 1];
    expect(cancelledReview?.title).toBe('确认发送');
    expect(cancelledReview?.contentEl.allText()).toEqual(expect.arrayContaining([
      '本次为只读对话：仅发送下列任务和你明确选择的笔记；不开放 DSH 工具，不写入知识库。',
      '总结本轮材料',
      '无',
    ]));
    await cancelledReview?.contentEl.findAllByTag('button')[0]?.click();
    expect(content.findAllByTag('textarea')[0]?.value).toBe('总结本轮材料');
    expect(conversationHost.submissions).toHaveLength(0);

    await content.findAllByClass('dsh-new-task-composer__send')[0]?.click();
    const confirmedReview = mockObsidian.openModals[mockObsidian.openModals.length - 1];
    await confirmedReview?.contentEl.findAllByClass('dsh-new-task-review__confirm')[0]?.click();
    expect(conversationHost.submissions).toHaveLength(1);
    expect(conversationHost.submissions[0]).toMatchObject({
      contexts: [],
      draft: '总结本轮材料',
      mode: 'chat',
    });
    expect(content.findAllByTag('textarea')[0]?.value).toBe('');

    conversationHost.emit({
      messages: [
        {
          delivery: 'sent',
          id: 'user-1',
          role: 'user',
          text: '总结本轮材料',
          turnId: 'turn-1',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: '正在总结',
          turnId: 'turn-1',
        },
      ],
      phase: 'running',
      runtimeStatus: 'connected',
      session: conversationSession('chat', '总结本轮材料'),
    });
    expect(content.allText()).not.toContain('今天想让 DeepSeek Harness 做什么？');
    expect(content.allText()).not.toContain('执行前确认');
    expect(content.allText()).toEqual(expect.arrayContaining([
      '总结本轮材料',
      '任务环境',
      '新建任务',
    ]));
    expect(content.findAllByClass('dsh-new-task-conversation')[0]
      ?.attributes.get('aria-busy')).toBe('true');
    expect(content.findAllByClass('dsh-new-task-composer__input')[0]
      ?.attributes.get('rows')).toBe('3');
    expect(content.allText()).toEqual(expect.arrayContaining([
      '你',
      '总结本轮材料',
      'DeepSeek Harness',
      '正在总结',
      'DSH 正在回复…',
      '停止',
    ]));
    await content.findAllByClass('dsh-new-task-composer__send')[0]?.click();
    expect(conversationHost.cancelCount).toBe(1);
  });

  it('只提供本次权限决定并把错误作为可访问终态呈现', async () => {
    const app = new App();
    const conversationHost = new FakeConversationHost();
    const view = new WorkbenchView(app.workspace.getLeaf('tab') as never, {
      conversationHost,
      contextHost: contextHost(),
      getDshHealth: () => ({ status: 'unchecked' }),
      onContextsChanged: () => undefined,
      openEnvironmentPanel: async () => undefined,
      runDshHealthCheck: async () => undefined,
      taskWorkspaceFileActions: taskWorkspaceFileActions(),
      taskWorkspaceHost: taskWorkspaceHost(),
    });
    await view.onOpen();
    conversationHost.emit({
      error: { code: 'permission_pending', message: '需要确认。' },
      permission: {
        reason: '读取文件',
        requestId: 'permission-1',
        resolving: false,
        toolName: 'read_file',
        turnId: 'turn-1',
      },
      phase: 'awaiting_permission',
      session: conversationSession('chat', '检查内容'),
    });

    const content = view.contentEl as unknown as MockElement;
    expect(content.allText()).toEqual(expect.arrayContaining([
      '请求调用 read_file',
      '读取文件',
      '决定仅对本次请求有效。',
      '拒绝',
      '仅本次允许',
      '需要确认。',
    ]));
    expect(content.findAllByClass('dsh-new-task-conversation__error')[0]
      ?.attributes.get('role')).toBe('alert');
    await content.findAllByClass('dsh-new-task-permission__actions')[0]
      ?.findAllByTag('button')[1]?.click();
    expect(conversationHost.decisions).toEqual(['allow-once']);
  });

  it('重开同一视图恢复插件生命周期内正式页，并只由显式新建任务返回开启页', async () => {
    const app = new App();
    const conversationHost = new FakeConversationHost();
    const workspace = {
      name: 'external-project',
      path: 'C:\\private\\external-project',
    } as const;
    conversationHost.emit({
      mode: 'task',
      phase: 'completed',
      session: {
        contextLabels: ['Vault 文件 · 项目/说明.md'],
        mode: 'task',
        title: '整理项目说明',
        workspace,
      },
    });
    let environmentOpenCount = 0;
    const view = new WorkbenchView(app.workspace.getLeaf('tab') as never, {
      conversationHost,
      contextHost: contextHost(),
      getDshHealth: () => ({ status: 'unchecked' }),
      onContextsChanged: () => undefined,
      openEnvironmentPanel: async () => {
        environmentOpenCount += 1;
      },
      runDshHealthCheck: async () => undefined,
      taskWorkspaceFileActions: taskWorkspaceFileActions(),
      taskWorkspaceHost: taskWorkspaceHost(),
    });
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    expect(content.allText()).toEqual(expect.arrayContaining([
      '整理项目说明',
      'external-project · 仅本次工作区可写 · 文件工具逐次确认',
      '任务环境',
      '新建任务',
    ]));
    expect(content.allText()).not.toContain('今天想让 DeepSeek Harness 做什么？');
    expect(content.allText().join('\n')).not.toContain('C:\\private');
    await content.findAllByClass('dsh-formal-conversation__actions')[0]
      ?.findAllByTag('button')[0]?.click();
    expect(environmentOpenCount).toBe(1);

    await view.onClose();
    await view.onOpen();
    expect(content.allText()).toContain('整理项目说明');
    expect(content.allText()).not.toContain('今天想让 DeepSeek Harness 做什么？');

    await content.findAllByClass('dsh-formal-conversation__actions')[0]
      ?.findAllByTag('button')[1]?.click();
    const resetModal = mockObsidian.openModals[mockObsidian.openModals.length - 1];
    expect(resetModal?.title).toBe('新建任务');
    expect(resetModal?.contentEl.allText()).toEqual(expect.arrayContaining([
      expect.stringContaining('当前版本不提供跨重启的最近会话恢复'),
    ]));
    await resetModal?.contentEl.findAllByClass('dsh-new-task-reset__actions')[0]
      ?.findAllByTag('button')[1]?.click();
    expect(content.allText()).toContain('今天想让 DeepSeek Harness 做什么？');
    expect(content.allText()).not.toContain('整理项目说明');
  });

  it('任务模式选择 Vault 外工作区后才允许发送，并在结束时显示真实变更摘要', async () => {
    const app = new App();
    const conversationHost = new FakeConversationHost();
    const workspaceHost: TaskWorkspaceHost = {
      selectWorkspace: async () => ({
        name: 'external-project',
        path: 'C:\\workspaces\\external-project',
      }),
    };
    const view = new WorkbenchView(app.workspace.getLeaf('tab') as never, {
      conversationHost,
      contextHost: contextHost(),
      getDshHealth: () => ({ status: 'unchecked' }),
      onContextsChanged: () => undefined,
      openEnvironmentPanel: async () => undefined,
      runDshHealthCheck: async () => undefined,
      taskWorkspaceFileActions: taskWorkspaceFileActions(),
      taskWorkspaceHost: workspaceHost,
    });
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    await content.findAllByClass('dsh-new-task-mode__button')[1]?.click();
    const textarea = content.findAllByTag('textarea')[0];
    if (!textarea) throw new Error('任务输入未渲染');
    textarea.value = '更新项目说明';
    await textarea.trigger('input');
    expect(content.findAllByClass('dsh-new-task-composer__send')[0]?.disabled).toBe(true);

    await content.findAllByClass('dsh-task-workspace__open')[0]?.click();
    await vi.waitFor(() => {
      expect(content.allText()).toEqual(expect.arrayContaining([
        '任务工作区',
        'external-project',
        'Vault 外目录 · 仅本次任务会话可写 · 文件工具逐次确认',
      ]));
    });
    expect(content.findAllByClass('dsh-new-task-composer__send')[0]?.disabled).toBe(false);

    await content.findAllByClass('dsh-new-task-composer__send')[0]?.click();
    const review = mockObsidian.openModals[mockObsidian.openModals.length - 1];
    expect(review?.contentEl.allText()).toEqual(expect.arrayContaining([
      '本次任务只允许访问所选 Vault 外工作区；文件工具逐次确认，不开放 Shell、网络、Skill 或子代理，也不写入知识库。',
      'external-project（Vault 外目录）',
    ]));
    await review?.contentEl.findAllByClass('dsh-new-task-review__confirm')[0]?.click();
    expect(conversationHost.submissions[0]).toMatchObject({
      draft: '更新项目说明',
      mode: 'task',
      workspace: {
        name: 'external-project',
        path: 'C:\\workspaces\\external-project',
      },
    });

    conversationHost.emit({
      mode: 'task',
      phase: 'completed',
      session: conversationSession('task', '更新项目说明', {
        name: 'external-project',
        path: 'C:\\workspaces\\external-project',
      }),
      taskTurns: [{
        additions: 4,
        canUndo: true,
        changes: [{
          additions: 4,
          deletions: 1,
          kind: 'modified',
          relativePath: 'README.md',
          review: { after: 'after', before: 'before' },
          undoable: true,
        }],
        completedAt: '2026-08-28T00:00:00.000Z',
        deletions: 1,
        turnId: 'turn-task-1',
        undone: false,
        workspace: {
          name: 'external-project',
          path: 'C:\\workspaces\\external-project',
        },
      }],
    });
    expect(content.allText()).toEqual(expect.arrayContaining([
      '已编辑 1 个文件',
      'external-project · +4 -1 · 变更事实已记录',
      '任务完成',
    ]));

    expect(content.findAllByClass('dsh-new-task-mode__button')).toHaveLength(0);
    expect(content.allText()).toEqual(expect.arrayContaining(['任务完成', '更新项目说明']));
  });

  it('每轮默认展示三个真实文件，支持展开、审核、原生右键操作和二次确认撤销', async () => {
    const app = new App();
    const conversationHost = new FakeConversationHost();
    const copiedRelativePaths: string[] = [];
    const fileActions = taskWorkspaceFileActions();
    fileActions.copyRelativePath = async (_workspace, relativePath) => {
      copiedRelativePaths.push(relativePath);
    };
    const view = new WorkbenchView(app.workspace.getLeaf('tab') as never, {
      conversationHost,
      contextHost: contextHost(),
      getDshHealth: () => ({ status: 'unchecked' }),
      onContextsChanged: () => undefined,
      openEnvironmentPanel: async () => undefined,
      runDshHealthCheck: async () => undefined,
      taskWorkspaceFileActions: fileActions,
      taskWorkspaceHost: taskWorkspaceHost(),
    });
    await view.onOpen();
    const result = taskTurnResult(5);
    conversationHost.emit({
      mode: 'task',
      phase: 'completed',
      session: conversationSession('task', '批量更新文件', result.workspace),
      taskTurns: [result],
    });

    const content = view.contentEl as unknown as MockElement;
    expect(content.findAllByClass('dsh-task-result__file')).toHaveLength(3);
    expect(content.allText()).toEqual(expect.arrayContaining([
      '已编辑 5 个文件',
      '再显示 2 个文件',
    ]));
    await content.findAllByClass('dsh-task-result__expand')[0]?.click();
    expect(content.findAllByClass('dsh-task-result__file')).toHaveLength(5);

    const firstFile = content.findAllByClass('dsh-task-result__file')[0];
    const preventDefault = vi.fn();
    await firstFile?.trigger('contextmenu', { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    const menu = mockObsidian.openMenus[0];
    const items = menu?.items.filter((item): item is MenuItem => item instanceof MenuItem) ?? [];
    expect(items.map(item => item.title)).toEqual([
      '审核本次变更',
      '使用默认应用打开',
      '在资源管理器中显示',
      '复制相对路径',
      '复制完整路径',
      '复制当前文件内容',
    ]);
    await items.find(item => item.title === '复制相对路径')?.click();
    await vi.waitFor(() => expect(copiedRelativePaths).toEqual(['file-1.md']));
    expect(mockObsidian.notices).toContain('已复制相对路径');

    await firstFile?.click();
    const review = mockObsidian.openModals[mockObsidian.openModals.length - 1];
    expect(review?.title).toBe('审核文件变更');
    expect(review?.contentEl.allText()).toEqual(expect.arrayContaining([
      'file-1.md',
      '修改前 1',
      '修改后 1',
    ]));

    await content.findAllByClass('dsh-task-result__actions')[0]
      ?.findAllByTag('button')[0]?.click();
    const undo = mockObsidian.openModals[mockObsidian.openModals.length - 1];
    expect(undo?.title).toBe('确认撤销本轮文件变更');
    expect(undo?.contentEl.allText()).toEqual(expect.arrayContaining([
      expect.stringContaining('任何文件在任务结束后又有变化时，整个撤销都不会写入。'),
      '修改 file-1.md',
      '修改 file-5.md',
    ]));
    await undo?.contentEl.findAllByClass('dsh-task-undo__actions')[0]
      ?.findAllByTag('button')[1]?.click();
    await vi.waitFor(() => {
      expect(content.allText()).toEqual(expect.arrayContaining(['已撤销 5 个文件']));
    });
    expect(mockObsidian.notices).toContain('已安全撤销 5 个文件的本轮变更');
  });

  it('撤销冲突时保持确认窗口并把零写入失败展示为可访问错误', async () => {
    const app = new App();
    const conversationHost = new FakeConversationHost();
    conversationHost.undoFailure = new Error('README.md 已在任务后变化；未写入任何文件。');
    const view = new WorkbenchView(app.workspace.getLeaf('tab') as never, {
      conversationHost,
      contextHost: contextHost(),
      getDshHealth: () => ({ status: 'unchecked' }),
      onContextsChanged: () => undefined,
      openEnvironmentPanel: async () => undefined,
      runDshHealthCheck: async () => undefined,
      taskWorkspaceFileActions: taskWorkspaceFileActions(),
      taskWorkspaceHost: taskWorkspaceHost(),
    });
    await view.onOpen();
    conversationHost.emit({
      mode: 'task',
      phase: 'completed',
      session: conversationSession('task', '更新 README', taskTurnResult(1).workspace),
      taskTurns: [taskTurnResult(1)],
    });

    const content = view.contentEl as unknown as MockElement;
    await content.findAllByClass('dsh-task-result__actions')[0]
      ?.findAllByTag('button')[0]?.click();
    const undo = mockObsidian.openModals[mockObsidian.openModals.length - 1];
    await undo?.contentEl.findAllByClass('dsh-task-undo__actions')[0]
      ?.findAllByTag('button')[1]?.click();
    await vi.waitFor(() => {
      expect(undo?.contentEl.findAllByClass('dsh-task-undo__error')[0]?.text)
        .toBe('README.md 已在任务后变化；未写入任何文件。');
    });
    expect(undo?.contentEl.findAllByClass('dsh-task-undo__error')[0]
      ?.attributes.get('role')).toBe('alert');
    expect(content.allText()).toEqual(expect.arrayContaining([
      'README.md 已在任务后变化；未写入任何文件。',
    ]));
  });
});

class FakeConversationHost implements NewTaskConversationHost {
  cancelCount = 0;
  readonly decisions: BridgePermissionDecision[] = [];
  undoFailure: Error | undefined;
  private readonly listeners = new Set<() => void>();
  private snapshot: NewTaskConversationSnapshot = {
    error: null,
    messages: [],
    mode: null,
    permission: null,
    phase: 'idle',
    runtimeStatus: 'disconnected',
    session: null,
    taskTurns: [],
    tools: [],
  };
  readonly submissions: NewTaskConversationSubmitInput[] = [];

  async cancel(): Promise<boolean> {
    this.cancelCount += 1;
    return true;
  }

  async dispose(): Promise<void> {}

  emit(patch: Partial<NewTaskConversationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  getSnapshot(): NewTaskConversationSnapshot {
    return this.snapshot;
  }

  async resolvePermission(decision: BridgePermissionDecision): Promise<boolean> {
    this.decisions.push(decision);
    return true;
  }

  async startNewTask(): Promise<boolean> {
    this.emit({
      error: null,
      messages: [],
      mode: null,
      permission: null,
      phase: 'idle',
      runtimeStatus: 'disconnected',
      session: null,
      taskTurns: [],
      tools: [],
    });
    return true;
  }

  async submit(input: NewTaskConversationSubmitInput): Promise<boolean> {
    this.submissions.push(input);
    return true;
  }

  async undoTaskTurn(turnId: string): Promise<TaskWorkspaceTurnResult> {
    if (this.undoFailure) throw this.undoFailure;
    const current = this.snapshot.taskTurns.find(result => result.turnId === turnId);
    if (!current) throw new Error('没有找到任务变更结果。');
    const undone = { ...current, canUndo: false, undone: true };
    this.emit({
      taskTurns: this.snapshot.taskTurns.map(
        result => result.turnId === turnId ? undone : result,
      ),
    });
    return undone;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function contextHost(): NewTaskContextHost {
  return {
    dispose: () => undefined,
    openPicker: (_request: NewTaskContextPickerRequest) => undefined,
    readVaultText: async (path: string) => ({ content: '', path }),
  };
}

function taskWorkspaceHost(): TaskWorkspaceHost {
  return { selectWorkspace: async () => null };
}

function taskWorkspaceFileActions(): TaskWorkspaceFileActionsHost {
  return {
    copyAbsolutePath: async () => undefined,
    copyCurrentContent: async () => undefined,
    copyRelativePath: async () => undefined,
    openCurrentFile: async () => undefined,
    revealFile: async () => undefined,
  };
}

function taskTurnResult(changeCount: number): TaskWorkspaceTurnResult {
  return {
    additions: changeCount,
    canUndo: true,
    changes: Array.from({ length: changeCount }, (_, index) => ({
      additions: 1,
      deletions: 1,
      kind: 'modified' as const,
      relativePath: `file-${String(index + 1)}.md`,
      review: {
        after: `修改后 ${String(index + 1)}`,
        before: `修改前 ${String(index + 1)}`,
      },
      undoable: true,
    })),
    completedAt: '2026-08-29T00:00:00.000Z',
    deletions: changeCount,
    turnId: 'turn-task-files',
    undone: false,
    workspace: {
      name: 'external-project',
      path: 'C:\\workspaces\\external-project',
    },
  };
}

function conversationSession(
  mode: 'chat' | 'task',
  title: string,
  workspace: TaskWorkspaceTurnResult['workspace'] | null = null,
): NonNullable<NewTaskConversationSnapshot['session']> {
  return {
    contextLabels: [],
    mode,
    title,
    workspace,
  };
}
