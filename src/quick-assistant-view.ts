import { ItemView, setIcon, type IconName, type WorkspaceLeaf } from 'obsidian';

import type { DshHealthResult } from './dsh-health';
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_QUICK_ASSISTANT = 'deepseek-harness-quick-assistant-view';

interface QuickAssistantViewOptions {
  readonly getDshHealth: () => DshHealthResult;
}

export class QuickAssistantView extends ItemView {
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
    return '快速助手';
  }

  getIcon(): IconName {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const state = createWorkbenchState(this.options.getDshHealth());
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dsh-quick-assistant');

    const headerEl = contentEl.createEl('header', { cls: 'dsh-quick-assistant__header' });
    const iconEl = headerEl.createSpan({ cls: 'dsh-quick-assistant__header-icon' });
    setIcon(iconEl, 'bot');
    const headerCopyEl = headerEl.createDiv();
    headerCopyEl.createEl('h3', { text: '快速助手' });
    headerCopyEl.createEl('p', { text: '按需查看状态与上下文；对话能力尚未启用。' });

    this.renderSection(contentEl, 'activity', 'DSH 健康', state.healthCheckStatus);
    this.renderSection(contentEl, 'file-question', '当前上下文', '未选择笔记或工作范围');
    this.renderSection(contentEl, 'message-circle-question', '快捷提问', '快捷提问尚未启用');

    contentEl.createEl('p', {
      cls: 'dsh-quick-assistant__boundary',
      text: '当前容器不读取 Vault，也不提供输入、发送、停止或模型选择。',
    });
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private renderSection(
    parentEl: HTMLElement,
    icon: IconName,
    label: string,
    value: string,
  ): void {
    const sectionEl = parentEl.createEl('section', { cls: 'dsh-quick-assistant__section' });
    const iconEl = sectionEl.createSpan({ cls: 'dsh-quick-assistant__section-icon' });
    setIcon(iconEl, icon);
    const copyEl = sectionEl.createDiv();
    copyEl.createEl('h4', { text: label });
    copyEl.createEl('p', { text: value });
  }
}
