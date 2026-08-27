import { beforeEach, describe, expect, it } from 'vitest';

import DeepSeekHarnessWorkbenchPlugin from '../src/main';
import {
  VIEW_TYPE_QUICK_ASSISTANT,
  type QuickAssistantView,
} from '../src/quick-assistant-view';
import { VIEW_TYPE_WORKBENCH, type WorkbenchView } from '../src/workbench-view';
import {
  Editor,
  MarkdownView,
  type MockElement,
  mockObsidian,
  resetMockObsidian,
} from './mocks/obsidian';

type ConstructablePlugin = new () => DeepSeekHarnessWorkbenchPlugin;

describe('原生 Workbench 插件基线', () => {
  beforeEach(() => {
    resetMockObsidian();
  });

  it('注册中央 Workbench、可选快速助手、ribbon 和命令入口', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();

    await plugin.onload();

    expect(mockObsidian.views.has(VIEW_TYPE_WORKBENCH)).toBe(true);
    expect(mockObsidian.views.has(VIEW_TYPE_QUICK_ASSISTANT)).toBe(true);
    expect(mockObsidian.ribbonCallbacks).toHaveLength(1);
    expect(mockObsidian.ribbonIcons).toEqual(['deepseek-whale']);
    expect(mockObsidian.icons.get('deepseek-whale')).toContain('transform="scale(2)"');
    expect(mockObsidian.settingTabs).toHaveLength(1);
    expect(mockObsidian.commands).toEqual([
      expect.objectContaining({ id: 'open-workbench', name: '打开工作台' }),
      expect.objectContaining({ id: 'open-quick-assistant', name: '打开快速助手' }),
    ]);
  });

  it('在中央标签页打开并复用 Workbench 视图', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();

    await plugin.activateWorkbench();
    const firstLeaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)[0];
    expect(firstLeaf).toBeDefined();
    expect(firstLeaf).not.toBe(mockObsidian.lastApp?.workspace.rightLeaf);
    expect(mockObsidian.lastApp?.workspace.requestedLeafTypes).toEqual(['tab']);
    expect(mockObsidian.lastApp?.workspace.revealedLeaf).toBe(firstLeaf);

    await plugin.activateWorkbench();
    expect(plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)).toHaveLength(1);
    expect(mockObsidian.lastApp?.workspace.requestedLeafTypes).toEqual(['tab']);
  });

  it('按用户反馈渲染精简导航和胶囊模式，并把不可用动作保持为真实禁用态', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();

    const creator = mockObsidian.views.get(VIEW_TYPE_WORKBENCH);
    expect(creator).toBeDefined();
    if (!creator) throw new Error('Workbench 视图未注册');

    const app = mockObsidian.lastApp;
    const leaf = app?.workspace.getLeaf('tab');
    if (!app || !leaf) throw new Error('测试 Obsidian app 未建立');
    const activeFile = app.vault.addMarkdownFile('项目/周报.md', '# 周报\n本周完成上下文接入');
    app.workspace.activeFile = activeFile;
    app.workspace.activeMarkdownView = new MarkdownView(
      activeFile,
      new Editor('本周完成上下文接入', { ch: 0, line: 1 }, { ch: 9, line: 1 }),
    );
    const view = creator(leaf) as WorkbenchView;
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    expect(content.allText()).toEqual(expect.arrayContaining([
      'DeepSeek',
      'Harness',
      'Workbench',
      '新建任务',
      '运行',
      '与 DeepSeek Harness 对话，定义任务、选择知识库内容，并在执行前审阅权限与变更边界。',
      '今天想让 DeepSeek Harness 做什么？',
      '对话',
      '任务执行',
      '代码协作',
      '添加附件',
      '选择知识库',
      '默认权限',
      '模型由 DSH 配置管理',
      '发送',
      '执行前确认',
      '发送前确认任务和只读笔记；对话不开放 DSH 工具，也不会写入知识库。',
    ]));
    expect(content.allText().join('\n')).not.toMatch(/规划中|尚未实现|首发/);
    expect(content.allText().join('\n')).not.toMatch(/项目|专家 · Skill · 连接器|自动化|资料库|领域工作台/u);

    const navigationItems = content.findAllByClass('dsh-navigation__item');
    expect(navigationItems).toHaveLength(2);
    expect(navigationItems.every((item) => !item.disabled)).toBe(true);
    expect(navigationItems[0]?.attributes.get('aria-current')).toBe('page');

    const mobileOptions = content.findAllByTag('option');
    expect(mobileOptions).toHaveLength(2);
    expect(mobileOptions.every((item) => !item.disabled)).toBe(true);

    const modeButtons = content.findAllByClass('dsh-new-task-mode__button');
    expect(modeButtons).toHaveLength(3);
    expect(modeButtons[0]?.classes.has('is-active')).toBe(true);
    expect(modeButtons[2]?.disabled).toBe(true);

    const composer = content.findAllByTag('textarea')[0];
    const sendButton = content.findAllByClass('dsh-new-task-composer__send')[0];
    expect(composer).toBeDefined();
    expect(composer?.attributes.get('placeholder')).toBe('描述目标，@ 引用上下文，/ 调用 Skill 或命令');
    expect(sendButton?.disabled).toBe(true);
    const contextButton = content.findAllByClass('dsh-new-task-context__open')[0];
    expect(contextButton?.disabled).toBe(false);

    await modeButtons[1]?.click();
    const rerenderedModeButtons = content.findAllByClass('dsh-new-task-mode__button');
    expect(rerenderedModeButtons[1]?.classes.has('is-active')).toBe(true);

    const rerenderedComposer = content.findAllByTag('textarea')[0];
    if (!rerenderedComposer) throw new Error('任务输入未渲染');
    rerenderedComposer.value = '整理本周项目进展';
    await rerenderedComposer.trigger('input');
    expect(content.findAllByClass('dsh-new-task-composer__send')[0]?.disabled).toBe(true);

    await content.findAllByClass('dsh-new-task-context__open')[0]?.click();
    const contextModal = mockObsidian.openModals[0];
    expect(contextModal?.title).toBe('选择知识库内容');
    const modalChoices = contextModal?.contentEl.findAllByClass('dsh-context-picker__choice') ?? [];
    await modalChoices[1]?.click();
    expect(content.allText()).toEqual(expect.arrayContaining([
      '已选笔记',
      '当前选区 · 项目/周报.md',
      '本周完成上下文接入',
    ]));
    expect(view.getContextSummary()).toBe('已选择 1 项：当前选区 · 项目/周报.md');
    expect(content.findAllByTag('textarea')[0]?.value).toBe('整理本周项目进展');
    expect(content.findAllByClass('dsh-new-task-composer__send')[0]?.disabled).toBe(true);

    await content.findAllByClass('dsh-new-task-context__remove')[0]?.click();
    expect(content.allText()).not.toContain('当前选区 · 项目/周报.md');
    expect(content.findAllByTag('textarea')[0]?.value).toBe('整理本周项目进展');

    await content.findAllByClass('dsh-navigation__item')[1]?.click();
    expect(content.allText()).toEqual(expect.arrayContaining([
      '运行',
      '汇总当前能力、外部运行时和安全边界；健康检查成功不表示会话已经建立。',
      '工作台壳层',
      '可用',
      '中央标签页与内部导航',
      '检查 DSH',
      '只读上下文（显式选择）',
      '此健康检查只执行固定的 --version；本操作不读取或写入 Vault，不启动会话，也不使用模型网络。',
    ]));

    await view.onClose();
    expect(content.allText()).toEqual([]);
  });

  it('只在显式请求时打开并复用右侧快速助手真实上下文摘要', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();

    expect(plugin.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_ASSISTANT)).toHaveLength(0);
    await plugin.activateWorkbench();
    const workbenchLeaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)[0];
    const workbenchView = workbenchLeaf?.view as WorkbenchView | undefined;
    const app = mockObsidian.lastApp;
    if (!workbenchView || !app) throw new Error('Workbench 视图未建立');
    const activeFile = app.vault.addMarkdownFile('项目/上下文.md', '快速助手上下文');
    app.workspace.activeFile = activeFile;
    app.workspace.activeMarkdownView = new MarkdownView(
      activeFile,
      new Editor('快速助手上下文', { ch: 0, line: 0 }, { ch: 7, line: 0 }),
    );
    await workbenchView.onOpen();
    await (workbenchView.contentEl as unknown as MockElement)
      .findAllByClass('dsh-new-task-context__open')[0]?.click();
    await mockObsidian.openModals[0]?.contentEl
      .findAllByClass('dsh-context-picker__choice')[1]?.click();
    await plugin.activateQuickAssistant();

    const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_ASSISTANT)[0];
    expect(leaf).toBe(mockObsidian.lastApp?.workspace.rightLeaf);
    expect(mockObsidian.lastApp?.workspace.revealedLeaf).toBe(leaf);
    const view = leaf?.view as QuickAssistantView | undefined;
    if (!view) throw new Error('快速助手视图未建立');
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    expect(content.allText()).toEqual(expect.arrayContaining([
      '快速助手',
      '尚未检测',
      '已选择 1 项：当前选区 · 项目/上下文.md',
      '总结当前上下文',
      '检查运行状态',
      '新建任务是主对话入口。快速助手仅展示健康状态、当前上下文和快捷提问。',
    ]));
    expect(content.allText()).toContain('仅辅助展示健康、当前上下文和快捷提问，不承担主对话。');
    expect(content.findAllByClass('dsh-quick-assistant__prompt')).toHaveLength(2);
    expect(content.findAllByClass('dsh-quick-assistant__prompt').every((item) => item.disabled)).toBe(true);

    await plugin.activateQuickAssistant();
    expect(plugin.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_ASSISTANT)).toHaveLength(1);
  });

  it('加载并保存经过校验的 DSH 命令设置', async () => {
    mockObsidian.loadedData = { dshCommand: '  dsh  ' };
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();

    await plugin.onload();
    expect(plugin.settings).toEqual({ dshCommand: 'dsh' });

    const absoluteCommand = process.platform === 'win32'
      ? 'C:\\Tools\\dsh.cmd'
      : '/opt/deepseek/dsh';
    await plugin.updateDshCommand(absoluteCommand);
    expect(plugin.settings).toEqual({ dshCommand: absoluteCommand });
    expect(mockObsidian.savedData).toEqual([{ dshCommand: absoluteCommand }]);
  });

  it('插件卸载时关闭仍打开的上下文选择器', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();
    await plugin.activateWorkbench();
    const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)[0];
    const view = leaf?.view as WorkbenchView | undefined;
    if (!view) throw new Error('Workbench 视图未建立');
    await view.onOpen();
    await (view.contentEl as unknown as MockElement)
      .findAllByClass('dsh-new-task-context__open')[0]?.click();
    const modal = mockObsidian.openModals[0];
    expect(modal?.contentEl.allText().length).toBeGreaterThan(0);

    plugin.onunload();

    expect(modal?.contentEl.allText()).toEqual([]);
  });

});
