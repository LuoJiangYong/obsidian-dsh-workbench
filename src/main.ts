import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { VIEW_TYPE_WORKBENCH, WorkbenchView } from './workbench-view';

export default class DeepSeekHarnessWorkbenchPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_WORKBENCH,
      (leaf: WorkspaceLeaf) => new WorkbenchView(leaf),
    );

    this.addRibbonIcon('bot', '打开 DeepSeek Harness Workbench', () => {
      void this.activateWorkbench().catch((error: unknown) => {
        new Notice(this.activationErrorMessage(error));
      });
    });

    this.addCommand({
      id: 'open-workbench',
      name: '打开工作台',
      callback: () => {
        void this.activateWorkbench().catch((error: unknown) => {
          new Notice(this.activationErrorMessage(error));
        });
      },
    });
  }

  async activateWorkbench(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)[0];
    const leaf = existingLeaf ?? this.app.workspace.getRightLeaf(false);

    if (!leaf) {
      throw new Error('无法创建右侧 Workbench 视图');
    }

    await leaf.setViewState({ type: VIEW_TYPE_WORKBENCH, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private activationErrorMessage(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return `无法打开 DeepSeek Harness Workbench：${detail}`;
  }
}
