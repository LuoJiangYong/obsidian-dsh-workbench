import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { DshHealthProbe, type DshHealthResult } from './dsh-health';
import {
  DEFAULT_DSH_SETTINGS,
  type DshSettings,
  loadDshSettings,
  validateDshCommand,
} from './dsh-settings';
import { WorkbenchSettingTab } from './settings-tab';
import { VIEW_TYPE_WORKBENCH, WorkbenchView } from './workbench-view';

export default class DeepSeekHarnessWorkbenchPlugin extends Plugin {
  settings: DshSettings = DEFAULT_DSH_SETTINGS;

  private readonly healthProbe = new DshHealthProbe();
  private health: DshHealthResult = { status: 'unchecked' };

  async onload(): Promise<void> {
    this.settings = loadDshSettings(await this.loadData());
    this.addSettingTab(new WorkbenchSettingTab(this));

    this.registerView(
      VIEW_TYPE_WORKBENCH,
      (leaf: WorkspaceLeaf) => new WorkbenchView(leaf, {
        getDshHealth: () => this.health,
        runDshHealthCheck: async () => await this.runDshHealthCheck(),
      }),
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

  onunload(): void {
    this.healthProbe.dispose();
  }

  async updateDshCommand(rawCommand: string): Promise<void> {
    const dshCommand = rawCommand.trim();
    const validationError = validateDshCommand(dshCommand);
    if (validationError) throw new Error(validationError);

    const nextSettings = Object.freeze({ dshCommand });
    await this.saveData(nextSettings);
    this.settings = nextSettings;
    this.health = { status: 'unchecked' };
    this.refreshWorkbenchViews();
  }

  async runDshHealthCheck(): Promise<void> {
    this.health = { status: 'checking' };
    this.refreshWorkbenchViews();
    this.health = await this.healthProbe.check(this.settings.dshCommand);
    this.refreshWorkbenchViews();
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

  private refreshWorkbenchViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)) {
      if (leaf.view instanceof WorkbenchView) leaf.view.render();
    }
  }
}
