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
        desc: '健康检查仅在手动触发时执行固定的 --version；只有确认发送后才启动受管 DSH 会话和模型请求。插件不会安装或更新 DSH。',
      },
      {
        name: '运行数据',
        desc: '完整会话、模型设置和凭据由原生 DSH_HOME 管理；插件只在 Vault 外保存可重建的 bridge 状态，当前对话投影保留在内存。',
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
