import path from 'node:path';

import { addIcon, FileSystemAdapter, Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { DshHealthProbe, type DshHealthResult } from './dsh-health';
import { ManagedBridgeProcess } from './managed-bridge-process';
import {
  NewTaskConversationController,
  type NewTaskProcessInput,
} from './new-task-conversation';
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
import { ElectronTaskWorkspaceHost } from './task-workspace-host';
import { ElectronTaskWorkspaceFileActions } from './task-workspace-file-actions';
import { TaskWorkspaceLedger } from './task-workspace';
import { TaskIndexStore } from './task-index';
import { TaskRecoveryController } from './task-recovery';
import {
  QuickAssistantView,
  VIEW_TYPE_QUICK_ASSISTANT,
} from './quick-assistant-view';
import { VIEW_TYPE_WORKBENCH, WorkbenchView } from './workbench-view';

export default class DeepSeekHarnessWorkbenchPlugin extends Plugin {
  settings: DshSettings = DEFAULT_DSH_SETTINGS;

  private readonly healthProbe = new DshHealthProbe();
  private readonly contextHost = new ObsidianNewTaskContextHost(this.app);
  private taskWorkspaceLedger: TaskWorkspaceLedger | undefined;
  private taskIndexStore: TaskIndexStore | undefined;
  private taskRecoveryController: TaskRecoveryController | undefined;
  private readonly taskWorkspaceHost = new ElectronTaskWorkspaceHost({
    validateWorkspace: async (workspacePath) => (
      await this.getTaskWorkspaceLedger().validateWorkspace(workspacePath)
    ),
  });
  private readonly taskWorkspaceFileActions = new ElectronTaskWorkspaceFileActions({
    validateWorkspace: async (workspacePath) => (
      await this.getTaskWorkspaceLedger().validateWorkspace(workspacePath)
    ),
  });
  private readonly conversationHost = new NewTaskConversationController({
    createProcess: (input) => Promise.resolve(this.createConversationProcess(input)),
    taskIndex: {
      createTask: async (input) => await this.getTaskIndexStore().createTask(input),
      updateTask: async (taskId, lifecycle) => (
        await this.getTaskIndexStore().updateTask(taskId, lifecycle)
      ),
    },
    taskLedger: {
      beginTurn: async (turnId, workspacePath) => (
        await this.getTaskWorkspaceLedger().beginTurn(turnId, workspacePath)
      ),
      completeTurn: async (turnId) => (
        await this.getTaskWorkspaceLedger().completeTurn(turnId)
      ),
      undoTurn: async (turnId) => (
        await this.getTaskWorkspaceLedger().undoTurn(turnId)
      ),
      validateWorkspace: async (workspacePath) => (
        await this.getTaskWorkspaceLedger().validateWorkspace(workspacePath)
      ),
    },
  });
  private health: DshHealthResult = { status: 'unchecked' };

  async onload(): Promise<void> {
    this.settings = loadDshSettings(await this.loadData());
    await this.initializeTaskRecovery();
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
        openEnvironmentPanel: async () => await this.activateQuickAssistant(),
        runDshHealthCheck: async () => await this.runDshHealthCheck(),
        taskWorkspaceFileActions: this.taskWorkspaceFileActions,
        taskWorkspaceHost: this.taskWorkspaceHost,
      }),
    );
    this.registerView(
      VIEW_TYPE_QUICK_ASSISTANT,
      (leaf: WorkspaceLeaf) => new QuickAssistantView(leaf, {
        conversationHost: this.conversationHost,
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
      name: '打开任务环境',
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
    this.conversationHost.disposeImmediately();
    this.taskRecoveryController?.disposeImmediately();
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
      throw new Error('无法创建右侧任务环境视图');
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
    return `无法打开任务环境：${detail}`;
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

  private createConversationProcess(input: NewTaskProcessInput): ManagedBridgeProcess {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error('新建任务仅支持本地文件系统 Vault。');
    }
    const vaultPath = adapter.getBasePath();
    const pluginDirectory = this.manifest.dir;
    if (!pluginDirectory) throw new Error('无法定位插件安装目录。');
    const storage = resolveWorkbenchRuntimeStorage({ vaultPath });
    const workingDirectory = input.mode === 'task'
      ? input.workingDirectory
      : storage.stateDirectory;
    if (!workingDirectory) throw new Error('任务执行缺少已校验的 Vault 外工作区。');
    return new ManagedBridgeProcess({
      bridgePath: path.join(vaultPath, pluginDirectory, 'obsidian-bridge.mjs'),
      command: this.settings.dshCommand,
      permissionMode: input.mode === 'task' ? 'workspace-write' : 'read-only',
      stateDirectory: storage.stateDirectory,
      vaultPath,
      workingDirectory,
    });
  }

  private async initializeTaskRecovery(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return;
    const vaultPath = adapter.getBasePath();
    const pluginDirectory = this.manifest.dir;
    if (!pluginDirectory) return;
    const storage = resolveWorkbenchRuntimeStorage({ vaultPath });
    const taskIndexStore = new TaskIndexStore({
      stateDirectory: storage.stateDirectory,
      vaultPath,
    });
    this.taskIndexStore = taskIndexStore;
    const controller = new TaskRecoveryController({
      store: taskIndexStore,
      stateDirectory: storage.stateDirectory,
      createProcess: () => new ManagedBridgeProcess({
        bridgePath: path.join(vaultPath, pluginDirectory, 'obsidian-bridge.mjs'),
        command: this.settings.dshCommand,
        permissionMode: 'read-only',
        stateDirectory: storage.stateDirectory,
        vaultPath,
        workingDirectory: storage.stateDirectory,
      }),
    });
    this.taskRecoveryController = controller;
    await controller.refresh();
  }

  private getTaskIndexStore(): TaskIndexStore {
    if (this.taskIndexStore) return this.taskIndexStore;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error('最小任务索引仅支持本地文件系统 Vault。');
    }
    const vaultPath = adapter.getBasePath();
    const storage = resolveWorkbenchRuntimeStorage({ vaultPath });
    this.taskIndexStore = new TaskIndexStore({
      stateDirectory: storage.stateDirectory,
      vaultPath,
    });
    return this.taskIndexStore;
  }

  private getTaskWorkspaceLedger(): TaskWorkspaceLedger {
    if (this.taskWorkspaceLedger) return this.taskWorkspaceLedger;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error('任务执行仅支持本地文件系统 Vault。');
    }
    const vaultPath = adapter.getBasePath();
    const storage = resolveWorkbenchRuntimeStorage({ vaultPath });
    this.taskWorkspaceLedger = new TaskWorkspaceLedger({
      stateDirectory: storage.stateDirectory,
      vaultPath,
    });
    return this.taskWorkspaceLedger;
  }
}
