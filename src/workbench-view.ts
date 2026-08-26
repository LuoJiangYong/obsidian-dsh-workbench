import { ItemView, setIcon, type IconName, type WorkspaceLeaf } from 'obsidian';

import type { DshHealthResult } from './dsh-health';
import { DEEPSEEK_WHALE_ICON } from './icons';
import {
  canSubmitNewTask,
  createNewTaskState,
  type NewTaskMode,
  type NewTaskState,
  reduceNewTaskState,
} from './new-task-state';
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_WORKBENCH = 'deepseek-harness-workbench-view';

const BRAND_DEEPSEEK = 'DeepSeek';
const NEW_TASK_HEADING = '今天想让 DeepSeek Harness 做什么？';
const NEW_TASK_PLACEHOLDER = '描述目标，@ 引用上下文，/ 调用 Skill 或命令';

type WorkbenchSectionId = 'new-task' | 'run';
type DisabledNavigationId =
  | 'projects'
  | 'integrations'
  | 'automation'
  | 'library'
  | 'domain-workbenches';

type WorkbenchNavigationItem =
  | {
      readonly availability: 'available';
      readonly icon: IconName;
      readonly id: WorkbenchSectionId;
      readonly label: string;
    }
  | {
      readonly availability: 'disabled';
      readonly icon: IconName;
      readonly id: DisabledNavigationId;
      readonly label: string;
    };

const WORKBENCH_NAVIGATION: readonly WorkbenchNavigationItem[] = Object.freeze([
  { availability: 'available', icon: 'circle-plus', id: 'new-task', label: '新建任务' },
  { availability: 'disabled', icon: 'folder-kanban', id: 'projects', label: '项目' },
  {
    availability: 'disabled',
    icon: 'blocks',
    id: 'integrations',
    label: '专家 · Skill · 连接器',
  },
  { availability: 'disabled', icon: 'alarm-clock', id: 'automation', label: '自动化' },
  { availability: 'disabled', icon: 'library-big', id: 'library', label: '资料库' },
  {
    availability: 'disabled',
    icon: 'panels-top-left',
    id: 'domain-workbenches',
    label: '领域工作台',
  },
  { availability: 'available', icon: 'activity', id: 'run', label: '运行' },
]);

interface WorkbenchViewOptions {
  readonly getDshHealth: () => DshHealthResult;
  readonly runDshHealthCheck: () => Promise<void>;
}

export class WorkbenchView extends ItemView {
  private activeSection: WorkbenchSectionId = 'new-task';
  private newTaskState: NewTaskState = createNewTaskState();

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
    this.render();
  }

  render(): void {
    const { contentEl } = this;
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
    this.contentEl.empty();
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

      if (item.availability === 'disabled') {
        buttonEl.disabled = true;
        buttonEl.setAttr('aria-disabled', 'true');
        continue;
      }

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
      const optionEl = selectEl.createEl('option', { text: item.label, value: item.id });
      optionEl.disabled = item.availability === 'disabled';
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
    this.renderPageHeader(
      parentEl,
      '新建任务',
      '与 DeepSeek Harness 对话，定义任务、选择上下文，并在执行前审阅权限与变更边界。',
      '与 DeepSeek Harness 对话，选择上下文，并在执行前审阅权限与变更边界。',
    );

    const taskEl = parentEl.createEl('section', { cls: 'dsh-new-task' });
    taskEl.createEl('h3', { text: NEW_TASK_HEADING });
    this.renderNewTaskModes(taskEl);

    const composerEl = taskEl.createDiv({ cls: 'dsh-new-task-composer' });
    const textareaEl = composerEl.createEl('textarea', {
      cls: 'dsh-new-task-composer__input',
      attr: {
        'aria-label': '任务描述',
        placeholder: NEW_TASK_PLACEHOLDER,
        rows: '7',
      },
    });
    textareaEl.value = this.newTaskState.draft;

    const footerEl = composerEl.createDiv({ cls: 'dsh-new-task-composer__footer' });
    const toolsEl = footerEl.createDiv({ cls: 'dsh-new-task-composer__tools' });
    this.renderDisabledComposerTool(toolsEl, 'circle-plus', '添加附件', 'attachment');
    this.renderDisabledComposerTool(toolsEl, 'files', '选择上下文');
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
    this.syncSendButton(sendButtonEl);
    textareaEl.addEventListener('input', () => {
      this.newTaskState = reduceNewTaskState(this.newTaskState, {
        type: 'draft-changed',
        draft: textareaEl.value,
      });
      this.syncSendButton(sendButtonEl);
    });

    const confirmationEl = taskEl.createEl('section', { cls: 'dsh-new-task-confirmation' });
    const confirmationIconEl = confirmationEl.createSpan({
      cls: 'dsh-new-task-confirmation__icon',
    });
    setIcon(confirmationIconEl, 'shield-check');
    const confirmationCopyEl = confirmationEl.createDiv();
    confirmationCopyEl.createEl('strong', { text: '执行前确认' });
    confirmationCopyEl.createEl('p', {
      text: '发送前展示上下文、权限和拟变更内容，并允许用户取消。',
    });
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

  private syncSendButton(buttonEl: HTMLButtonElement): void {
    buttonEl.disabled = !canSubmitNewTask(this.newTaskState);
    buttonEl.setAttr('aria-disabled', buttonEl.disabled ? 'true' : 'false');
  }

  private renderRun(parentEl: HTMLElement): void {
    const health = this.options.getDshHealth();
    const state = createWorkbenchState(health);
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
      text: '本版本只在手动检查时执行固定的 --version；不读取或写入 Vault，不启动会话，也不使用模型网络。',
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
