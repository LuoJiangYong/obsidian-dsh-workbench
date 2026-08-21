import { beforeEach, describe, expect, it } from 'vitest';

import DeepSeekHarnessWorkbenchPlugin from '../src/main';
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

  it('注册原生视图、ribbon 和命令入口', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();

    await plugin.onload();

    expect(mockObsidian.views.has(VIEW_TYPE_WORKBENCH)).toBe(true);
    expect(mockObsidian.ribbonCallbacks).toHaveLength(1);
    expect(mockObsidian.settingTabs).toHaveLength(1);
    expect(mockObsidian.commands).toEqual([
      expect.objectContaining({ id: 'open-workbench', name: '打开工作台' }),
    ]);
  });

  it('打开并复用 Workbench 视图', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();

    await plugin.activateWorkbench();
    const firstLeaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)[0];
    expect(firstLeaf).toBeDefined();
    expect(mockObsidian.lastApp?.workspace.revealedLeaf).toBe(firstLeaf);

    await plugin.activateWorkbench();
    expect(plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH)).toHaveLength(1);
  });

  it('渲染真实边界并在关闭时清空内容', async () => {
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();
    await plugin.onload();

    const creator = mockObsidian.views.get(VIEW_TYPE_WORKBENCH);
    expect(creator).toBeDefined();
    if (!creator) throw new Error('Workbench 视图未注册');

    const rightLeaf = mockObsidian.lastApp?.workspace.rightLeaf;
    if (!rightLeaf) throw new Error('测试 Obsidian app 未建立');
    const view = creator(rightLeaf) as WorkbenchView;
    await view.onOpen();

    const content = view.contentEl as unknown as MockElement;
    expect(content.allText()).toEqual(expect.arrayContaining([
      'DeepSeek Harness Workbench',
      '尚未连接 DSH',
      '尚未检测',
      '未启用',
      '仅桌面端',
      '检查 DSH',
      '本版本只在手动检查时执行固定的 --version；不读取或写入 Vault，不启动会话，也不使用模型网络。',
    ]));

    await view.onClose();
    expect(content.allText()).toEqual([]);
  });

  it('加载并保存经过校验的 DSH 命令设置', async () => {
    mockObsidian.loadedData = { dshCommand: '  dsh  ' };
    const PluginConstructor = DeepSeekHarnessWorkbenchPlugin as unknown as ConstructablePlugin;
    const plugin = new PluginConstructor();

    await plugin.onload();
    expect(plugin.settings).toEqual({ dshCommand: 'dsh' });

    await plugin.updateDshCommand('C:\\Tools\\dsh.cmd');
    expect(plugin.settings).toEqual({ dshCommand: 'C:\\Tools\\dsh.cmd' });
    expect(mockObsidian.savedData).toEqual([{ dshCommand: 'C:\\Tools\\dsh.cmd' }]);
  });

});
