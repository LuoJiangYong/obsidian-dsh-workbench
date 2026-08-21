import { ItemView, setIcon, type IconName, type WorkspaceLeaf } from 'obsidian';

import type { DshHealthResult } from './dsh-health';
import { createWorkbenchState } from './workbench-state';

export const VIEW_TYPE_WORKBENCH = 'deepseek-harness-workbench-view';

type WorkbenchSectionId = 'overview' | 'runtime-status';
type WorkbenchNavigationId =
  | WorkbenchSectionId
  | 'assistant'
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
      readonly availability: 'planned';
      readonly icon: IconName;
      readonly id: Exclude<WorkbenchNavigationId, WorkbenchSectionId>;
      readonly label: string;
    };

const WORKBENCH_NAVIGATION: readonly WorkbenchNavigationItem[] = Object.freeze([
  { availability: 'available', icon: 'layout-dashboard', id: 'overview', label: '概览' },
  { availability: 'available', icon: 'activity', id: 'runtime-status', label: '运行状态' },
  { availability: 'planned', icon: 'bot', id: 'assistant', label: '助手' },
  { availability: 'planned', icon: 'folder-kanban', id: 'projects', label: '项目' },
  {
    availability: 'planned',
    icon: 'blocks',
    id: 'integrations',
    label: '专家 · Skill · 连接器',
  },
  { availability: 'planned', icon: 'alarm-clock', id: 'automation', label: '自动化' },
  { availability: 'planned', icon: 'library-big', id: 'library', label: '资料库' },
  {
    availability: 'planned',
    icon: 'panels-top-left',
    id: 'domain-workbenches',
    label: '领域工作台',
  },
]);

interface WorkbenchViewOptions {
  readonly getDshHealth: () => DshHealthResult;
  readonly runDshHealthCheck: () => Promise<void>;
}

export class WorkbenchView extends ItemView {
  private activeSection: WorkbenchSectionId = 'overview';

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
    contentEl.empty();
    contentEl.addClass('dsh-workbench-view');

    const shellEl = contentEl.createDiv({ cls: 'dsh-workbench-shell' });
    this.renderNavigation(shellEl);

    const mainEl = shellEl.createEl('main', { cls: 'dsh-workbench-main' });
    this.renderMobileNavigation(mainEl);
    if (this.activeSection === 'runtime-status') {
      this.renderRuntimeStatus(mainEl);
      return;
    }
    this.renderOverview(mainEl);
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private renderNavigation(parentEl: HTMLElement): void {
    const sidebarEl = parentEl.createEl('aside', { cls: 'dsh-workbench-sidebar' });
    const brandEl = sidebarEl.createDiv({ cls: 'dsh-workbench-brand' });
    const brandIconEl = brandEl.createSpan({ cls: 'dsh-workbench-brand__icon' });
    setIcon(brandIconEl, 'bot');
    const brandCopyEl = brandEl.createDiv();
    brandCopyEl.createEl('strong', { text: 'DeepSeek Harness Workbench' });
    brandCopyEl.createSpan({ text: '智能体工作台' });

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

      if (item.availability === 'planned') {
        buttonEl.disabled = true;
        buttonEl.setAttr('title', '规划中：当前没有可用能力');
        buttonEl.createSpan({ cls: 'dsh-navigation__planned', text: '规划中' });
        continue;
      }

      buttonEl.addEventListener('click', () => {
        this.activeSection = item.id;
        this.render();
      });
    }

    const footerEl = sidebarEl.createDiv({ cls: 'dsh-workbench-sidebar__footer' });
    footerEl.createEl('p', {
      text: '当前仅开放概览与只读运行状态；会话、Vault 和领域模块仍未启用。',
    });
  }

  private renderMobileNavigation(parentEl: HTMLElement): void {
    const wrapperEl = parentEl.createDiv({ cls: 'dsh-mobile-navigation' });
    const iconEl = wrapperEl.createSpan({ cls: 'dsh-mobile-navigation__icon' });
    setIcon(iconEl, 'menu');
    const selectEl = wrapperEl.createEl('select', {
      attr: { 'aria-label': '选择工作台页面' },
    });
    for (const item of WORKBENCH_NAVIGATION) {
      const optionEl = selectEl.createEl('option', {
        text: item.availability === 'planned' ? `${item.label}（规划中）` : item.label,
        value: item.id,
      });
      optionEl.disabled = item.availability === 'planned';
    }
    selectEl.value = this.activeSection;
    selectEl.addEventListener('change', () => {
      if (selectEl.value === 'overview' || selectEl.value === 'runtime-status') {
        this.activeSection = selectEl.value;
        this.render();
      }
    });
  }

  private renderOverview(parentEl: HTMLElement): void {
    const health = this.options.getDshHealth();
    const state = createWorkbenchState(health);
    this.renderPageHeader(
      parentEl,
      '概览',
      '先确认当前能力边界，再进入运行检查或后续获批的工作台模块。',
      '当前真实能力',
    );

    const statusEl = parentEl.createDiv({ cls: 'dsh-overview-status' });
    this.renderMetric(statusEl, '工作台壳层', '可用', '中央标签页与内部导航');
    this.renderMetric(statusEl, 'DSH 健康检查', state.healthCheckStatus, '仅固定 --version');
    this.renderMetric(statusEl, '会话能力', '尚未实现', state.connectionStatus);
    this.renderMetric(statusEl, 'Vault 权限', state.vaultPermissionStatus, state.platformStatus);

    const primarySectionEl = parentEl.createEl('section', { cls: 'dsh-overview-primary' });
    const primaryCopyEl = primarySectionEl.createDiv();
    primaryCopyEl.createEl('h3', { text: '确认外部运行时' });
    primaryCopyEl.createEl('p', {
      text: '进入运行状态，手动检查当前配置的 DSH 命令和精确目标版本。',
    });
    const actionEl = primarySectionEl.createEl('button', {
      cls: 'mod-cta dsh-action',
      attr: { type: 'button' },
    });
    setIcon(actionEl, 'activity');
    actionEl.createSpan({ text: '查看运行状态' });
    actionEl.addEventListener('click', () => {
      this.activeSection = 'runtime-status';
      this.render();
    });

    const boundaryEl = parentEl.createEl('section', { cls: 'dsh-boundary' });
    const boundaryIconEl = boundaryEl.createSpan({ cls: 'dsh-boundary__icon' });
    setIcon(boundaryIconEl, 'shield-check');
    const boundaryCopyEl = boundaryEl.createDiv();
    boundaryCopyEl.createEl('strong', { text: '当前安全边界' });
    boundaryCopyEl.createEl('p', {
      text: '会话能力尚未实现；Vault 权限未启用。规划中的模块不会加载数据或执行操作。',
    });
  }

  private renderRuntimeStatus(parentEl: HTMLElement): void {
    const health = this.options.getDshHealth();
    const state = createWorkbenchState(health);
    this.renderPageHeader(
      parentEl,
      '运行状态',
      '验证当前 DSH 命令是否可执行；健康检查成功不表示已经建立会话连接。',
      '只读检查',
    );

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
  }

  private renderPageHeader(
    parentEl: HTMLElement,
    title: string,
    summary: string,
    badge: string,
  ): void {
    const headerEl = parentEl.createEl('header', { cls: 'dsh-page-header' });
    const titleRowEl = headerEl.createDiv({ cls: 'dsh-page-header__title-row' });
    titleRowEl.createEl('h2', { text: title });
    titleRowEl.createSpan({ cls: 'dsh-page-header__badge', text: badge });
    headerEl.createEl('p', { cls: 'dsh-page-header__summary', text: summary });
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
