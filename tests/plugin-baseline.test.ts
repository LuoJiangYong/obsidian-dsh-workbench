import { beforeEach, describe, expect, it } from 'vitest';

import DeepSeekHarnessWorkbenchPlugin from '../src/main';
import {
  VIEW_TYPE_QUICK_ASSISTANT,
  type QuickAssistantView,
} from '../src/quick-assistant-view';
import { VIEW_TYPE_WORKBENCH, type WorkbenchView } from '../src/workbench-view';
import {
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

  it('渲染内部导航、概览真值，并切换到运行状态', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();

    const creator = mockObsidian.views.get(VIEW_TYPE_WORKBENCH);
    expect(creator).toBeDefined();
    if (!creator) throw new Error('Workbench 视图未注册');

    const leaf = mockObsidian.lastApp?.workspace.getLeaf('tab');
    if (!leaf) throw new Error('测试 Obsidian app 未建立');
    const view = creator(leaf) as WorkbenchView;
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    expect(content.allText()).toEqual(expect.arrayContaining([
      'DeepSeek Harness Workbench',
      '智能体工作台',
      '概览',
      '运行状态',
      '助手',
      '项目',
      '专家 · Skill · 连接器',
      '自动化',
      '资料库',
      '领域工作台',
      '当前真实能力',
      '尚未连接 DSH',
      '尚未检测',
      '未启用',
      '仅桌面端',
      '会话能力尚未实现；Vault 权限未启用。规划中的模块不会加载数据或执行操作。',
    ]));

    const navigationItems = content.findAllByClass('dsh-navigation__item');
    expect(navigationItems).toHaveLength(8);
    expect(navigationItems.slice(2).every((item) => item.disabled)).toBe(true);

    await navigationItems[1]?.click();
    expect(content.allText()).toEqual(expect.arrayContaining([
      '运行状态',
      '检查 DSH',
      '本版本只在手动检查时执行固定的 --version；不读取或写入 Vault，不启动会话，也不使用模型网络。',
    ]));

    await view.onClose();
    expect(content.allText()).toEqual([]);
  });

  it('只在显式请求时打开并复用右侧快速助手真实空状态', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();

    expect(plugin.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_ASSISTANT)).toHaveLength(0);
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
      '未选择笔记或工作范围',
      '快捷提问尚未启用',
      '当前容器不读取 Vault，也不提供输入、发送、停止或模型选择。',
    ]));

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

});
