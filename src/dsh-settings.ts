import path from 'node:path';

export interface DshSettings {
  readonly dshCommand: string;
}

export const DEFAULT_DSH_SETTINGS: DshSettings = Object.freeze({
  dshCommand: 'dsh',
});

const WINDOWS_EXECUTABLE_EXTENSIONS = new Set(['.bat', '.cmd', '.com', '.exe']);
const WINDOWS_SHELL_META_PATTERN = /[\r\n"&|<>^%!]/u;
const BARE_COMMAND_PATTERN = /^[A-Za-z0-9._-]+$/u;

export function loadDshSettings(data: unknown): DshSettings {
  if (!hasDshCommand(data)) return DEFAULT_DSH_SETTINGS;

  const dshCommand = data.dshCommand.trim();
  if (validateDshCommand(dshCommand) !== undefined) return DEFAULT_DSH_SETTINGS;
  return Object.freeze({ dshCommand });
}

export function validateDshCommand(
  rawCommand: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const command = rawCommand.trim();
  if (!command) return 'DSH 命令不能为空。';

  if (platform === 'win32' && WINDOWS_SHELL_META_PATTERN.test(command)) {
    return 'DSH 路径不能包含 Shell 元字符或引号。';
  }

  const isAbsolute = platform === 'win32'
    ? path.win32.isAbsolute(command)
    : path.posix.isAbsolute(command);

  if (!isAbsolute) {
    if (/\s/u.test(command)) return '只填写命令名，不得附加参数。';
    if (!BARE_COMMAND_PATTERN.test(command)) return '只允许裸命令名或绝对路径。';
    return undefined;
  }

  if (platform === 'win32') {
    const extension = path.win32.extname(command).toLowerCase();
    if (!WINDOWS_EXECUTABLE_EXTENSIONS.has(extension)) {
      return 'Windows 绝对路径扩展名必须是 .exe、.com、.cmd 或 .bat。';
    }
  }

  return undefined;
}

function hasDshCommand(value: unknown): value is { dshCommand: string } {
  return typeof value === 'object'
    && value !== null
    && 'dshCommand' in value
    && typeof value.dshCommand === 'string';
}
