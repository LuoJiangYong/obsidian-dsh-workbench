import { ItemView, setIcon, type IconName, type WorkspaceLeaf } from 'obsidian';

import type { DshHealthResult } from './dsh-health';
import { DEEPSEEK_WHALE_ICON } from './icons';
import type { NewTaskConversationHost } from './new-task-conversation';
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_QUICK_ASSISTANT = 'deepseek-harness-quick-assistant-view';

interface QuickAssistantViewOptions {
  readonly conversationHost: NewTaskConversationHost;
  readonly getContextSummary: () => string;
  readonly getDshHealth: () => DshHealthResult;
}

export class QuickAssistantView extends ItemView {
  private detachConversation: (() => void) | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly options: QuickAssistantViewOptions,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_QUICK_ASSISTANT;
  }

  getDisplayText(): string {
    return '任务环境';
  }

  getIcon(): IconName {
    return DEEPSEEK_WHALE_ICON;
  }

  async onOpen(): Promise<void> {
    this.detachConversation ??= this.options.conversationHost.subscribe(() => this.render());
    this.render();
  }

  render(): void {
    const snapshot = this.options.conversationHost.getSnapshot();
    const state = createWorkbenchState(
      this.options.getDshHealth(),
      snapshot.runtimeStatus,
    );
    const session = snapshot.session;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dsh-task-environment');

    const headerEl = contentEl.createEl('header', { cls: 'dsh-task-environment__header' });
    const iconEl = headerEl.createSpan({ cls: 'dsh-task-environment__header-icon' });
    setIcon(iconEl, DEEPSEEK_WHALE_ICON);
    const headerCopyEl = headerEl.createDiv();
    headerCopyEl.createEl('h3', { text: '任务环境' });
    headerCopyEl.createEl('p', {
      text: '投影当前会话的公开环境事实；关闭此栏不影响中央任务。',
    });

    this.renderSection(
      contentEl,
      'activity',
      'DSH 运行状态',
      `${state.connectionStatus} · 健康检查：${state.healthCheckStatus}`,
    );
    this.renderSection(
      contentEl,
      'files',
      '已选笔记',
      session
        ? session.contextLabels.length > 0
          ? `${String(session.contextLabels.length)} 项：${session.contextLabels.join('、')}`
          : '本次会话未加入只读笔记'
        : this.options.getContextSummary(),
    );
    this.renderSection(
      contentEl,
      'folder-open',
      '外部工作区',
      session?.mode === 'task' && session.workspace
        ? `${session.workspace.name} · 仅本次会话可写`
        : '未选择外部写入工作区',
    );
    this.renderSection(
      contentEl,
      'shield-check',
      '当前权限',
      permissionSummary(snapshot),
    );
    this.renderSection(
      contentEl,
      'cpu',
      '模型与预设',
      '由 DSH 配置管理；当前协议未公开具体标识',
    );
    this.renderSection(
      contentEl,
      'wrench',
      '已观察工具',
      observedToolsSummary(snapshot.tools.map(tool => tool.toolName)),
    );
    this.renderSection(
      contentEl,
      'file-diff',
      '最近文件变更',
      latestTaskTurnSummary(snapshot.taskTurns[snapshot.taskTurns.length - 1]),
    );

    contentEl.createEl('p', {
      cls: 'dsh-task-environment__boundary',
      text: session
        ? '只显示公开协议与逐轮账本可证明的信息；不显示私有推理、完整路径或虚构历史。'
        : '尚未开始会话；当前只显示已选择但尚未发送的知识库范围。',
    });
  }

  async onClose(): Promise<void> {
    this.detachConversation?.();
    this.detachConversation = undefined;
    this.contentEl.empty();
  }

  private renderSection(
    parentEl: HTMLElement,
    icon: IconName,
    label: string,
    value: string,
  ): void {
    const sectionEl = parentEl.createEl('section', { cls: 'dsh-task-environment__section' });
    const iconEl = sectionEl.createSpan({ cls: 'dsh-task-environment__section-icon' });
    setIcon(iconEl, icon);
    const copyEl = sectionEl.createDiv();
    copyEl.createEl('h4', { text: label });
    copyEl.createEl('p', { text: value });
  }
}

function permissionSummary(
  snapshot: ReturnType<NewTaskConversationHost['getSnapshot']>,
): string {
  if (snapshot.permission) return `等待决定：${snapshot.permission.toolName}`;
  if (!snapshot.session) return '尚未开始会话';
  return snapshot.session.mode === 'task'
    ? '文件工具逐次确认 · 仅本次外部工作区可写'
    : '只读对话 · 不开放 DSH 工具';
}

function observedToolsSummary(toolNames: readonly string[]): string {
  const names = [...new Set(toolNames)];
  return names.length > 0 ? names.join('、') : '当前会话尚未观察到工具调用';
}

function latestTaskTurnSummary(
  result: ReturnType<NewTaskConversationHost['getSnapshot']>['taskTurns'][number] | undefined,
): string {
  if (!result) return '当前会话没有已核对的文件变更';
  if (result.undone) return `${String(result.changes.length)} 个文件 · 已安全撤销`;
  if (result.additions === null || result.deletions === null) {
    return `${String(result.changes.length)} 个文件 · 文本统计不可用`;
  }
  return `${String(result.changes.length)} 个文件 · +${String(result.additions)} -${String(result.deletions)}`;
}
