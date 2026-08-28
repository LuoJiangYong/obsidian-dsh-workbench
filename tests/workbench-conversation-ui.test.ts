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
import { WorkbenchView } from '../src/workbench-view';
import { App, type MockElement, mockObsidian, resetMockObsidian } from './mocks/obsidian';

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
      runDshHealthCheck: async () => undefined,
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
    });
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
      runDshHealthCheck: async () => undefined,
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
      runDshHealthCheck: async () => undefined,
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

    await content.findAllByClass('dsh-new-task-mode__button')[0]?.click();
    expect(content.allText()).toEqual(expect.arrayContaining(['任务完成']));
  });
});

class FakeConversationHost implements NewTaskConversationHost {
  cancelCount = 0;
  readonly decisions: BridgePermissionDecision[] = [];
  private readonly listeners = new Set<() => void>();
  private snapshot: NewTaskConversationSnapshot = {
    error: null,
    messages: [],
    mode: null,
    permission: null,
    phase: 'idle',
    runtimeStatus: 'disconnected',
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

  async submit(input: NewTaskConversationSubmitInput): Promise<boolean> {
    this.submissions.push(input);
    return true;
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
