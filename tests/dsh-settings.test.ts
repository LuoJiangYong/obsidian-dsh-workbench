import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DSH_SETTINGS,
  loadDshSettings,
  validateDshCommand,
} from '../src/dsh-settings';

describe('DSH 设置契约', () => {
  it('缺失或不合法的持久化数据回退到安全默认值', () => {
    expect(loadDshSettings(null)).toEqual(DEFAULT_DSH_SETTINGS);
    expect(loadDshSettings({ dshCommand: 'dsh --version' })).toEqual(DEFAULT_DSH_SETTINGS);
    expect(loadDshSettings({ dshCommand: '  dsh  ' })).toEqual({ dshCommand: 'dsh' });
  });

  it('接受裸命令和 Windows 绝对 shim 路径', () => {
    expect(validateDshCommand('dsh', 'win32')).toBeUndefined();
    expect(validateDshCommand('C:\\Tools\\DeepSeek Harness\\dsh.cmd', 'win32')).toBeUndefined();
    expect(validateDshCommand('/opt/deepseek/dsh', 'linux')).toBeUndefined();
  });

  it('拒绝参数、相对路径、PowerShell 脚本和 shell 元字符', () => {
    expect(validateDshCommand('dsh --version', 'win32')).toMatch(/参数/);
    expect(validateDshCommand(path.join('tools', 'dsh.cmd'), 'win32')).toMatch(/裸命令名或绝对路径/);
    expect(validateDshCommand('C:\\Tools\\dsh.ps1', 'win32')).toMatch(/扩展名/);
    expect(validateDshCommand('C:\\Tools\\dsh.cmd & calc.exe', 'win32')).toMatch(/Shell/);
  });
});
