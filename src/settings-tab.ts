import {
  PluginSettingTab,
  type SettingDefinitionItem,
} from 'obsidian';

import { DEFAULT_DSH_SETTINGS, validateDshCommand } from './dsh-settings';
import type DeepSeekHarnessWorkbenchPlugin from './main';

type WorkbenchSettingKey = 'dshCommand';

export class WorkbenchSettingTab extends PluginSettingTab {
  constructor(private readonly workbenchPlugin: DeepSeekHarnessWorkbenchPlugin) {
    super(workbenchPlugin.app, workbenchPlugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem<WorkbenchSettingKey>[] {
    return [
      {
        name: 'DSH 命令',
        desc: '填写 PATH 中的裸命令名，或 .exe、.com、.cmd、.bat 的绝对路径。不要附加参数。',
        control: {
          type: 'text',
          key: 'dshCommand',
          defaultValue: DEFAULT_DSH_SETTINGS.dshCommand,
          placeholder: 'dsh',
          validate: (value) => validateDshCommand(value),
        },
      },
      {
        name: '运行边界',
        desc: '健康检查仅在手动触发时执行固定的 --version；插件不会安装、更新或自动启动 DSH 会话。',
      },
    ];
  }

  override getControlValue(key: string): unknown {
    if (key !== 'dshCommand') return undefined;
    return this.workbenchPlugin.settings.dshCommand;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key !== 'dshCommand' || typeof value !== 'string') {
      throw new Error('不支持的设置字段');
    }
    await this.workbenchPlugin.updateDshCommand(value);
  }
}
