import { ItemView, type IconName, type WorkspaceLeaf } from 'obsidian';

import { WORKBENCH_BASELINE_STATE } from './workbench-state';

export const VIEW_TYPE_WORKBENCH = 'deepseek-harness-workbench-view';

export class WorkbenchView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
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
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dsh-workbench');

    const headerEl = contentEl.createDiv({ cls: 'dsh-workbench__header' });
    headerEl.createEl('h2', { text: 'DeepSeek Harness Workbench' });
    headerEl.createEl('p', {
      cls: 'dsh-workbench__summary',
      text: '原生智能体工作台工程基线。当前批次尚未连接外部运行时。',
    });

    const statusEl = contentEl.createDiv({ cls: 'dsh-workbench__status' });
    this.renderStatusRow(statusEl, '连接状态', WORKBENCH_BASELINE_STATE.connectionStatus);
    this.renderStatusRow(statusEl, '运行时健康检查', WORKBENCH_BASELINE_STATE.healthCheckStatus);
    this.renderStatusRow(statusEl, 'Vault 权限', WORKBENCH_BASELINE_STATE.vaultPermissionStatus);
    this.renderStatusRow(statusEl, '平台', WORKBENCH_BASELINE_STATE.platformStatus);

    contentEl.createEl('p', {
      cls: 'dsh-workbench__boundary',
      text: '本版本不读取或写入 Vault，不启动 DSH，也不使用网络。',
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
