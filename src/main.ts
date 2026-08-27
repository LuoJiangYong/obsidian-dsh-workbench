import path from 'node:path';

import { addIcon, FileSystemAdapter, Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { DshHealthProbe, type DshHealthResult } from './dsh-health';
import { ManagedBridgeProcess } from './managed-bridge-process';
import { NewTaskConversationController } from './new-task-conversation';
import { ObsidianNewTaskContextHost } from './obsidian-context-host';
import {
  DEFAULT_DSH_SETTINGS,
  type DshSettings,
  loadDshSettings,
  validateDshCommand,
} from './dsh-settings';
import { WorkbenchSettingTab } from './settings-tab';
import { DEEPSEEK_WHALE_ICON, DEEPSEEK_WHALE_SVG } from './icons';
import { resolveWorkbenchRuntimeStorage } from './runtime-storage';
import {
  QuickAssistantView,
  VIEW_TYPE_QUICK_ASSISTANT,
} from './quick-assistant-view';
import { VIEW_TYPE_WORKBENCH, WorkbenchView } from './workbench-view';

export default class DeepSeekHarnessWorkbenchPlugin extends Plugin {
  settings: DshSettings = DEFAULT_DSH_SETTINGS;

  private readonly healthProbe = new DshHealthProbe();
  private readonly contextHost = new ObsidianNewTaskContextHost(this.app);
  private readonly conversationHost = new NewTaskConversationController({
    createProcess: () => Promise.resolve(this.createConversationProcess()),
  });
  private health: DshHealthResult = { status: 'unchecked' };

  async onload(): Promise<void> {
    this.settings = loadDshSettings(await this.loadData());
    addIcon(
      DEEPSEEK_WHALE_ICON,
      `<g transform="scale(2)">${DEEPSEEK_WHALE_SVG}</g>`,
    );
    this.addSettingTab(new WorkbenchSettingTab(this));

    this.registerView(
      VIEW_TYPE_WORKBENCH,
      (leaf: WorkspaceLeaf) => new WorkbenchView(leaf, {
        conversationHost: this.conversationHost,
        getDshHealth: () => this.health,
        contextHost: this.contextHost,
        onContextsChanged: () => this.refreshQuickAssistantViews(),
        runDshHealthCheck: async () => await this.runDshHealthCheck(),
      }),
    );
    this.registerView(
      VIEW_TYPE_QUICK_ASSISTANT,
      (leaf: WorkspaceLeaf) => new QuickAssistantView(leaf, {
        getContextSummary: () => this.getNewTaskContextSummary(),
        getDshHealth: () => this.health,
      }),
    );

    const ribbonIconEl = this.addRibbonIcon(
      DEEPSEEK_WHALE_ICON,
      '打开 DeepSeek Harness Workbench',
      () => {
      void this.activateWorkbench().catch((error: unknown) => {
        new Notice(this.activationErrorMessage(error));
      });
      },
    );
    ribbonIconEl.addClass('dsh-whale-ribbon');

    this.addCommand({
      id: 'open-workbench',
      name: '打开工作台',
      callback: () => {
        void this.activateWorkbench().catch((error: unknown) => {
          new Notice(this.activationErrorMessage(error));
        });
      },
    });

    this.addCommand({
      id: 'open-quick-assistant',
      name: '打开快速助手',
      callback: () => {
        void this.activateQuickAssistant().catch((error: unknown) => {
          new Notice(this.quickAssistantActivationErrorMessage(error));
        });
      },
    });
  }

  onunload(): void {
    this.contextHost.dispose();
    this.healthProbe.dispose();
    void this.conversationHost.dispose().catch(() => {
      new Notice('DSH 进程清理未正常完成，请在运行状态中重新检查。');
    });
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
    const leaf = existingLeaf ?? this.app.workspace.getLeaf('tab');

    if (!leaf) {
      throw new Error('无法创建中央 Workbench 标签页');
    }

    await leaf.setViewState({ type: VIEW_TYPE_WORKBENCH, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async activateQuickAssistant(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_ASSISTANT)[0];
    const leaf = existingLeaf ?? this.app.workspace.getRightLeaf(false);

    if (!leaf) {
      throw new Error('无法创建右侧快速助手视图');
    }

    await leaf.setViewState({ type: VIEW_TYPE_QUICK_ASSISTANT, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private activationErrorMessage(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return `无法打开 DeepSeek Harness Workbench：${detail}`;
  }

  private quickAssistantActivationErrorMessage(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return `无法打开快速助手：${detail}`;
  }

  private refreshWorkbenchViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)) {
      if (leaf.view instanceof WorkbenchView) leaf.view.render();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_ASSISTANT)) {
      if (leaf.view instanceof QuickAssistantView) leaf.view.render();
    }
  }

  private refreshQuickAssistantViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_ASSISTANT)) {
      if (leaf.view instanceof QuickAssistantView) leaf.view.render();
    }
  }

  private getNewTaskContextSummary(): string {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)[0];
    return leaf?.view instanceof WorkbenchView
      ? leaf.view.getContextSummary()
      : '未选择笔记或工作范围';
  }

  private createConversationProcess(): ManagedBridgeProcess {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error('新建任务仅支持本地文件系统 Vault。');
    }
    const vaultPath = adapter.getBasePath();
    const pluginDirectory = this.manifest.dir;
    if (!pluginDirectory) throw new Error('无法定位插件安装目录。');
    const storage = resolveWorkbenchRuntimeStorage({ vaultPath });
    return new ManagedBridgeProcess({
      bridgePath: path.join(vaultPath, pluginDirectory, 'obsidian-bridge.mjs'),
      command: this.settings.dshCommand,
      stateDirectory: storage.stateDirectory,
      vaultPath,
      workingDirectory: storage.stateDirectory,
    });
  }
}
