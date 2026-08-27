import { createHash } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface WorkbenchRuntimeStorage {
  readonly dshHome: string;
  readonly dshHomeDisplay: '$DSH_HOME' | '~/.dsh';
  readonly stateDirectory: string;
}

interface ResolveWorkbenchRuntimeStorageOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly platform?: NodeJS.Platform;
  readonly vaultPath: string;
}

interface PrepareWorkbenchRuntimeStorageOptions {
  readonly dshHome: string;
  readonly platform?: NodeJS.Platform;
  readonly stateDirectory: string;
  readonly vaultPath: string;
  readonly workingDirectory: string;
}

const PRODUCT_DIRECTORY = 'DeepSeek Harness Workbench';
const POSIX_PRODUCT_DIRECTORY = 'deepseek-harness-workbench';

export function resolveWorkbenchRuntimeStorage(
  options: ResolveWorkbenchRuntimeStorageOptions,
): WorkbenchRuntimeStorage {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const vaultPath = pathApi.resolve(options.vaultPath);
  if (!pathApi.isAbsolute(options.vaultPath)) throw new Error('Vault 路径必须是绝对路径');

  const configuredDshHome = environment.DSH_HOME?.trim();
  const dshHome = pathApi.resolve(expandHomePath(
    configuredDshHome || pathApi.join(homeDirectory, '.dsh'),
    homeDirectory,
    pathApi,
  ));
  const applicationRoot = resolveApplicationStateRoot(
    environment,
    homeDirectory,
    platform,
    pathApi,
  );
  const vaultKeySource = platform === 'win32' ? vaultPath.toLocaleLowerCase('en-US') : vaultPath;
  const vaultKey = createHash('sha256').update(vaultKeySource, 'utf8').digest('hex').slice(0, 32);

  return Object.freeze({
    dshHome,
    dshHomeDisplay: configuredDshHome ? '$DSH_HOME' : '~/.dsh',
    stateDirectory: pathApi.join(applicationRoot, 'vaults', vaultKey),
  });
}

export async function prepareWorkbenchRuntimeStorage(
  options: PrepareWorkbenchRuntimeStorageOptions,
): Promise<WorkbenchRuntimeStorage> {
  const platform = options.platform ?? process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  for (const [label, candidate] of [
    ['stateDirectory', options.stateDirectory],
    ['dshHome', options.dshHome],
    ['vaultPath', options.vaultPath],
    ['workingDirectory', options.workingDirectory],
  ] as const) {
    if (!pathApi.isAbsolute(candidate)) throw new Error(`${label} 必须是绝对路径`);
  }

  const vaultPath = await resolveExistingPath(options.vaultPath, pathApi);
  const prospectiveState = await resolvePotentialPath(options.stateDirectory, pathApi);
  const dshHome = await resolvePotentialPath(options.dshHome, pathApi);
  const workingDirectory = await resolvePotentialPath(options.workingDirectory, pathApi);
  assertOutsideVault(prospectiveState, vaultPath, '插件运行状态目录', pathApi);
  assertOutsideVault(dshHome, vaultPath, 'DSH_HOME', pathApi);
  assertOutsideVault(workingDirectory, vaultPath, 'DSH 工作目录', pathApi);

  await mkdir(options.stateDirectory, { recursive: true, mode: 0o700 });
  const stateDirectory = await resolveExistingPath(options.stateDirectory, pathApi);
  assertOutsideVault(stateDirectory, vaultPath, '插件运行状态目录', pathApi);

  return Object.freeze({
    dshHome,
    dshHomeDisplay: dshHome === resolveDefaultDshHome(platform, pathApi)
      ? '~/.dsh'
      : '$DSH_HOME',
    stateDirectory,
  });
}

function resolveApplicationStateRoot(
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
  platform: NodeJS.Platform,
  pathApi: path.PlatformPath,
): string {
  if (platform === 'win32') {
    const localAppData = environment.LOCALAPPDATA?.trim()
      || pathApi.join(homeDirectory, 'AppData', 'Local');
    return pathApi.join(pathApi.resolve(expandHomePath(localAppData, homeDirectory, pathApi)), PRODUCT_DIRECTORY);
  }
  if (platform === 'darwin') {
    return pathApi.join(homeDirectory, 'Library', 'Application Support', PRODUCT_DIRECTORY);
  }
  const xdgStateHome = environment.XDG_STATE_HOME?.trim();
  const stateHome = xdgStateHome
    ? pathApi.resolve(expandHomePath(xdgStateHome, homeDirectory, pathApi))
    : pathApi.join(homeDirectory, '.local', 'state');
  return pathApi.join(stateHome, POSIX_PRODUCT_DIRECTORY);
}

function expandHomePath(
  candidate: string,
  homeDirectory: string,
  pathApi: path.PlatformPath,
): string {
  if (candidate === '~') return homeDirectory;
  if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
    return pathApi.join(homeDirectory, candidate.slice(2));
  }
  return candidate;
}

async function resolveExistingPath(
  candidate: string,
  pathApi: path.PlatformPath,
): Promise<string> {
  try {
    return pathApi.resolve(await realpath(candidate));
  } catch {
    throw new Error(`无法解析运行路径：${pathApi.basename(candidate) || candidate}`);
  }
}

async function resolvePotentialPath(
  candidate: string,
  pathApi: path.PlatformPath,
): Promise<string> {
  const unresolved: string[] = [];
  let current = pathApi.resolve(candidate);
  while (true) {
    try {
      const existing = pathApi.resolve(await realpath(current));
      return pathApi.join(existing, ...unresolved.reverse());
    } catch (error) {
      if (!isNotFound(error)) throw error;
      const parent = pathApi.dirname(current);
      if (parent === current) throw error;
      unresolved.push(pathApi.basename(current));
      current = parent;
    }
  }
}

function assertOutsideVault(
  candidate: string,
  vaultPath: string,
  label: string,
  pathApi: path.PlatformPath,
): void {
  const relative = pathApi.relative(vaultPath, candidate);
  const inside = relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${pathApi.sep}`)
      && !pathApi.isAbsolute(relative));
  if (inside) throw new Error(`${label} 不得位于 Vault 内`);
}

function resolveDefaultDshHome(
  platform: NodeJS.Platform,
  pathApi: path.PlatformPath,
): string {
  const homeDirectory = homedir();
  return pathApi.resolve(pathApi.join(homeDirectory, '.dsh'));
}

function isNotFound(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'ENOENT';
}
