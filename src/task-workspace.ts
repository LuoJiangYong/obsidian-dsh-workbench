import { createHash } from 'node:crypto';
import {
  existsSync,
  type Dirent,
} from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  isPathContained,
  TASK_EXCLUDED_DIRECTORY_NAMES,
  taskPathHasExcludedDirectory,
} from './task-workspace-policy';

export const DEFAULT_TASK_WORKSPACE_MAX_FILES = 10_000;
export const DEFAULT_TASK_WORKSPACE_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_TASK_WORKSPACE_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const DEFAULT_TASK_WORKSPACE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_TASK_WORKSPACE_MAX_LEDGERS = 20;

const LEDGER_VERSION = 1;
const LEDGER_DIRECTORY = 'task-turns';
const MAX_DIFF_LINES = 4_000;
const TURN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/u;
const EXCLUDED_DIRECTORIES = new Set<string>(TASK_EXCLUDED_DIRECTORY_NAMES);
// 外部候选目录没有 Vault 实例可查询，标准目录名只作为附加拒绝信号。
export const STANDARD_OBSIDIAN_CONFIG_DIRECTORY = ['.', 'obsidian'].join('');

export interface TaskWorkspaceSelection {
  readonly name: string;
  readonly path: string;
}

export type TaskWorkspaceChangeKind = 'created' | 'deleted' | 'modified';

export interface TaskWorkspaceChange {
  readonly additions: number | null;
  readonly deletions: number | null;
  readonly kind: TaskWorkspaceChangeKind;
  readonly relativePath: string;
  readonly review: {
    readonly after: string | null;
    readonly before: string | null;
  } | null;
  readonly undoable: boolean;
}

export interface TaskWorkspaceTurnResult {
  readonly additions: number | null;
  readonly canUndo: boolean;
  readonly changes: readonly TaskWorkspaceChange[];
  readonly completedAt: string;
  readonly deletions: number | null;
  readonly turnId: string;
  readonly undone: boolean;
  readonly workspace: TaskWorkspaceSelection;
}

export interface TaskWorkspaceLedgerOptions {
  readonly maxFileBytes?: number;
  readonly maxFiles?: number;
  readonly maxLedgers?: number;
  readonly maxTotalBytes?: number;
  readonly now?: () => Date;
  readonly retentionMs?: number;
  readonly stateDirectory: string;
  readonly vaultPath: string;
}

interface FileSnapshot {
  readonly bytes: number;
  readonly contentBase64: string;
  readonly hash: string;
  readonly mode: number;
  readonly relativePath: string;
  readonly text: string | null;
}

interface ActiveTurn {
  readonly baseline: ReadonlyMap<string, FileSnapshot>;
  readonly createdAt: string;
  readonly ledgerPath: string;
  readonly workspace: TaskWorkspaceSelection;
}

interface PersistedChange {
  readonly after: FileSnapshot | null;
  readonly before: FileSnapshot | null;
  readonly public: TaskWorkspaceChange;
}

interface ActiveLedger {
  readonly baseline: readonly FileSnapshot[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly state: 'active';
  readonly turnId: string;
  readonly version: typeof LEDGER_VERSION;
  readonly workspace: TaskWorkspaceSelection;
}

interface CompletedLedger {
  readonly changes: readonly PersistedChange[];
  readonly completedAt: string;
  readonly expiresAt: string;
  readonly state: 'completed' | 'undone';
  readonly turnId: string;
  readonly version: typeof LEDGER_VERSION;
  readonly workspace: TaskWorkspaceSelection;
}

export class TaskWorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskWorkspaceError';
  }
}

export class TaskWorkspaceLedger {
  private readonly activeTurns = new Map<string, ActiveTurn>();
  private readonly maxFileBytes: number;
  private readonly maxFiles: number;
  private readonly maxLedgers: number;
  private readonly maxTotalBytes: number;
  private readonly now: () => Date;
  private readonly retentionMs: number;

  constructor(private readonly options: TaskWorkspaceLedgerOptions) {
    this.maxFileBytes = positiveInteger(
      options.maxFileBytes ?? DEFAULT_TASK_WORKSPACE_MAX_FILE_BYTES,
      'maxFileBytes',
    );
    this.maxFiles = positiveInteger(
      options.maxFiles ?? DEFAULT_TASK_WORKSPACE_MAX_FILES,
      'maxFiles',
    );
    this.maxLedgers = positiveInteger(
      options.maxLedgers ?? DEFAULT_TASK_WORKSPACE_MAX_LEDGERS,
      'maxLedgers',
    );
    this.maxTotalBytes = positiveInteger(
      options.maxTotalBytes ?? DEFAULT_TASK_WORKSPACE_MAX_TOTAL_BYTES,
      'maxTotalBytes',
    );
    this.retentionMs = positiveInteger(
      options.retentionMs ?? DEFAULT_TASK_WORKSPACE_RETENTION_MS,
      'retentionMs',
    );
    this.now = options.now ?? (() => new Date());
    for (const [label, value] of [
      ['stateDirectory', options.stateDirectory],
      ['vaultPath', options.vaultPath],
    ] as const) {
      if (!path.isAbsolute(value)) throw new Error(`${label} 必须是绝对路径`);
    }
  }

  async validateWorkspace(workspacePath: string): Promise<TaskWorkspaceSelection> {
    if (!path.isAbsolute(workspacePath)) {
      throw new TaskWorkspaceError('workspace_not_absolute', '任务工作区必须是绝对路径。');
    }
    const workspace = await canonicalDirectory(workspacePath, '任务工作区');
    const vault = await canonicalDirectory(this.options.vaultPath, 'Vault');
    const state = await canonicalOrProspectivePath(this.options.stateDirectory);
    if (pathsOverlap(workspace, vault)) {
      throw new TaskWorkspaceError('workspace_vault_overlap', '任务工作区不得是 Vault 或包含 Vault。');
    }
    if (pathsOverlap(workspace, state)) {
      throw new TaskWorkspaceError(
        'workspace_state_overlap',
        '任务工作区不得与插件的 Vault 外运行状态目录重叠。',
      );
    }
    if (existsSync(path.join(workspace, STANDARD_OBSIDIAN_CONFIG_DIRECTORY))) {
      throw new TaskWorkspaceError('workspace_is_vault', '任务工作区不能是 Obsidian Vault。');
    }
    return Object.freeze({ name: path.basename(workspace), path: workspace });
  }

  async beginTurn(turnId: string, workspacePath: string): Promise<TaskWorkspaceSelection> {
    validateTurnId(turnId);
    if (this.activeTurns.has(turnId)) {
      throw new TaskWorkspaceError('turn_already_active', '该任务 turn 已建立变更基线。');
    }
    const workspace = await this.validateWorkspace(workspacePath);
    if ([...this.activeTurns.values()].some(active => active.workspace.path === workspace.path)) {
      throw new TaskWorkspaceError('workspace_turn_active', '该任务工作区已有活动 turn。');
    }
    await this.prepareLedgerDirectory(workspace);
    const baseline = await this.snapshotWorkspace(workspace.path);
    const createdAt = this.now().toISOString();
    const ledgerPath = this.ledgerPath(workspace.path, turnId);
    const ledger: ActiveLedger = {
      baseline: [...baseline.values()],
      createdAt,
      expiresAt: new Date(this.now().getTime() + this.retentionMs).toISOString(),
      state: 'active',
      turnId,
      version: LEDGER_VERSION,
      workspace,
    };
    await writeJsonAtomic(ledgerPath, ledger);
    this.activeTurns.set(turnId, { baseline, createdAt, ledgerPath, workspace });
    return workspace;
  }

  async abandonTurn(turnId: string): Promise<void> {
    const active = this.activeTurns.get(turnId);
    if (!active) return;
    this.activeTurns.delete(turnId);
    await rm(active.ledgerPath, { force: true });
  }

  async completeTurn(turnId: string): Promise<TaskWorkspaceTurnResult> {
    const active = this.activeTurns.get(turnId);
    if (!active) throw new TaskWorkspaceError('turn_not_active', '该任务 turn 没有活动变更基线。');
    const currentWorkspace = await this.validateWorkspace(active.workspace.path);
    if (currentWorkspace.path !== active.workspace.path) {
      throw new TaskWorkspaceError('workspace_identity_changed', '任务工作区真实路径已经变化。');
    }
    const after = await this.snapshotWorkspace(active.workspace.path);
    const changes = createChanges(active.baseline, after);
    const completedAt = this.now().toISOString();
    const ledger: CompletedLedger = {
      changes,
      completedAt,
      expiresAt: new Date(this.now().getTime() + this.retentionMs).toISOString(),
      state: 'completed',
      turnId,
      version: LEDGER_VERSION,
      workspace: active.workspace,
    };
    await writeJsonAtomic(active.ledgerPath, ledger);
    this.activeTurns.delete(turnId);
    return publicResult(ledger);
  }

  async undoTurn(turnId: string): Promise<TaskWorkspaceTurnResult> {
    validateTurnId(turnId);
    const ledger = await this.readCompletedLedger(turnId);
    if (ledger.state === 'undone') {
      throw new TaskWorkspaceError('turn_already_undone', '该任务 turn 已经撤销。');
    }
    if (ledger.changes.length === 0 || ledger.changes.some(change => !change.public.undoable)) {
      throw new TaskWorkspaceError('turn_not_undoable', '该任务 turn 不具备完整可撤销材料。');
    }
    const workspace = await this.validateWorkspace(ledger.workspace.path);
    if (workspace.path !== ledger.workspace.path) {
      throw new TaskWorkspaceError('workspace_identity_changed', '任务工作区真实路径已经变化。');
    }

    for (const change of ledger.changes) {
      await assertCurrentSnapshot(workspace.path, change.after, change.public.relativePath);
    }

    const applied: PersistedChange[] = [];
    try {
      for (const change of ledger.changes) {
        await restoreSnapshot(workspace.path, change.before, change.public.relativePath);
        applied.push(change);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const change of applied.reverse()) {
        try {
          await restoreSnapshot(workspace.path, change.after, change.public.relativePath);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], '撤销失败且回滚未完整完成');
      throw error;
    }

    const undone: CompletedLedger = { ...ledger, state: 'undone', workspace };
    await writeJsonAtomic(this.ledgerPath(workspace.path, turnId), undone);
    return publicResult(undone);
  }

  private async snapshotWorkspace(workspaceRoot: string): Promise<ReadonlyMap<string, FileSnapshot>> {
    const snapshots = new Map<string, FileSnapshot>();
    let totalBytes = 0;
    const walk = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const entryInfo = await lstat(absolutePath);
        if (entryInfo.isSymbolicLink()) continue;
        if (entryInfo.isDirectory()) {
          if (EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
          const canonicalDirectoryPath = await realpath(absolutePath);
          if (!isPathContained(workspaceRoot, canonicalDirectoryPath)) {
            throw new TaskWorkspaceError('workspace_path_escape', '任务工作区包含越界目录。');
          }
          await walk(canonicalDirectoryPath);
          continue;
        }
        if (!entryInfo.isFile()) continue;
        if (snapshots.size >= this.maxFiles) {
          throw new TaskWorkspaceError(
            'workspace_file_limit',
            `任务工作区超过 ${String(this.maxFiles)} 个可跟踪文件。`,
          );
        }
        const canonicalFilePath = await realpath(absolutePath);
        if (!isPathContained(workspaceRoot, canonicalFilePath)) {
          throw new TaskWorkspaceError('workspace_path_escape', '任务工作区包含越界文件。');
        }
        const info = await stat(canonicalFilePath);
        if (info.size > this.maxFileBytes) {
          throw new TaskWorkspaceError(
            'workspace_file_too_large',
            `文件 ${path.relative(workspaceRoot, absolutePath)} 超过单文件跟踪上限。`,
          );
        }
        totalBytes += info.size;
        if (totalBytes > this.maxTotalBytes) {
          throw new TaskWorkspaceError('workspace_total_limit', '任务工作区超过变更基线总大小上限。');
        }
        const buffer = await readFile(canonicalFilePath);
        const relativePath = normalizeRelativePath(path.relative(workspaceRoot, canonicalFilePath));
        snapshots.set(relativePath, Object.freeze({
          bytes: buffer.byteLength,
          contentBase64: buffer.toString('base64'),
          hash: hashBuffer(buffer),
          mode: info.mode & 0o777,
          relativePath,
          text: decodeUtf8(buffer),
        }));
      }
    };
    await walk(workspaceRoot);
    return snapshots;
  }

  private async prepareLedgerDirectory(workspace: TaskWorkspaceSelection): Promise<void> {
    const root = path.join(this.options.stateDirectory, LEDGER_DIRECTORY, workspaceHash(workspace.path));
    await mkdir(root, { recursive: true, mode: 0o700 });
    const files = (await readdir(root, { withFileTypes: true }))
      .filter((entry): entry is Dirent => entry.isFile() && entry.name.endsWith('.json'));
    const now = this.now().getTime();
    const retained: Array<{ readonly name: string; readonly time: number }> = [];
    for (const file of files) {
      const filePath = path.join(root, file.name);
      const retention = await readLedgerRetention(filePath);
      if (retention === null || retention.expiresAt <= now) await rm(filePath, { force: true });
      else retained.push({ name: file.name, time: retention.sortTime });
    }
    retained.sort((left, right) => right.time - left.time);
    for (const stale of retained.slice(Math.max(0, this.maxLedgers - 1))) {
      await rm(path.join(root, stale.name), { force: true });
    }
  }

  private ledgerPath(workspacePath: string, turnId: string): string {
    return path.join(
      this.options.stateDirectory,
      LEDGER_DIRECTORY,
      workspaceHash(workspacePath),
      `${turnId}.json`,
    );
  }

  private async readCompletedLedger(turnId: string): Promise<CompletedLedger> {
    const roots = await readdir(path.join(this.options.stateDirectory, LEDGER_DIRECTORY), {
      withFileTypes: true,
    }).catch(() => [] as Dirent[]);
    const matches: string[] = [];
    for (const root of roots) {
      if (!root.isDirectory()) continue;
      const candidate = path.join(
        this.options.stateDirectory,
        LEDGER_DIRECTORY,
        root.name,
        `${turnId}.json`,
      );
      if (existsSync(candidate)) matches.push(candidate);
    }
    if (matches.length !== 1) {
      throw new TaskWorkspaceError('turn_ledger_not_found', '没有找到唯一的任务变更账本。');
    }
    const ledgerPath = matches[0]!;
    const parsed = JSON.parse(await readFile(ledgerPath, 'utf8')) as unknown;
    if (!isCompletedLedger(parsed) || parsed.turnId !== turnId) {
      throw new TaskWorkspaceError('turn_ledger_invalid', '任务变更账本无效。');
    }
    if (path.basename(path.dirname(ledgerPath)) !== workspaceHash(parsed.workspace.path)
      || parsed.workspace.name !== path.basename(parsed.workspace.path)) {
      throw new TaskWorkspaceError('turn_ledger_invalid', '任务变更账本的工作区身份无效。');
    }
    if (new Date(parsed.expiresAt).getTime() <= this.now().getTime()) {
      throw new TaskWorkspaceError('turn_ledger_expired', '任务变更账本已经过期。');
    }
    for (const change of parsed.changes) {
      validatePersistedChange(change, this.maxFileBytes, parsed.workspace.path);
    }
    return parsed;
  }
}

function createChanges(
  before: ReadonlyMap<string, FileSnapshot>,
  after: ReadonlyMap<string, FileSnapshot>,
): readonly PersistedChange[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort((left, right) => left.localeCompare(right, 'en'));
  const changes: PersistedChange[] = [];
  for (const relativePath of paths) {
    const oldFile = before.get(relativePath) ?? null;
    const newFile = after.get(relativePath) ?? null;
    if (oldFile?.hash === newFile?.hash) continue;
    const kind: TaskWorkspaceChangeKind = oldFile === null
      ? 'created'
      : newFile === null ? 'deleted' : 'modified';
    const stats = lineStats(oldFile?.text ?? null, newFile?.text ?? null);
    changes.push(Object.freeze({
      after: newFile,
      before: oldFile,
      public: Object.freeze({
        additions: stats?.additions ?? null,
        deletions: stats?.deletions ?? null,
        kind,
        relativePath,
        review: (oldFile === null || oldFile.text !== null)
          && (newFile === null || newFile.text !== null)
          ? Object.freeze({ after: newFile?.text ?? null, before: oldFile?.text ?? null })
          : null,
        undoable: oldFile !== null || newFile !== null,
      }),
    }));
  }
  return Object.freeze(changes);
}

function lineStats(before: string | null, after: string | null): {
  readonly additions: number;
  readonly deletions: number;
} | null {
  if (before === null && after === null) return null;
  const oldLines = before === null ? [] : splitLines(before);
  const newLines = after === null ? [] : splitLines(after);
  if (oldLines.length + newLines.length > MAX_DIFF_LINES) return null;
  const shorter = oldLines.length <= newLines.length ? oldLines : newLines;
  const longer = oldLines.length <= newLines.length ? newLines : oldLines;
  let prior = new Uint32Array(shorter.length + 1);
  for (const longLine of longer) {
    const current = new Uint32Array(shorter.length + 1);
    for (let index = 1; index <= shorter.length; index += 1) {
      current[index] = longLine === shorter[index - 1]
        ? (prior[index - 1] ?? 0) + 1
        : Math.max(prior[index] ?? 0, current[index - 1] ?? 0);
    }
    prior = current;
  }
  const common = prior[shorter.length] ?? 0;
  return { additions: newLines.length - common, deletions: oldLines.length - common };
}

function splitLines(value: string): readonly string[] {
  if (!value) return [];
  const lines = value.replace(/\r\n/gu, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function publicResult(ledger: CompletedLedger): TaskWorkspaceTurnResult {
  const publicChanges = ledger.changes.map(change => change.public);
  const lineCountsKnown = publicChanges.every(
    change => change.additions !== null && change.deletions !== null,
  );
  return Object.freeze({
    additions: lineCountsKnown
      ? publicChanges.reduce((total, change) => total + (change.additions ?? 0), 0)
      : null,
    canUndo: ledger.state === 'completed'
      && publicChanges.length > 0
      && publicChanges.every(change => change.undoable),
    changes: Object.freeze(publicChanges),
    completedAt: ledger.completedAt,
    deletions: lineCountsKnown
      ? publicChanges.reduce((total, change) => total + (change.deletions ?? 0), 0)
      : null,
    turnId: ledger.turnId,
    undone: ledger.state === 'undone',
    workspace: ledger.workspace,
  });
}

async function assertCurrentSnapshot(
  workspaceRoot: string,
  expected: FileSnapshot | null,
  relativePath: string,
): Promise<void> {
  const target = await validatedTarget(workspaceRoot, relativePath);
  const current = await readExactSnapshot(workspaceRoot, target, relativePath);
  if (current?.hash !== expected?.hash) {
    throw new TaskWorkspaceError(
      'undo_conflict',
      `文件 ${relativePath} 在任务结束后又发生变化，未执行任何撤销。`,
    );
  }
}

async function restoreSnapshot(
  workspaceRoot: string,
  snapshot: FileSnapshot | null,
  relativePath: string,
): Promise<void> {
  const target = await validatedTarget(workspaceRoot, relativePath);
  if (snapshot === null) {
    await unlink(target);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const parent = await realpath(path.dirname(target));
  if (!isPathContained(workspaceRoot, parent)) {
    throw new TaskWorkspaceError('undo_path_escape', `文件 ${relativePath} 的父目录已越过工作区。`);
  }
  const content = Buffer.from(snapshot.contentBase64, 'base64');
  await writeFile(target, content, { mode: snapshot.mode });
  if (process.platform !== 'win32') await chmod(target, snapshot.mode);
}

async function readExactSnapshot(
  workspaceRoot: string,
  absolutePath: string,
  relativePath: string,
): Promise<FileSnapshot | null> {
  try {
    const info = await lstat(absolutePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new TaskWorkspaceError('undo_target_invalid', `文件 ${relativePath} 不再是普通文件。`);
    }
    const canonical = await realpath(absolutePath);
    if (!isPathContained(workspaceRoot, canonical)) {
      throw new TaskWorkspaceError('undo_path_escape', `文件 ${relativePath} 已越过工作区。`);
    }
    const buffer = await readFile(absolutePath);
    return {
      bytes: buffer.byteLength,
      contentBase64: buffer.toString('base64'),
      hash: hashBuffer(buffer),
      mode: info.mode & 0o777,
      relativePath,
      text: decodeUtf8(buffer),
    };
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') return null;
    throw error;
  }
}

async function validatedTarget(workspaceRoot: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new TaskWorkspaceError('undo_path_invalid', '变更账本包含无效路径。');
  }
  if (taskPathHasExcludedDirectory(workspaceRoot, relativePath)) {
    throw new TaskWorkspaceError('undo_path_excluded', '变更账本路径指向禁止跟踪的目录。');
  }
  const target = path.resolve(workspaceRoot, relativePath);
  if (!isPathContained(workspaceRoot, target)) {
    throw new TaskWorkspaceError('undo_path_escape', '变更账本路径越过工作区。');
  }
  return target;
}

async function canonicalDirectory(value: string, label: string): Promise<string> {
  let info;
  try {
    info = await stat(value);
  } catch {
    throw new TaskWorkspaceError('directory_unavailable', `${label}不存在或不可读取。`);
  }
  if (!info.isDirectory()) throw new TaskWorkspaceError('directory_invalid', `${label}必须是目录。`);
  return await realpath(value);
}

async function canonicalOrProspectivePath(value: string): Promise<string> {
  let existing = path.resolve(value);
  const suffix: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new TaskWorkspaceError('state_directory_invalid', '无法解析运行状态目录。');
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(await realpath(existing), ...suffix);
}

function pathsOverlap(left: string, right: string): boolean {
  return isPathContained(left, right) || isPathContained(right, left);
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function workspaceHash(workspacePath: string): string {
  return createHash('sha256').update(workspacePath).digest('hex').slice(0, 24);
}

function decodeUtf8(value: Buffer): string | null {
  const text = value.toString('utf8');
  return Buffer.from(text, 'utf8').equals(value) ? text : null;
}

function validateTurnId(turnId: string): void {
  if (!TURN_ID_PATTERN.test(turnId)) {
    throw new TaskWorkspaceError('turn_id_invalid', '任务 turn ID 无效。');
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} 必须是正安全整数`);
  return value;
}

function isCompletedLedger(value: unknown): value is CompletedLedger {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record['version'] === LEDGER_VERSION
    && (record['state'] === 'completed' || record['state'] === 'undone')
    && typeof record['turnId'] === 'string'
    && typeof record['completedAt'] === 'string'
    && typeof record['expiresAt'] === 'string'
    && Number.isFinite(Date.parse(record['completedAt']))
    && Number.isFinite(Date.parse(record['expiresAt']))
    && Array.isArray(record['changes'])
    && record['changes'].every(isPersistedChange)
    && isWorkspaceSelection(record['workspace']);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  const serialized = `${JSON.stringify(value)}\n`;
  await writeFile(temporary, serialized, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  try {
    try {
      await rename(temporary, filePath);
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code !== 'EEXIST' && candidate.code !== 'EPERM') throw error;
      await rm(filePath, { force: true });
      await rename(temporary, filePath);
    }
    if (await readFile(filePath, 'utf8') !== serialized) {
      throw new TaskWorkspaceError('ledger_readback_failed', '任务变更账本写入后读回不一致。');
    }
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function isWorkspaceSelection(value: unknown): value is TaskWorkspaceSelection {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['name'] === 'string'
    && record['name'].length > 0
    && typeof record['path'] === 'string'
    && path.isAbsolute(record['path']);
}

function isPersistedChange(value: unknown): value is PersistedChange {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (record['before'] === null || isFileSnapshot(record['before']))
    && (record['after'] === null || isFileSnapshot(record['after']))
    && (record['before'] !== null || record['after'] !== null)
    && isPublicChange(record['public']);
}

function isFileSnapshot(value: unknown): value is FileSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return Number.isSafeInteger(record['bytes'])
    && (record['bytes'] as number) >= 0
    && typeof record['contentBase64'] === 'string'
    && typeof record['hash'] === 'string'
    && /^[a-f0-9]{64}$/u.test(record['hash'])
    && Number.isSafeInteger(record['mode'])
    && (record['mode'] as number) >= 0
    && (record['mode'] as number) <= 0o777
    && typeof record['relativePath'] === 'string'
    && (record['text'] === null || typeof record['text'] === 'string');
}

function isPublicChange(value: unknown): value is TaskWorkspaceChange {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return isNullableNonNegativeInteger(record['additions'])
    && isNullableNonNegativeInteger(record['deletions'])
    && (record['kind'] === 'created' || record['kind'] === 'deleted' || record['kind'] === 'modified')
    && typeof record['relativePath'] === 'string'
    && isReview(record['review'])
    && typeof record['undoable'] === 'boolean';
}

function isReview(value: unknown): value is TaskWorkspaceChange['review'] {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (record['after'] === null || typeof record['after'] === 'string')
    && (record['before'] === null || typeof record['before'] === 'string');
}

function isNullableNonNegativeInteger(value: unknown): boolean {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function validatePersistedChange(
  change: PersistedChange,
  maxFileBytes: number,
  workspaceRoot: string,
): void {
  const relativePath = change.public.relativePath;
  if (!isSafeRelativePath(relativePath)
    || taskPathHasExcludedDirectory(workspaceRoot, relativePath)) {
    throw new TaskWorkspaceError('turn_ledger_invalid', '任务变更账本包含无效相对路径。');
  }
  for (const snapshot of [change.before, change.after]) {
    if (snapshot === null) continue;
    if (snapshot.relativePath !== relativePath) {
      throw new TaskWorkspaceError('turn_ledger_invalid', '任务变更账本的文件路径不一致。');
    }
    const content = Buffer.from(snapshot.contentBase64, 'base64');
    if (snapshot.bytes > maxFileBytes
      || content.toString('base64') !== snapshot.contentBase64
      || content.byteLength !== snapshot.bytes
      || hashBuffer(content) !== snapshot.hash
      || decodeUtf8(content) !== snapshot.text) {
      throw new TaskWorkspaceError('turn_ledger_invalid', '任务变更账本的文件快照校验失败。');
    }
  }
  const expectedKind: TaskWorkspaceChangeKind = change.before === null
    ? 'created'
    : change.after === null ? 'deleted' : 'modified';
  if (change.public.kind !== expectedKind) {
    throw new TaskWorkspaceError('turn_ledger_invalid', '任务变更账本的变更类型不一致。');
  }
  const beforeText = change.before?.text ?? null;
  const afterText = change.after?.text ?? null;
  const reviewable = (change.before === null || change.before.text !== null)
    && (change.after === null || change.after.text !== null);
  const stats = lineStats(beforeText, afterText);
  if (!change.public.undoable
    || (reviewable && (change.public.review?.before !== beforeText
      || change.public.review?.after !== afterText))
    || (!reviewable && change.public.review !== null)
    || change.public.additions !== (stats?.additions ?? null)
    || change.public.deletions !== (stats?.deletions ?? null)) {
    throw new TaskWorkspaceError('turn_ledger_invalid', '任务变更账本的公开审阅信息不一致。');
  }
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && !path.isAbsolute(value)
    && !value.includes('\0')
    && !value.split(/[\\/]+/u).includes('..');
}

async function readLedgerRetention(filePath: string): Promise<{
  readonly expiresAt: number;
  readonly sortTime: number;
} | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const expiresAt = typeof record['expiresAt'] === 'string'
      ? Date.parse(record['expiresAt'])
      : Number.NaN;
    const timestamp = typeof record['completedAt'] === 'string'
      ? Date.parse(record['completedAt'])
      : typeof record['createdAt'] === 'string' ? Date.parse(record['createdAt']) : Number.NaN;
    if (!Number.isFinite(expiresAt) || !Number.isFinite(timestamp)) return null;
    return { expiresAt, sortTime: timestamp };
  } catch {
    return null;
  }
}
