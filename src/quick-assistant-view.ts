import { ItemView, setIcon, type IconName, type WorkspaceLeaf } from 'obsidian';

import type { DshHealthResult } from './dsh-health';
import { DEEPSEEK_WHALE_ICON } from './icons';
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_QUICK_ASSISTANT = 'deepseek-harness-quick-assistant-view';

interface QuickAssistantViewOptions {
  readonly getContextSummary: () => string;
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
    return DEEPSEEK_WHALE_ICON;
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
    setIcon(iconEl, DEEPSEEK_WHALE_ICON);
    const headerCopyEl = headerEl.createDiv();
    headerCopyEl.createEl('h3', { text: '快速助手' });
    headerCopyEl.createEl('p', {
      text: '仅辅助展示健康、当前上下文和快捷提问，不承担主对话。',
    });

    this.renderSection(contentEl, 'activity', 'DSH 健康', state.healthCheckStatus);
    this.renderSection(contentEl, 'file-question', '当前上下文', this.options.getContextSummary());
    this.renderPromptSection(contentEl);

    contentEl.createEl('p', {
      cls: 'dsh-quick-assistant__boundary',
      text: '新建任务是主对话入口。快速助手仅展示健康状态、当前上下文和快捷提问。',
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

  private renderPromptSection(parentEl: HTMLElement): void {
    const sectionEl = parentEl.createEl('section', { cls: 'dsh-quick-assistant__section' });
    const iconEl = sectionEl.createSpan({ cls: 'dsh-quick-assistant__section-icon' });
    setIcon(iconEl, 'message-circle-question');
    const copyEl = sectionEl.createDiv();
    copyEl.createEl('h4', { text: '快捷提问' });
    for (const prompt of ['总结当前上下文', '检查运行状态']) {
      const promptEl = copyEl.createEl('button', {
        cls: 'dsh-quick-assistant__prompt',
        text: prompt,
        attr: { type: 'button', 'aria-disabled': 'true' },
      });
      promptEl.disabled = true;
    }
  }
}
