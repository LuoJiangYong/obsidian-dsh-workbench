import { beforeEach, describe, expect, it } from 'vitest';

import type { BridgePermissionDecision } from '../src/bridge-protocol';
import type {
  NewTaskConversationHost,
  NewTaskConversationSnapshot,
  NewTaskConversationSubmitInput,
} from '../src/new-task-conversation';
import { QuickAssistantView } from '../src/quick-assistant-view';
import type { TaskWorkspaceTurnResult } from '../src/task-workspace';
import { App, type MockElement, resetMockObsidian } from './mocks/obsidian';

describe('原生右侧任务环境', () => {
  beforeEach(() => resetMockObsidian());

  it('只投影当前公开会话事实并在关闭后停止订阅', async () => {
    const app = new App();
    const host = new FakeConversationHost();
    host.emit({
      mode: 'task',
      phase: 'completed',
      runtimeStatus: 'connected',
      session: {
        contextLabels: ['Vault 文件 · 项目/说明.md'],
        mode: 'task',
        title: '整理项目说明',
        workspace: {
          name: 'external-project',
          path: 'C:\\private\\external-project',
        },
      },
      taskTurns: [{
        additions: 5,
        canUndo: true,
        changes: [{
          additions: 5,
          deletions: 2,
          kind: 'modified',
          relativePath: 'README.md',
          review: null,
          undoable: true,
        }],
        completedAt: '2026-08-29T00:00:00.000Z',
        deletions: 2,
        turnId: 'turn-1',
        undone: false,
        workspace: {
          name: 'external-project',
          path: 'C:\\private\\external-project',
        },
      }],
      tools: [{ callId: 'call-1', toolName: 'edit', turnId: 'turn-1' }],
    });
    const view = new QuickAssistantView(app.workspace.getRightLeaf(false) as never, {
      conversationHost: host,
      getContextSummary: () => '未选择笔记或工作范围',
      getDshHealth: () => ({ status: 'available', version: '0.1.1-rc.2' }),
    });
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    expect(view.getDisplayText()).toBe('任务环境');
    expect(content.allText()).toEqual(expect.arrayContaining([
      '任务环境',
      '已连接 DSH · 健康检查：DSH 可执行（0.1.1-rc.2）',
      '1 项：Vault 文件 · 项目/说明.md',
      'external-project · 仅本次会话可写',
      '文件工具逐次确认 · 仅本次外部工作区可写',
      '由 DSH 配置管理；当前协议未公开具体标识',
      'edit',
      '1 个文件 · +5 -2',
    ]));
    expect(content.allText().join('\n')).not.toContain('C:\\private');
    expect(content.allText().join('\n')).not.toMatch(/Think|token|完全权限/u);

    host.emit({
      permission: {
        requestId: 'permission-1',
        resolving: false,
        toolName: 'edit',
        turnId: 'turn-2',
      },
      phase: 'awaiting_permission',
    });
    expect(content.allText()).toContain('等待决定：edit');

    await view.onClose();
    host.emit({ permission: null, phase: 'completed' });
    expect(content.allText()).toEqual([]);
  });
});

class FakeConversationHost implements NewTaskConversationHost {
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

  async cancel(): Promise<boolean> { return false; }
  async dispose(): Promise<void> {}

  emit(patch: Partial<NewTaskConversationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  getSnapshot(): NewTaskConversationSnapshot { return this.snapshot; }
  async resolvePermission(_decision: BridgePermissionDecision): Promise<boolean> { return false; }
  async startNewTask(): Promise<boolean> { return false; }
  async submit(_input: NewTaskConversationSubmitInput): Promise<boolean> { return false; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async undoTaskTurn(_turnId: string): Promise<TaskWorkspaceTurnResult> {
    throw new Error('not implemented');
  }
}
