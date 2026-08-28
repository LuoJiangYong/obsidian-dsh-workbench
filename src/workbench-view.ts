import { ItemView, Modal, setIcon, type IconName, type WorkspaceLeaf } from 'obsidian';

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
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_WORKBENCH = 'deepseek-harness-workbench-view';

const BRAND_DEEPSEEK = 'DeepSeek';
const NEW_TASK_HEADING = '今天想让 DeepSeek Harness 做什么？';
const NEW_TASK_PLACEHOLDER = '描述目标，@ 引用上下文，/ 调用 Skill 或命令';

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
}

export class WorkbenchView extends ItemView {
  private activeSection: WorkbenchSectionId = 'new-task';
  private conversationEl: HTMLElement | undefined;
  private detachConversation: (() => void) | undefined;
  private newTaskState: NewTaskState = createNewTaskState();
  private sendButtonEl: HTMLButtonElement | undefined;
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

    this.renderSelectedContexts(composerEl);
    const footerEl = composerEl.createDiv({ cls: 'dsh-new-task-composer__footer' });
    const toolsEl = footerEl.createDiv({ cls: 'dsh-new-task-composer__tools' });
    this.renderDisabledComposerTool(toolsEl, 'circle-plus', '添加附件', 'attachment');
    this.renderContextTool(toolsEl);
    this.renderDisabledComposerTool(toolsEl, 'shield-check', '默认权限');

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
      text: '发送前确认任务和只读笔记；对话不开放 DSH 工具，也不会写入知识库。',
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
    new NewTaskReviewModal(
      this.app,
      draft,
      contexts,
      async () => {
        const accepted = await this.options.conversationHost.submit({
          contexts,
          draft,
          mode,
          reader: this.options.contextHost,
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

    if (snapshot.permission) this.renderPermission(conversationEl, snapshot);
    if (snapshot.error) {
      conversationEl.createEl('p', {
        cls: 'dsh-new-task-conversation__error',
        text: snapshot.error.message,
        attr: { role: 'alert' },
      });
    }

    const status = conversationPhaseStatus(snapshot);
    if (status) {
      conversationEl.createEl('p', {
        cls: 'dsh-new-task-conversation__status',
        text: status,
      });
    }
    this.syncSendButton();
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
    private readonly onConfirm: () => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('确认发送');
    this.contentEl.createEl('p', {
      cls: 'dsh-new-task-review__boundary',
      text: '本次为只读对话：仅发送下列任务和你明确选择的笔记；不开放 DSH 工具，不写入知识库。',
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

function conversationMessageStatus(message: NewTaskConversationMessage): string | undefined {
  if (message.delivery === 'pending') return '正在发送';
  if (message.delivery === 'failed') return '发送失败';
  if (message.interrupted === true) return '已中断';
  return undefined;
}

function conversationPhaseStatus(snapshot: NewTaskConversationSnapshot): string | undefined {
  const statuses: Readonly<Partial<Record<NewTaskConversationSnapshot['phase'], string>>> = {
    awaiting_permission: '等待本次权限决定',
    cancelled: '已停止',
    cancelling: '正在停止…',
    completed: '回复完成',
    failed: '本次对话失败',
    running: 'DSH 正在回复…',
    starting: '正在连接 DSH…',
    validating: '正在校验只读笔记…',
  };
  return statuses[snapshot.phase];
}
