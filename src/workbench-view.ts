import {
  ItemView,
  Menu,
  Modal,
  Notice,
  setIcon,
  type IconName,
  type WorkspaceLeaf,
} from 'obsidian';

import type { BridgePermissionDecision } from './bridge-protocol';
import type { DshHealthResult } from './dsh-health';
import { DEEPSEEK_WHALE_ICON } from './icons';
import {
  contextSelectionLabel,
  formatContextByteLimit,
  type NewTaskContextSelection,
} from './new-task-context';
import type {
  NewTaskConversationHost,
  NewTaskConversationMessage,
  NewTaskConversationSnapshot,
} from './new-task-conversation';
import {
  canSubmitNewTask,
  createNewTaskState,
  type NewTaskMode,
  type NewTaskState,
  reduceNewTaskState,
} from './new-task-state';
import type { NewTaskContextHost } from './obsidian-context-host';
import type { TaskWorkspaceHost } from './task-workspace-host';
import type { TaskWorkspaceFileActionsHost } from './task-workspace-file-actions';
import type {
  TaskWorkspaceChange,
  TaskWorkspaceSelection,
  TaskWorkspaceTurnResult,
} from './task-workspace';
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_WORKBENCH = 'deepseek-harness-workbench-view';

const BRAND_DEEPSEEK = 'DeepSeek';
const NEW_TASK_HEADING = '今天想让 DeepSeek Harness 做什么？';
const NEW_TASK_PLACEHOLDER = '描述目标，@ 引用上下文，/ 调用 Skill 或命令';
const DEFAULT_VISIBLE_TASK_FILES = 3;
const MAX_REVIEW_PREVIEW_CHARACTERS = 200_000;
const MAX_REVIEW_PREVIEW_FILES = 50;
const MAX_REVIEW_PREVIEW_LINES = 2_000;

type WorkbenchSectionId = 'new-task' | 'run';
type WorkbenchNavigationItem = {
  readonly icon: IconName;
  readonly id: WorkbenchSectionId;
  readonly label: string;
};

const WORKBENCH_NAVIGATION: readonly WorkbenchNavigationItem[] = Object.freeze([
  { icon: 'circle-plus', id: 'new-task', label: '新建任务' },
  { icon: 'activity', id: 'run', label: '运行' },
]);

interface WorkbenchViewOptions {
  readonly conversationHost: NewTaskConversationHost;
  readonly contextHost: NewTaskContextHost;
  readonly getDshHealth: () => DshHealthResult;
  readonly onContextsChanged: () => void;
  readonly runDshHealthCheck: () => Promise<void>;
  readonly taskWorkspaceFileActions: TaskWorkspaceFileActionsHost;
  readonly taskWorkspaceHost: TaskWorkspaceHost;
}

export class WorkbenchView extends ItemView {
  private activeSection: WorkbenchSectionId = 'new-task';
  private conversationEl: HTMLElement | undefined;
  private detachConversation: (() => void) | undefined;
  private readonly expandedTaskTurnIds = new Set<string>();
  private newTaskState: NewTaskState = createNewTaskState();
  private sendButtonEl: HTMLButtonElement | undefined;
  private readonly taskActionBusy = new Set<string>();
  private readonly taskActionErrors = new Map<string, string>();
  private textareaEl: HTMLTextAreaElement | undefined;

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
    return DEEPSEEK_WHALE_ICON;
  }

  async onOpen(): Promise<void> {
    this.detachConversation ??= this.options.conversationHost.subscribe(
      () => this.syncConversationSurface(),
    );
    this.render();
  }

  render(): void {
    const { contentEl } = this;
    this.conversationEl = undefined;
    this.sendButtonEl = undefined;
    this.textareaEl = undefined;
    contentEl.empty();
    contentEl.addClass('dsh-workbench-view');

    const shellEl = contentEl.createDiv({ cls: 'dsh-workbench-shell' });
    this.renderNavigation(shellEl);

    const mainEl = shellEl.createEl('main', { cls: 'dsh-workbench-main' });
    this.renderMobileNavigation(mainEl);
    if (this.activeSection === 'run') {
      this.renderRun(mainEl);
      return;
    }
    this.renderNewTask(mainEl);
  }

  async onClose(): Promise<void> {
    this.detachConversation?.();
    this.detachConversation = undefined;
    this.newTaskState = createNewTaskState();
    this.conversationEl = undefined;
    this.sendButtonEl = undefined;
    this.textareaEl = undefined;
    this.contentEl.empty();
    this.options.onContextsChanged();
  }

  getContextSummary(): string {
    if (this.newTaskState.contexts.length === 0) return '未选择笔记或工作范围';
    const labels = this.newTaskState.contexts.map((context) => contextSelectionLabel(context));
    return `已选择 ${String(labels.length)} 项：${labels.join('、')}`;
  }

  private renderNavigation(parentEl: HTMLElement): void {
    const sidebarEl = parentEl.createEl('aside', { cls: 'dsh-workbench-sidebar' });
    const brandEl = sidebarEl.createDiv({ cls: 'dsh-workbench-brand' });
    const brandIconEl = brandEl.createSpan({ cls: 'dsh-workbench-brand__icon' });
    setIcon(brandIconEl, DEEPSEEK_WHALE_ICON);
    const brandCopyEl = brandEl.createDiv({ cls: 'dsh-workbench-brand__copy' });
    brandCopyEl.createEl('strong', { text: BRAND_DEEPSEEK });
    brandCopyEl.createSpan({ text: 'Harness' });
    brandCopyEl.createSpan({ text: 'Workbench' });

    const navigationEl = sidebarEl.createEl('nav', {
      cls: 'dsh-navigation',
      attr: { 'aria-label': 'Workbench 页面' },
    });
    for (const item of WORKBENCH_NAVIGATION) {
      const isActive = item.id === this.activeSection;
      const buttonEl = navigationEl.createEl('button', {
        cls: `dsh-navigation__item${isActive ? ' is-active' : ''}`,
        attr: {
          type: 'button',
          ...(isActive ? { 'aria-current': 'page' } : {}),
        },
      });
      const iconEl = buttonEl.createSpan({ cls: 'dsh-navigation__icon' });
      setIcon(iconEl, item.icon);
      buttonEl.createSpan({ cls: 'dsh-navigation__label', text: item.label });

      buttonEl.addEventListener('click', () => {
        this.activeSection = item.id;
        this.render();
      });
    }
  }

  private renderMobileNavigation(parentEl: HTMLElement): void {
    const wrapperEl = parentEl.createDiv({ cls: 'dsh-mobile-navigation' });
    const iconEl = wrapperEl.createSpan({ cls: 'dsh-mobile-navigation__icon' });
    setIcon(iconEl, this.activeSection === 'new-task' ? 'circle-plus' : 'activity');
    const selectEl = wrapperEl.createEl('select', {
      attr: { 'aria-label': '选择工作台页面' },
    });
    for (const item of WORKBENCH_NAVIGATION) {
      selectEl.createEl('option', { text: item.label, value: item.id });
    }
    selectEl.value = this.activeSection;
    selectEl.addEventListener('change', () => {
      if (selectEl.value === 'new-task' || selectEl.value === 'run') {
        this.activeSection = selectEl.value;
        this.render();
      }
    });
  }

  private renderNewTask(parentEl: HTMLElement): void {
    const taskEl = parentEl.createEl('section', { cls: 'dsh-new-task' });
    taskEl.createEl('h3', { text: NEW_TASK_HEADING });
    this.renderNewTaskModes(taskEl);

    this.conversationEl = taskEl.createEl('section', {
      cls: 'dsh-new-task-conversation',
      attr: {
        'aria-label': '对话记录',
        'aria-live': 'polite',
      },
    });

    const composerEl = taskEl.createDiv({ cls: 'dsh-new-task-composer' });
    const textareaEl = composerEl.createEl('textarea', {
      cls: 'dsh-new-task-composer__input',
      attr: {
        'aria-label': '任务描述',
        placeholder: NEW_TASK_PLACEHOLDER,
        rows: '4',
      },
    });
    this.textareaEl = textareaEl;
    textareaEl.value = this.newTaskState.draft;

    this.renderSelectedWorkspace(composerEl);
    this.renderSelectedContexts(composerEl);
    const footerEl = composerEl.createDiv({ cls: 'dsh-new-task-composer__footer' });
    const toolsEl = footerEl.createDiv({ cls: 'dsh-new-task-composer__tools' });
    this.renderDisabledComposerTool(toolsEl, 'circle-plus', '添加附件', 'attachment');
    this.renderContextTool(toolsEl);
    if (this.newTaskState.mode === 'task') this.renderWorkspaceTool(toolsEl);
    this.renderDisabledComposerTool(
      toolsEl,
      'shield-check',
      this.newTaskState.mode === 'task' ? '逐次确认' : '只读对话',
    );

    const submitEl = footerEl.createDiv({ cls: 'dsh-new-task-composer__submit' });
    submitEl.createSpan({
      cls: 'dsh-new-task-composer__model is-wide',
      text: '模型由 DSH 配置管理',
    });
    submitEl.createSpan({
      cls: 'dsh-new-task-composer__model is-compact',
      text: '由 DSH 管理模型',
    });
    const sendButtonEl = submitEl.createEl('button', {
      cls: 'mod-cta dsh-new-task-composer__send',
      text: '发送',
      attr: { type: 'button' },
    });
    this.sendButtonEl = sendButtonEl;
    this.syncSendButton();
    textareaEl.addEventListener('input', () => {
      this.newTaskState = reduceNewTaskState(this.newTaskState, {
        type: 'draft-changed',
        draft: textareaEl.value,
      });
      this.syncSendButton();
    });
    sendButtonEl.addEventListener('click', () => {
      void this.handlePrimaryAction();
    });

    const confirmationEl = taskEl.createEl('section', { cls: 'dsh-new-task-confirmation' });
    const confirmationIconEl = confirmationEl.createSpan({
      cls: 'dsh-new-task-confirmation__icon',
    });
    setIcon(confirmationIconEl, 'shield-check');
    const confirmationCopyEl = confirmationEl.createDiv();
    confirmationCopyEl.createEl('strong', { text: '执行前确认' });
    confirmationCopyEl.createEl('p', {
      text: this.newTaskState.mode === 'task'
        ? '发送前确认任务、只读笔记与 Vault 外工作区；文件工具逐次授权，不写入知识库。'
        : '发送前确认任务和只读笔记；对话不开放 DSH 工具，也不会写入知识库。',
    });
    this.syncConversationSurface();
  }

  private renderNewTaskModes(parentEl: HTMLElement): void {
    const modesEl = parentEl.createDiv({
      cls: 'dsh-new-task-mode',
      attr: { role: 'tablist', 'aria-label': '任务模式' },
    });
    for (const mode of [
      { id: 'chat', label: '对话' },
      { id: 'task', label: '任务执行' },
    ] as const) {
      const isActive = this.newTaskState.mode === mode.id;
      const buttonEl = modesEl.createEl('button', {
        cls: `dsh-new-task-mode__button${isActive ? ' is-active' : ''}`,
        text: mode.label,
        attr: {
          type: 'button',
          role: 'tab',
          'aria-selected': isActive ? 'true' : 'false',
        },
      });
      buttonEl.disabled = !canChangeMode(this.options.conversationHost.getSnapshot().phase);
      buttonEl.addEventListener('click', () => this.selectNewTaskMode(mode.id));
    }

    const disabledModeEl = modesEl.createEl('button', {
      cls: 'dsh-new-task-mode__button',
      text: '代码协作',
      attr: {
        type: 'button',
        role: 'tab',
        'aria-disabled': 'true',
        'aria-selected': 'false',
      },
    });
    disabledModeEl.disabled = true;
  }

  private selectNewTaskMode(mode: NewTaskMode): void {
    this.newTaskState = reduceNewTaskState(this.newTaskState, {
      type: 'mode-changed',
      mode,
    });
    this.render();
  }

  private renderDisabledComposerTool(
    parentEl: HTMLElement,
    icon: IconName,
    label: string,
    variant?: 'attachment',
  ): void {
    const buttonEl = parentEl.createEl('button', {
      cls: `dsh-new-task-composer__tool${variant ? ` is-${variant}` : ''}`,
      attr: { type: 'button', 'aria-disabled': 'true' },
    });
    buttonEl.disabled = true;
    setIcon(buttonEl, icon);
    buttonEl.createSpan({ cls: 'dsh-new-task-composer__tool-label', text: label });
  }

  private renderContextTool(parentEl: HTMLElement): void {
    const buttonEl = parentEl.createEl('button', {
      cls: 'dsh-new-task-composer__tool dsh-new-task-context__open',
      attr: {
        type: 'button',
        'aria-haspopup': 'dialog',
        'aria-label': '选择知识库内容',
      },
    });
    setIcon(buttonEl, 'files');
    buttonEl.createSpan({ cls: 'dsh-new-task-composer__tool-label', text: '选择知识库' });
    buttonEl.addEventListener('click', () => {
      this.options.contextHost.openPicker({
        selected: this.newTaskState.contexts,
        onSelect: (context) => this.addContext(context),
        onSelectMany: (contexts) => this.addContexts(contexts),
        onError: (message) => this.setContextError(message),
      });
    });
  }

  private renderWorkspaceTool(parentEl: HTMLElement): void {
    const buttonEl = parentEl.createEl('button', {
      cls: 'dsh-new-task-composer__tool dsh-task-workspace__open',
      attr: {
        type: 'button',
        'aria-label': this.newTaskState.workspace
          ? `更换任务工作区：${this.newTaskState.workspace.name}`
          : '选择 Vault 外任务工作区',
      },
    });
    setIcon(buttonEl, 'folder-open');
    buttonEl.createSpan({
      cls: 'dsh-new-task-composer__tool-label',
      text: this.newTaskState.workspace?.name ?? '选择工作区',
    });
    buttonEl.addEventListener('click', () => {
      void this.selectTaskWorkspace();
    });
  }

  private renderSelectedWorkspace(parentEl: HTMLElement): void {
    if (this.newTaskState.mode !== 'task'
      || (!this.newTaskState.workspace && !this.newTaskState.workspaceError)) return;
    const workspaceEl = parentEl.createEl('section', {
      cls: 'dsh-task-workspace',
      attr: { 'aria-label': '任务工作区' },
    });
    if (this.newTaskState.workspace) {
      const copyEl = workspaceEl.createDiv({ cls: 'dsh-task-workspace__copy' });
      copyEl.createEl('strong', { text: '任务工作区' });
      copyEl.createSpan({
        cls: 'dsh-task-workspace__name',
        text: this.newTaskState.workspace.name,
      });
      copyEl.createSpan({
        cls: 'dsh-task-workspace__boundary',
        text: 'Vault 外目录 · 仅本次任务会话可写 · 文件工具逐次确认',
      });
      const removeEl = workspaceEl.createEl('button', {
        cls: 'dsh-task-workspace__remove',
        attr: {
          type: 'button',
          'aria-label': `移除任务工作区 ${this.newTaskState.workspace.name}`,
        },
      });
      setIcon(removeEl, 'x');
      removeEl.addEventListener('click', () => {
        this.newTaskState = reduceNewTaskState(this.newTaskState, {
          type: 'workspace-changed',
          workspace: null,
        });
        this.render();
      });
    }
    if (this.newTaskState.workspaceError) {
      workspaceEl.createEl('p', {
        cls: 'dsh-task-workspace__error',
        text: this.newTaskState.workspaceError,
        attr: { role: 'alert' },
      });
    }
  }

  private async selectTaskWorkspace(): Promise<void> {
    try {
      const workspace = await this.options.taskWorkspaceHost.selectWorkspace();
      if (workspace === null) return;
      this.newTaskState = reduceNewTaskState(this.newTaskState, {
        type: 'workspace-changed',
        workspace,
      });
    } catch (error) {
      this.newTaskState = reduceNewTaskState(this.newTaskState, {
        type: 'workspace-error-changed',
        message: error instanceof Error ? error.message : '无法选择任务工作区。',
      });
    }
    this.render();
  }

  private renderSelectedContexts(parentEl: HTMLElement): void {
    if (this.newTaskState.contexts.length === 0 && !this.newTaskState.contextError) return;
    const contextEl = parentEl.createEl('section', {
      cls: 'dsh-new-task-context',
      attr: { 'aria-label': '已选笔记' },
    });
    const headerEl = contextEl.createDiv({ cls: 'dsh-new-task-context__header' });
    headerEl.createEl('strong', { text: '已选笔记' });
    headerEl.createSpan({ text: formatContextByteLimit() });

    for (const context of this.newTaskState.contexts) {
      const itemEl = contextEl.createDiv({ cls: 'dsh-new-task-context__item' });
      const copyEl = itemEl.createDiv({ cls: 'dsh-new-task-context__copy' });
      copyEl.createSpan({ cls: 'dsh-new-task-context__label', text: contextSelectionLabel(context) });
      copyEl.createSpan({
        cls: 'dsh-new-task-context__preview',
        text: this.contextPreview(context),
      });
      const removeEl = itemEl.createEl('button', {
        cls: 'dsh-new-task-context__remove',
        attr: {
          type: 'button',
          'aria-label': `移除 ${contextSelectionLabel(context)}`,
        },
      });
      setIcon(removeEl, 'x');
      removeEl.addEventListener('click', () => {
        this.newTaskState = reduceNewTaskState(this.newTaskState, {
          type: 'context-removed',
          id: context.id,
        });
        this.options.onContextsChanged();
        this.render();
      });
    }

    if (this.newTaskState.contextError) {
      contextEl.createEl('p', {
        cls: 'dsh-new-task-context__error',
        text: this.newTaskState.contextError,
        attr: { role: 'alert' },
      });
    }
  }

  private addContext(context: NewTaskContextSelection): void {
    this.addContexts([context]);
  }

  private addContexts(contexts: readonly NewTaskContextSelection[]): void {
    try {
      this.newTaskState = reduceNewTaskState(this.newTaskState, {
        type: 'contexts-added',
        contexts,
      });
      this.options.onContextsChanged();
      this.render();
    } catch (error) {
      this.setContextError(error instanceof Error ? error.message : '无法加入所选上下文。');
    }
  }

  private setContextError(message: string): void {
    this.newTaskState = reduceNewTaskState(this.newTaskState, {
      type: 'context-error-changed',
      message,
    });
    this.render();
  }

  private contextPreview(context: NewTaskContextSelection): string {
    if (context.kind !== 'current-selection') return '发送时读取最新内容';
    const compact = context.content.replace(/\s+/gu, ' ').trim();
    return compact.length <= 120 ? compact : `${compact.slice(0, 120)}…`;
  }

  private async handlePrimaryAction(): Promise<void> {
    const snapshot = this.options.conversationHost.getSnapshot();
    if (snapshot.phase === 'running' || snapshot.phase === 'awaiting_permission') {
      await this.options.conversationHost.cancel();
      return;
    }
    if (!canSubmitNewTask(this.newTaskState, snapshot.phase)) return;

    const draft = this.newTaskState.draft;
    const contexts = this.newTaskState.contexts;
    const mode = this.newTaskState.mode;
    const workspace = this.newTaskState.workspace;
    new NewTaskReviewModal(
      this.app,
      draft,
      contexts,
      mode,
      workspace,
      async () => {
        const accepted = await this.options.conversationHost.submit({
          contexts,
          draft,
          mode,
          reader: this.options.contextHost,
          workspace,
        });
        if (accepted) {
          this.newTaskState = reduceNewTaskState(this.newTaskState, {
            type: 'draft-changed',
            draft: '',
          });
          if (this.textareaEl) this.textareaEl.value = '';
          this.syncSendButton();
        }
        return accepted;
      },
    ).open();
  }

  private syncConversationSurface(): void {
    const conversationEl = this.conversationEl;
    if (!conversationEl) {
      this.syncSendButton();
      return;
    }
    const snapshot = this.options.conversationHost.getSnapshot();
    conversationEl.empty();

    for (const message of snapshot.messages) {
      const messageEl = conversationEl.createEl('article', {
        cls: `dsh-new-task-message is-${message.role}`,
      });
      messageEl.createEl('strong', {
        cls: 'dsh-new-task-message__role',
        text: message.role === 'user' ? '你' : 'DeepSeek Harness',
      });
      messageEl.createEl('p', {
        cls: 'dsh-new-task-message__content',
        text: message.text || (message.role === 'assistant' ? '正在回复…' : ''),
      });
      const messageStatus = conversationMessageStatus(message);
      if (messageStatus) {
        messageEl.createSpan({
          cls: 'dsh-new-task-message__status',
          text: messageStatus,
        });
      }
    }

    if (snapshot.tools.length > 0) {
      const toolsEl = conversationEl.createEl('section', {
        cls: 'dsh-new-task-tools',
        attr: { 'aria-label': '工具调用' },
      });
      toolsEl.createEl('strong', { text: '工具调用' });
      toolsEl.createEl('p', {
        text: snapshot.tools.map((tool) => tool.toolName).join('、'),
      });
    }

    for (const taskTurn of snapshot.taskTurns) this.renderTaskTurn(conversationEl, taskTurn);

    if (snapshot.permission) this.renderPermission(conversationEl, snapshot);
    if (snapshot.error) {
      conversationEl.createEl('p', {
        cls: 'dsh-new-task-conversation__error',
        text: snapshot.error.message,
        attr: { role: 'alert' },
      });
    }

    const status = conversationPhaseStatus(snapshot, snapshot.mode ?? this.newTaskState.mode);
    if (status) {
      conversationEl.createEl('p', {
        cls: 'dsh-new-task-conversation__status',
        text: status,
      });
    }
    this.syncSendButton();
  }

  private renderTaskTurn(parentEl: HTMLElement, result: TaskWorkspaceTurnResult): void {
    const expanded = this.expandedTaskTurnIds.has(result.turnId);
    const visibleChanges = expanded
      ? result.changes
      : result.changes.slice(0, DEFAULT_VISIBLE_TASK_FILES);
    const resultEl = parentEl.createEl('section', {
      cls: `dsh-task-result${result.undone ? ' is-undone' : ''}`,
      attr: { 'aria-label': result.undone ? '已撤销的任务变更' : '任务变更' },
    });
    const headerEl = resultEl.createDiv({ cls: 'dsh-task-result__header' });
    const titleEl = headerEl.createDiv({ cls: 'dsh-task-result__title' });
    const iconEl = titleEl.createSpan({ cls: 'dsh-task-result__icon' });
    setIcon(iconEl, result.undone ? 'rotate-ccw' : 'files');
    const titleCopyEl = titleEl.createDiv();
    titleCopyEl.createEl('strong', {
      text: `${result.undone ? '已撤销' : '已编辑'} ${String(result.changes.length)} 个文件`,
    });
    titleCopyEl.createEl('p', { text: taskTurnSummary(result) });

    const actionsEl = headerEl.createDiv({ cls: 'dsh-task-result__actions' });
    const undoEl = actionsEl.createEl('button', {
      text: result.undone ? '已撤销' : '撤销',
      attr: { type: 'button' },
    });
    undoEl.disabled = result.undone
      || !result.canUndo
      || this.taskActionBusy.has(result.turnId);
    undoEl.addEventListener('click', () => {
      new TaskUndoModal(
        this.app,
        result,
        async () => await this.undoTaskTurn(result),
      ).open();
    });
    const reviewEl = actionsEl.createEl('button', {
      text: '审核',
      attr: { type: 'button' },
    });
    reviewEl.addEventListener('click', () => {
      new TaskChangeReviewModal(this.app, result).open();
    });

    const listEl = resultEl.createEl('ul', { cls: 'dsh-task-result__files' });
    for (const change of visibleChanges) {
      const itemEl = listEl.createEl('li');
      const fileEl = itemEl.createEl('button', {
        cls: 'dsh-task-result__file',
        attr: {
          type: 'button',
          'aria-label': `${taskChangeLabel(change)} ${change.relativePath}，点击审核，右键打开文件操作`,
        },
      });
      fileEl.createSpan({
        cls: `dsh-task-result__kind is-${change.kind}`,
        text: taskChangeLabel(change),
      });
      fileEl.createSpan({ cls: 'dsh-task-result__path', text: change.relativePath });
      fileEl.createSpan({
        cls: 'dsh-task-result__stats',
        text: taskChangeStats(change),
      });
      fileEl.addEventListener('click', () => {
        new TaskChangeReviewModal(this.app, result, change.relativePath).open();
      });
      fileEl.addEventListener('contextmenu', (rawEvent) => {
        rawEvent.preventDefault();
        this.openTaskFileMenu(rawEvent, result, change);
      });
    }
    if (result.changes.length > DEFAULT_VISIBLE_TASK_FILES) {
      const remaining = result.changes.length - DEFAULT_VISIBLE_TASK_FILES;
      const expandEl = resultEl.createEl('button', {
        cls: 'dsh-task-result__expand',
        text: expanded ? '收起文件' : `再显示 ${String(remaining)} 个文件`,
        attr: {
          type: 'button',
          'aria-expanded': expanded ? 'true' : 'false',
        },
      });
      expandEl.addEventListener('click', () => {
        if (expanded) this.expandedTaskTurnIds.delete(result.turnId);
        else this.expandedTaskTurnIds.add(result.turnId);
        this.syncConversationSurface();
      });
    }
    const actionError = this.taskActionErrors.get(result.turnId);
    if (actionError) {
      resultEl.createEl('p', {
        cls: 'dsh-task-result__error',
        text: actionError,
        attr: { role: 'alert' },
      });
    }
  }

  private openTaskFileMenu(
    event: MouseEvent,
    result: TaskWorkspaceTurnResult,
    change: TaskWorkspaceChange,
  ): void {
    const menu = new Menu();
    menu.addItem(item => item
      .setTitle('审核本次变更')
      .setIcon('scan-search')
      .onClick(() => new TaskChangeReviewModal(
        this.app,
        result,
        change.relativePath,
      ).open()));
    menu.addSeparator();
    menu.addItem(item => item
      .setTitle('使用默认应用打开')
      .setIcon('external-link')
      .setDisabled(change.kind === 'deleted')
      .onClick(() => this.runTaskFileAction(
        async () => await this.options.taskWorkspaceFileActions.openCurrentFile(
          result.workspace,
          change.relativePath,
        ),
      )));
    menu.addItem(item => item
      .setTitle('在资源管理器中显示')
      .setIcon('folder-open')
      .onClick(() => this.runTaskFileAction(
        async () => await this.options.taskWorkspaceFileActions.revealFile(
          result.workspace,
          change.relativePath,
        ),
      )));
    menu.addSeparator();
    menu.addItem(item => item
      .setTitle('复制相对路径')
      .setIcon('copy')
      .onClick(() => this.runTaskFileAction(
        async () => await this.options.taskWorkspaceFileActions.copyRelativePath(
          result.workspace,
          change.relativePath,
        ),
        '已复制相对路径',
      )));
    menu.addItem(item => item
      .setTitle('复制完整路径')
      .setIcon('copy')
      .onClick(() => this.runTaskFileAction(
        async () => await this.options.taskWorkspaceFileActions.copyAbsolutePath(
          result.workspace,
          change.relativePath,
        ),
        '已复制完整路径',
      )));
    menu.addItem(item => item
      .setTitle('复制当前文件内容')
      .setIcon('copy')
      .setDisabled(change.kind === 'deleted')
      .onClick(() => this.runTaskFileAction(
        async () => await this.options.taskWorkspaceFileActions.copyCurrentContent(
          result.workspace,
          change.relativePath,
        ),
        '已复制当前文件内容',
      )));
    menu.showAtMouseEvent(event);
  }

  private runTaskFileAction(action: () => Promise<void>, success?: string): void {
    void action()
      .then(() => {
        if (success) new Notice(success);
      })
      .catch((error: unknown) => new Notice(taskActionFailureMessage(error)));
  }

  private async undoTaskTurn(result: TaskWorkspaceTurnResult): Promise<void> {
    this.taskActionBusy.add(result.turnId);
    this.taskActionErrors.delete(result.turnId);
    this.syncConversationSurface();
    try {
      await this.options.conversationHost.undoTaskTurn(result.turnId);
      new Notice(`已安全撤销 ${String(result.changes.length)} 个文件的本轮变更`);
    } catch (error) {
      const message = taskActionFailureMessage(error);
      this.taskActionErrors.set(result.turnId, message);
      throw new Error(message);
    } finally {
      this.taskActionBusy.delete(result.turnId);
      this.syncConversationSurface();
    }
  }

  private renderPermission(
    parentEl: HTMLElement,
    snapshot: NewTaskConversationSnapshot,
  ): void {
    const permission = snapshot.permission;
    if (!permission) return;
    const permissionEl = parentEl.createEl('section', {
      cls: 'dsh-new-task-permission',
      attr: { 'aria-label': '本次权限请求' },
    });
    permissionEl.createEl('strong', { text: `请求调用 ${permission.toolName}` });
    if (permission.reason) permissionEl.createEl('p', { text: permission.reason });
    permissionEl.createEl('p', { text: '决定仅对本次请求有效。' });
    const actionsEl = permissionEl.createDiv({ cls: 'dsh-new-task-permission__actions' });
    for (const action of [
      { decision: 'reject', label: '拒绝' },
      { decision: 'allow-once', label: '仅本次允许' },
    ] as const satisfies readonly {
      readonly decision: BridgePermissionDecision;
      readonly label: string;
    }[]) {
      const buttonEl = actionsEl.createEl('button', {
        cls: action.decision === 'allow-once' ? 'mod-cta' : '',
        text: action.label,
        attr: { type: 'button' },
      });
      buttonEl.disabled = permission.resolving;
      buttonEl.addEventListener('click', () => {
        void this.options.conversationHost.resolvePermission(action.decision);
      });
    }
  }

  private syncSendButton(): void {
    const buttonEl = this.sendButtonEl;
    if (!buttonEl) return;
    const phase = this.options.conversationHost.getSnapshot().phase;
    if (phase === 'running' || phase === 'awaiting_permission') {
      buttonEl.setText('停止');
      buttonEl.disabled = false;
    } else if (phase === 'validating' || phase === 'starting') {
      buttonEl.setText('发送中…');
      buttonEl.disabled = true;
    } else if (phase === 'cancelling') {
      buttonEl.setText('正在停止…');
      buttonEl.disabled = true;
    } else if (phase === 'finalizing') {
      buttonEl.setText('正在核对变更…');
      buttonEl.disabled = true;
    } else {
      buttonEl.setText('发送');
      buttonEl.disabled = !canSubmitNewTask(this.newTaskState, phase);
    }
    buttonEl.setAttr('aria-disabled', buttonEl.disabled ? 'true' : 'false');
  }

  private renderRun(parentEl: HTMLElement): void {
    const health = this.options.getDshHealth();
    const state = createWorkbenchState(
      health,
      this.options.conversationHost.getSnapshot().runtimeStatus,
    );
    this.renderPageHeader(
      parentEl,
      '运行',
      '汇总当前能力、外部运行时和安全边界；健康检查成功不表示会话已经建立。',
    );

    const overviewEl = parentEl.createDiv({ cls: 'dsh-overview-status' });
    this.renderMetric(overviewEl, '工作台壳层', '可用', '中央标签页与内部导航');
    this.renderMetric(overviewEl, 'DSH 健康检查', state.healthCheckStatus, '手动执行固定 --version');
    this.renderMetric(overviewEl, '会话能力', '任务与对话入口', '由新建任务统一承载');
    this.renderMetric(overviewEl, 'Vault 权限', state.vaultPermissionStatus, state.platformStatus);

    const statusEl = parentEl.createEl('section', { cls: 'dsh-runtime-status' });
    this.renderStatusRow(statusEl, '连接状态', state.connectionStatus);
    this.renderStatusRow(statusEl, '运行时健康检查', state.healthCheckStatus);
    this.renderStatusRow(statusEl, 'Vault 权限', state.vaultPermissionStatus);
    this.renderStatusRow(statusEl, '平台', state.platformStatus);

    const actionsEl = parentEl.createDiv({ cls: 'dsh-runtime-actions' });
    const checkButtonEl = actionsEl.createEl('button', {
      cls: 'mod-cta dsh-action',
      text: health.status === 'checking' ? '正在检查…' : '检查 DSH',
      attr: {
        type: 'button',
        'aria-busy': health.status === 'checking' ? 'true' : 'false',
      },
    });
    checkButtonEl.disabled = health.status === 'checking';
    checkButtonEl.addEventListener('click', () => {
      void this.options.runDshHealthCheck();
    });
    actionsEl.createSpan({
      cls: 'dsh-runtime-actions__hint',
      text: '命令路径可在插件设置中修改。',
    });

    parentEl.createEl('p', {
      cls: 'dsh-runtime-boundary',
      text: '此健康检查只执行固定的 --version；本操作不读取或写入 Vault，不启动会话，也不使用模型网络。',
    });
    parentEl.createEl('p', {
      cls: 'dsh-runtime-legend',
      text: '状态图例：尚未检测 → 检查中（禁用重复操作）→ 可用 / 明确错误',
    });
  }

  private renderPageHeader(
    parentEl: HTMLElement,
    title: string,
    summary: string,
    compactSummary?: string,
  ): void {
    const headerEl = parentEl.createEl('header', { cls: 'dsh-page-header' });
    headerEl.createEl('h2', { text: title });
    headerEl.createEl('p', {
      cls: `dsh-page-header__summary${compactSummary ? ' is-wide' : ''}`,
      text: summary,
    });
    if (compactSummary) {
      headerEl.createEl('p', {
        cls: 'dsh-page-header__summary is-compact',
        text: compactSummary,
      });
    }
  }

  private renderMetric(
    parentEl: HTMLElement,
    label: string,
    value: string,
    detail: string,
  ): void {
    const metricEl = parentEl.createDiv({ cls: 'dsh-overview-metric' });
    metricEl.createSpan({ cls: 'dsh-overview-metric__label', text: label });
    metricEl.createEl('strong', { text: value });
    metricEl.createSpan({ cls: 'dsh-overview-metric__detail', text: detail });
  }

  private renderStatusRow(parentEl: HTMLElement, label: string, value: string): void {
    const rowEl = parentEl.createDiv({ cls: 'dsh-runtime-status__row' });
    rowEl.createSpan({ cls: 'dsh-runtime-status__label', text: label });
    rowEl.createSpan({ cls: 'dsh-runtime-status__value', text: value });
  }
}

class NewTaskReviewModal extends Modal {
  constructor(
    app: WorkbenchView['app'],
    private readonly draft: string,
    private readonly contexts: readonly NewTaskContextSelection[],
    private readonly mode: NewTaskMode,
    private readonly workspace: TaskWorkspaceSelection | null,
    private readonly onConfirm: () => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('确认发送');
    this.contentEl.createEl('p', {
      cls: 'dsh-new-task-review__boundary',
      text: this.mode === 'task'
        ? '本次任务只允许访问所选 Vault 外工作区；文件工具逐次确认，不开放 Shell、网络、Skill 或子代理，也不写入知识库。'
        : '本次为只读对话：仅发送下列任务和你明确选择的笔记；不开放 DSH 工具，不写入知识库。',
    });
    this.contentEl.createEl('strong', { text: '任务' });
    this.contentEl.createEl('pre', {
      cls: 'dsh-new-task-review__task',
      text: this.draft.trim(),
    });
    this.contentEl.createEl('strong', { text: '已选笔记' });
    if (this.contexts.length === 0) {
      this.contentEl.createEl('p', { text: '无' });
    } else {
      const listEl = this.contentEl.createEl('ul', { cls: 'dsh-new-task-review__contexts' });
      for (const context of this.contexts) {
        listEl.createEl('li', { text: contextSelectionLabel(context) });
      }
    }
    if (this.mode === 'task') {
      this.contentEl.createEl('strong', { text: '任务工作区' });
      this.contentEl.createEl('p', {
        cls: 'dsh-new-task-review__workspace',
        text: this.workspace
          ? `${this.workspace.name}（Vault 外目录）`
          : '未选择',
      });
    }

    const errorEl = this.contentEl.createEl('p', {
      cls: 'dsh-new-task-review__error',
      attr: { role: 'alert' },
    });
    const actionsEl = this.contentEl.createDiv({ cls: 'dsh-new-task-review__actions' });
    const cancelEl = actionsEl.createEl('button', {
      text: '取消',
      attr: { type: 'button' },
    });
    cancelEl.addEventListener('click', () => this.close());
    const confirmEl = actionsEl.createEl('button', {
      cls: 'mod-cta dsh-new-task-review__confirm',
      text: '确认发送',
      attr: { type: 'button' },
    });
    confirmEl.addEventListener('click', () => {
      void this.confirm(confirmEl, cancelEl, errorEl);
    });
  }

  private async confirm(
    confirmEl: HTMLButtonElement,
    cancelEl: HTMLButtonElement,
    errorEl: HTMLElement,
  ): Promise<void> {
    confirmEl.disabled = true;
    cancelEl.disabled = true;
    errorEl.setText('');
    const accepted = await this.onConfirm();
    if (accepted) {
      this.close();
      return;
    }
    const failure = '发送未被接受，请返回工作台查看错误并重试。';
    errorEl.setText(failure);
    confirmEl.disabled = false;
    cancelEl.disabled = false;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class TaskChangeReviewModal extends Modal {
  constructor(
    app: WorkbenchView['app'],
    private readonly result: TaskWorkspaceTurnResult,
    private readonly relativePath?: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const selectedChanges = this.relativePath
      ? this.result.changes.filter(change => change.relativePath === this.relativePath)
      : this.result.changes;
    const changes = selectedChanges.slice(0, MAX_REVIEW_PREVIEW_FILES);
    this.setTitle(this.relativePath ? '审核文件变更' : '审核本轮文件变更');
    this.contentEl.createEl('p', {
      cls: 'dsh-task-review__summary',
      text: `${String(selectedChanges.length)} 个文件 · ${taskTurnSummary(this.result)}`,
    });
    if (selectedChanges.length === 0) {
      this.contentEl.createEl('p', { text: '没有可审核的文件变更。' });
      return;
    }
    if (selectedChanges.length > changes.length) {
      this.contentEl.createEl('p', {
        cls: 'dsh-task-review__truncated',
        text: `为保持界面流畅，本窗口先显示前 ${String(MAX_REVIEW_PREVIEW_FILES)} 个文件；其余文件可从展开后的文件行逐项审核。`,
      });
    }
    for (const change of changes) this.renderChange(change);
  }

  private renderChange(change: TaskWorkspaceChange): void {
    const changeEl = this.contentEl.createEl('section', { cls: 'dsh-task-review__change' });
    const headerEl = changeEl.createDiv({ cls: 'dsh-task-review__header' });
    headerEl.createEl('strong', { text: change.relativePath });
    headerEl.createSpan({ text: `${taskChangeLabel(change)} · ${taskChangeStats(change)}` });
    if (!change.review) {
      changeEl.createEl('p', {
        cls: 'dsh-task-review__unavailable',
        text: change.kind === 'deleted'
          ? '二进制或过大文本不提供内嵌前后快照；当前文件已删除，可通过右键菜单复制路径或定位原位置。'
          : '二进制或过大文本不提供内嵌前后快照；可通过文件右键菜单打开或复制当前内容。',
      });
      return;
    }
    const diffEl = changeEl.createDiv({ cls: 'dsh-task-review__diff' });
    this.renderSnapshot(diffEl, '修改前', change.review.before, '文件不存在');
    this.renderSnapshot(diffEl, '修改后', change.review.after, '文件已删除');
  }

  private renderSnapshot(
    parentEl: HTMLElement,
    label: string,
    value: string | null,
    emptyLabel: string,
  ): void {
    const panelEl = parentEl.createDiv({ cls: 'dsh-task-review__panel' });
    panelEl.createEl('strong', { text: label });
    const preview = createReviewPreview(value, emptyLabel);
    panelEl.createEl('pre', { text: preview.text });
    if (preview.truncated) {
      panelEl.createEl('p', {
        cls: 'dsh-task-review__truncated',
        text: '内容较长，为保持界面流畅仅显示前 2,000 行或 200,000 个字符。',
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class TaskUndoModal extends Modal {
  constructor(
    app: WorkbenchView['app'],
    private readonly result: TaskWorkspaceTurnResult,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('确认撤销本轮文件变更');
    this.contentEl.createEl('p', {
      cls: 'dsh-task-undo__warning',
      text: `将恢复 ${String(this.result.changes.length)} 个文件到本轮任务开始前。任何文件在任务结束后又有变化时，整个撤销都不会写入。`,
    });
    const listEl = this.contentEl.createEl('ul', { cls: 'dsh-task-undo__files' });
    for (const change of this.result.changes) {
      listEl.createEl('li', { text: `${taskChangeLabel(change)} ${change.relativePath}` });
    }
    const errorEl = this.contentEl.createEl('p', {
      cls: 'dsh-task-undo__error',
      attr: { role: 'alert' },
    });
    const actionsEl = this.contentEl.createDiv({ cls: 'dsh-task-undo__actions' });
    const cancelEl = actionsEl.createEl('button', {
      text: '取消',
      attr: { type: 'button' },
    });
    cancelEl.addEventListener('click', () => this.close());
    const confirmEl = actionsEl.createEl('button', {
      cls: 'mod-warning',
      text: '确认撤销',
      attr: { type: 'button' },
    });
    confirmEl.addEventListener('click', () => {
      void this.confirm(confirmEl, cancelEl, errorEl);
    });
  }

  private async confirm(
    confirmEl: HTMLButtonElement,
    cancelEl: HTMLButtonElement,
    errorEl: HTMLElement,
  ): Promise<void> {
    confirmEl.disabled = true;
    cancelEl.disabled = true;
    errorEl.setText('');
    try {
      await this.onConfirm();
      this.close();
    } catch (error) {
      errorEl.setText(taskActionFailureMessage(error));
      confirmEl.disabled = false;
      cancelEl.disabled = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function conversationMessageStatus(message: NewTaskConversationMessage): string | undefined {
  if (message.delivery === 'pending') return '正在发送';
  if (message.delivery === 'failed') return '发送失败';
  if (message.interrupted === true) return '已中断';
  return undefined;
}

function conversationPhaseStatus(
  snapshot: NewTaskConversationSnapshot,
  mode: NewTaskMode,
): string | undefined {
  const statuses: Readonly<Partial<Record<NewTaskConversationSnapshot['phase'], string>>> = {
    awaiting_permission: '等待本次权限决定',
    cancelled: '已停止',
    cancelling: '正在停止…',
    completed: mode === 'task' ? '任务完成' : '回复完成',
    failed: mode === 'task' ? '本次任务失败' : '本次对话失败',
    finalizing: '正在核对文件变更…',
    running: mode === 'task' ? 'DSH 正在执行任务…' : 'DSH 正在回复…',
    starting: '正在连接 DSH…',
    validating: mode === 'task' ? '正在校验工作区和只读笔记…' : '正在校验只读笔记…',
  };
  return statuses[snapshot.phase];
}

function canChangeMode(phase: NewTaskConversationSnapshot['phase']): boolean {
  return phase === 'idle'
    || phase === 'cancelled'
    || phase === 'completed'
    || phase === 'failed';
}

function taskTurnSummary(result: NewTaskConversationSnapshot['taskTurns'][number]): string {
  if (result.undone) return `${result.workspace.name} · 已安全撤销`;
  if (result.additions === null || result.deletions === null) {
    return `${result.workspace.name} · 包含二进制或过大文本`;
  }
  return `${result.workspace.name} · +${String(result.additions)} -${String(result.deletions)} · 变更事实已记录`;
}

function taskChangeLabel(change: TaskWorkspaceChange): string {
  return { created: '新建', deleted: '删除', modified: '修改' }[change.kind];
}

function taskChangeStats(change: TaskWorkspaceChange): string {
  if (change.additions === null || change.deletions === null) return '文本统计不可用';
  return `+${String(change.additions)} -${String(change.deletions)}`;
}

function taskActionFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '文件操作失败，请检查工作区状态后重试。';
}

function createReviewPreview(value: string | null, emptyLabel: string): {
  readonly text: string;
  readonly truncated: boolean;
} {
  if (value === null) return { text: emptyLabel, truncated: false };
  const lines = value.replace(/\r\n/gu, '\n').split('\n');
  const lineLimited = lines.length > MAX_REVIEW_PREVIEW_LINES;
  const joined = lines.slice(0, MAX_REVIEW_PREVIEW_LINES).join('\n');
  const characterLimited = joined.length > MAX_REVIEW_PREVIEW_CHARACTERS;
  return {
    text: characterLimited ? joined.slice(0, MAX_REVIEW_PREVIEW_CHARACTERS) : joined,
    truncated: lineLimited || characterLimited,
  };
}
