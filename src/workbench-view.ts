import { ItemView, type IconName, type WorkspaceLeaf } from 'obsidian';

import type { DshHealthResult } from './dsh-health';
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_WORKBENCH = 'deepseek-harness-workbench-view';

interface WorkbenchViewOptions {
  readonly getDshHealth: () => DshHealthResult;
  readonly runDshHealthCheck: () => Promise<void>;
}

export class WorkbenchView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly options: WorkbenchViewOptions,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_WORKBENCH;
  }

  getDisplayText(): string {
    return 'DeepSeek Harness Workbench';
  }

  getIcon(): IconName {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const { contentEl } = this;
    const health = this.options.getDshHealth();
    const state = createWorkbenchState(health);
    contentEl.empty();
    contentEl.addClass('dsh-workbench');

    const headerEl = contentEl.createDiv({ cls: 'dsh-workbench__header' });
    headerEl.createEl('h2', { text: 'DeepSeek Harness Workbench' });
    headerEl.createEl('p', {
      cls: 'dsh-workbench__summary',
      text: '原生智能体工作台工程基线。可手动检查外部 DSH，但尚未建立会话连接。',
    });

    const statusEl = contentEl.createDiv({ cls: 'dsh-workbench__status' });
    this.renderStatusRow(statusEl, '连接状态', state.connectionStatus);
    this.renderStatusRow(statusEl, '运行时健康检查', state.healthCheckStatus);
    this.renderStatusRow(statusEl, 'Vault 权限', state.vaultPermissionStatus);
    this.renderStatusRow(statusEl, '平台', state.platformStatus);

    const actionsEl = contentEl.createDiv({ cls: 'dsh-workbench__actions' });
    const checkButtonEl = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: health.status === 'checking' ? '正在检查…' : '检查 DSH',
    });
    checkButtonEl.disabled = health.status === 'checking';
    checkButtonEl.addEventListener('click', () => {
      void this.options.runDshHealthCheck();
    });
    actionsEl.createSpan({
      cls: 'dsh-workbench__actions-hint',
      text: '命令路径可在插件设置中修改。',
    });

    contentEl.createEl('p', {
      cls: 'dsh-workbench__boundary',
      text: '本版本只在手动检查时执行固定的 --version；不读取或写入 Vault，不启动会话，也不使用模型网络。',
    });
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private renderStatusRow(parentEl: HTMLElement, label: string, value: string): void {
    const rowEl = parentEl.createDiv({ cls: 'dsh-workbench__status-row' });
    rowEl.createSpan({ cls: 'dsh-workbench__status-label', text: label });
    rowEl.createSpan({ cls: 'dsh-workbench__status-value', text: value });
  }
}
