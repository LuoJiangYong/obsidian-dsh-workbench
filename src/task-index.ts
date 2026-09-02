import {
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  type FileHandle,
} from 'node:fs/promises';
import path from 'node:path';

import type { BridgeSessionMode } from './bridge-protocol';

export const TASK_INDEX_VERSION = 1;

const INDEX_DIRECTORY_NAME = 'task-index';
const INDEX_FILE_NAMES = ['index-0.json', 'index-1.json'] as const;
const LOCK_FILE_NAME = 'write.lock';
const MAX_INDEX_BYTES = 4 * 1024 * 1024;
const MAX_TASKS = 5_000;
const MAX_IDENTIFIER_CHARACTERS = 160;
const MAX_REASON_CODE_CHARACTERS = 80;
const MAX_REASON_MESSAGE_CHARACTERS = 240;

export type TaskIndexLifecycleState =
  | 'failed'
  | 'interrupted'
  | 'ready'
  | 'running'
  | 'starting';

export interface TaskIndexFailureReason {
  readonly code: string;
  readonly message: string;
}

export interface TaskIndexLifecycle {
  readonly state: TaskIndexLifecycleState;
  readonly reason?: TaskIndexFailureReason;
}

export interface TaskIndexWorkspace {
  readonly name: string;
  readonly path: string;
}

export interface TaskIndexRecord {
  readonly taskId: string;
  readonly sessionId: string;
  readonly mode: BridgeSessionMode;
  readonly inputSummary: string;
  readonly workspace: TaskIndexWorkspace | null;
  readonly lifecycle: TaskIndexLifecycle;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskIndexDocument {
  readonly version: typeof TASK_INDEX_VERSION;
  readonly revision: number;
  readonly tasks: readonly TaskIndexRecord[];
}

export interface TaskIndexLoadResult {
  readonly document: TaskIndexDocument;
  readonly degraded: boolean;
  readonly isolatedFiles: readonly string[];
}

export interface TaskIndexCreateInput {
  readonly taskId: string;
  readonly sessionId: string;
  readonly mode: BridgeSessionMode;
  readonly inputSummary: string;
  readonly workspace: TaskIndexWorkspace | null;
}

export interface TaskIndexStoreOptions {
  readonly stateDirectory: string;
  readonly vaultPath: string;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly now?: () => Date;
  readonly randomId?: () => string;
}

export type TaskIndexErrorCode =
  | 'task_index_corrupt'
  | 'task_index_invalid'
  | 'task_index_locked'
  | 'task_index_session_conflict'
  | 'task_index_state_in_vault'
  | 'task_index_task_conflict';

export class TaskIndexError extends Error {
  constructor(
    readonly code: TaskIndexErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TaskIndexError';
  }
}

interface SlotReadResult {
  readonly fileName: typeof INDEX_FILE_NAMES[number];
  readonly status: 'invalid' | 'missing' | 'valid';
  readonly document?: TaskIndexDocument;
}

interface LockRecord {
  readonly version: 1;
  readonly pid: number;
  readonly token: string;
  readonly createdAt: string;
}

export class TaskIndexStore {
  private writeTail: Promise<void> = Promise.resolve();
  private readonly indexDirectory: string;
  private readonly isProcessAlive: (pid: number) => boolean;
  private readonly now: () => Date;
  private readonly randomId: () => string;

  constructor(private readonly options: TaskIndexStoreOptions) {
    this.indexDirectory = path.join(options.stateDirectory, INDEX_DIRECTORY_NAME);
    this.isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
    this.now = options.now ?? (() => new Date());
    this.randomId = options.randomId ?? (() => crypto.randomUUID());
  }

  async load(): Promise<TaskIndexLoadResult> {
    await this.assertVaultExternal();
    await mkdir(this.indexDirectory, { recursive: true });
    return await this.loadUnlocked();
  }

  async createTask(input: TaskIndexCreateInput): Promise<TaskIndexDocument> {
    return await this.enqueueWrite(async () => {
      validateCreateInput(input);
      return await this.withWriteLock(async () => {
        const loaded = await this.loadUnlocked();
        const existingTask = loaded.document.tasks.find(task => task.taskId === input.taskId);
        if (existingTask && sameCreateInput(existingTask, input)) {
          return loaded.document;
        }
        if (existingTask) {
          throw new TaskIndexError('task_index_task_conflict', 'taskId 已存在');
        }
        if (loaded.document.tasks.some(task => task.sessionId === input.sessionId)) {
          throw new TaskIndexError('task_index_session_conflict', 'DSH session 已被其他任务引用');
        }
        if (loaded.document.tasks.length >= MAX_TASKS) {
          throw new TaskIndexError('task_index_invalid', '任务索引已达到容量上限');
        }
        const timestamp = this.now().toISOString();
        const next = freezeDocument({
          version: TASK_INDEX_VERSION,
          revision: loaded.document.revision + 1,
          tasks: [
            ...loaded.document.tasks,
            {
              taskId: input.taskId,
              sessionId: input.sessionId,
              mode: input.mode,
              inputSummary: input.inputSummary,
              workspace: input.workspace,
              lifecycle: { state: 'starting' },
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        });
        await this.writeSnapshot(next);
        return next;
      });
    });
  }

  async updateTask(taskId: string, lifecycle: TaskIndexLifecycle): Promise<TaskIndexDocument> {
    return await this.enqueueWrite(async () => {
      validateIdentifier(taskId, 'taskId');
      validateLifecycle(lifecycle);
      return await this.withWriteLock(async () => {
        const loaded = await this.loadUnlocked();
        const taskIndex = loaded.document.tasks.findIndex(task => task.taskId === taskId);
        if (taskIndex < 0) {
          throw new TaskIndexError('task_index_invalid', '待更新任务不存在');
        }
        const timestamp = this.now().toISOString();
        const tasks = loaded.document.tasks.map((task, index) => index === taskIndex
          ? { ...task, lifecycle, updatedAt: timestamp }
          : task);
        const next = freezeDocument({
          version: TASK_INDEX_VERSION,
          revision: loaded.document.revision + 1,
          tasks,
        });
        await this.writeSnapshot(next);
        return next;
      });
    });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeTail.then(operation);
    this.writeTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.assertVaultExternal();
    await mkdir(this.indexDirectory, { recursive: true });
    const lock = await this.acquireWriteLock();
    try {
      return await operation();
    } finally {
      await lock.close();
      await rm(path.join(this.indexDirectory, LOCK_FILE_NAME), { force: true });
    }
  }

  private async acquireWriteLock(): Promise<FileHandle> {
    const lockPath = path.join(this.indexDirectory, LOCK_FILE_NAME);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const lock = await open(lockPath, 'wx', 0o600);
        const record: LockRecord = {
          version: 1,
          pid: process.pid,
          token: this.randomId(),
          createdAt: this.now().toISOString(),
        };
        await lock.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
        await lock.sync();
        return lock;
      } catch (error) {
        if (!isNodeError(error, 'EEXIST')) throw error;
        const owner = await readLockRecord(lockPath);
        if (owner !== null && this.isProcessAlive(owner.pid)) {
          throw new TaskIndexError('task_index_locked', '任务索引正在由另一个进程写入');
        }
        if (attempt > 0) {
          throw new TaskIndexError('task_index_locked', '任务索引写锁无法安全接管');
        }
        await rename(
          lockPath,
          path.join(this.indexDirectory, `${LOCK_FILE_NAME}.stale.${fileTimestamp(this.now())}.${this.randomId()}`),
        );
      }
    }
    throw new TaskIndexError('task_index_locked', '任务索引写锁无法获取');
  }

  private async loadUnlocked(): Promise<TaskIndexLoadResult> {
    const slots = await Promise.all(INDEX_FILE_NAMES.map(async fileName => await this.readSlot(fileName)));
    const valid = slots
      .filter((slot): slot is SlotReadResult & { readonly document: TaskIndexDocument } => (
        slot.status === 'valid' && slot.document !== undefined
      ))
      .sort((left, right) => right.document.revision - left.document.revision);
    const invalid = slots.filter(slot => slot.status === 'invalid').map(slot => slot.fileName);
    if (valid.length === 0) {
      if (slots.every(slot => slot.status === 'missing')) {
        return {
          document: freezeDocument({ version: TASK_INDEX_VERSION, revision: 0, tasks: [] }),
          degraded: false,
          isolatedFiles: Object.freeze([]),
        };
      }
      throw new TaskIndexError('task_index_corrupt', '任务索引没有可读的有效快照');
    }
    const latest = valid[0];
    if (!latest) throw new TaskIndexError('task_index_corrupt', '任务索引有效快照丢失');
    return {
      document: latest.document,
      degraded: invalid.length > 0,
      isolatedFiles: Object.freeze(invalid),
    };
  }

  private async readSlot(fileName: typeof INDEX_FILE_NAMES[number]): Promise<SlotReadResult> {
    const filePath = path.join(this.indexDirectory, fileName);
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile() || metadata.size > MAX_INDEX_BYTES) {
        return { fileName, status: 'invalid' };
      }
      const document = parseDocument(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
      return { fileName, status: 'valid', document };
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return { fileName, status: 'missing' };
      return { fileName, status: 'invalid' };
    }
  }

  private async writeSnapshot(document: TaskIndexDocument): Promise<void> {
    const slotIndex = document.revision % INDEX_FILE_NAMES.length;
    const fileName = INDEX_FILE_NAMES[slotIndex];
    if (!fileName) throw new TaskIndexError('task_index_invalid', '任务索引槽位无效');
    const destination = path.join(this.indexDirectory, fileName);
    const temporary = `${destination}.${this.randomId()}.tmp`;
    const serialized = `${JSON.stringify(document)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_INDEX_BYTES) {
      throw new TaskIndexError('task_index_invalid', '任务索引超过文件大小上限');
    }
    const temporaryHandle = await open(temporary, 'wx', 0o600);
    try {
      await temporaryHandle.writeFile(serialized, 'utf8');
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    try {
      const verified = parseDocument(JSON.parse(await readFile(temporary, 'utf8')) as unknown);
      if (verified.revision !== document.revision) {
        throw new TaskIndexError('task_index_corrupt', '任务索引临时快照读回不一致');
      }
      const existing = await this.readSlot(fileName);
      if (existing.status === 'invalid') {
        await rename(
          destination,
          `${destination}.corrupt.${fileTimestamp(this.now())}.${this.randomId()}`,
        );
      } else if (existing.status === 'valid') {
        await rm(destination);
      }
      await rename(temporary, destination);
      const readback = await this.readSlot(fileName);
      if (readback.status !== 'valid' || readback.document?.revision !== document.revision) {
        throw new TaskIndexError('task_index_corrupt', '任务索引原子写入读回失败');
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async assertVaultExternal(): Promise<void> {
    if (!path.isAbsolute(this.options.stateDirectory) || !path.isAbsolute(this.options.vaultPath)) {
      throw new TaskIndexError('task_index_invalid', 'stateDirectory 和 vaultPath 必须是绝对路径');
    }
    let state: string;
    let vault: string;
    try {
      [state, vault] = await Promise.all([
        resolvePotentialPath(this.options.stateDirectory),
        realpath(this.options.vaultPath),
      ]);
    } catch {
      throw new TaskIndexError('task_index_invalid', '无法安全解析任务索引或 Vault 路径');
    }
    state = normalizeForComparison(state);
    vault = normalizeForComparison(vault);
    if (state === vault || isWithin(state, vault)) {
      throw new TaskIndexError('task_index_state_in_vault', '最小任务索引必须保存在 Vault 外');
    }
  }
}

export function createTaskInputSummary(input: string): string {
  const compact = input.replace(/\s+/gu, ' ').trim();
  if (compact.length === 0) {
    throw new TaskIndexError('task_index_invalid', '任务输入摘要不能为空');
  }
  const characters = Array.from(compact);
  return characters.length <= 48 ? compact : `${characters.slice(0, 48).join('')}…`;
}

function parseDocument(value: unknown): TaskIndexDocument {
  const record = expectExactRecord(value, ['revision', 'tasks', 'version'], '任务索引');
  if (record['version'] !== TASK_INDEX_VERSION) {
    throw new TaskIndexError('task_index_corrupt', '任务索引版本不受支持');
  }
  const revision = record['revision'];
  if (!Number.isSafeInteger(revision) || typeof revision !== 'number' || revision < 0) {
    throw new TaskIndexError('task_index_corrupt', '任务索引 revision 无效');
  }
  const rawTasks = record['tasks'];
  if (!Array.isArray(rawTasks) || rawTasks.length > MAX_TASKS) {
    throw new TaskIndexError('task_index_corrupt', '任务索引 tasks 无效');
  }
  const tasks = rawTasks.map((task, index) => parseTask(task, index));
  if (new Set(tasks.map(task => task.taskId)).size !== tasks.length) {
    throw new TaskIndexError('task_index_corrupt', '任务索引包含重复 taskId');
  }
  if (new Set(tasks.map(task => task.sessionId)).size !== tasks.length) {
    throw new TaskIndexError('task_index_corrupt', '任务索引包含重复 sessionId');
  }
  return freezeDocument({ version: TASK_INDEX_VERSION, revision, tasks });
}

function parseTask(value: unknown, index: number): TaskIndexRecord {
  const label = `任务索引 tasks[${index}]`;
  const record = expectExactRecord(
    value,
    ['createdAt', 'inputSummary', 'lifecycle', 'mode', 'sessionId', 'taskId', 'updatedAt', 'workspace'],
    label,
  );
  const taskId = expectString(record['taskId'], `${label}.taskId`);
  const sessionId = expectString(record['sessionId'], `${label}.sessionId`);
  validateIdentifier(taskId, `${label}.taskId`);
  validateIdentifier(sessionId, `${label}.sessionId`);
  const mode = record['mode'];
  if (mode !== 'chat' && mode !== 'task') throw invalid(`${label}.mode 无效`);
  const inputSummary = expectString(record['inputSummary'], `${label}.inputSummary`);
  validateInputSummary(inputSummary);
  const createdAt = expectString(record['createdAt'], `${label}.createdAt`);
  const updatedAt = expectString(record['updatedAt'], `${label}.updatedAt`);
  validateTimestamp(createdAt, `${label}.createdAt`);
  validateTimestamp(updatedAt, `${label}.updatedAt`);
  const lifecycle = parseLifecycle(record['lifecycle'], `${label}.lifecycle`);
  const workspace = parseWorkspace(record['workspace'], `${label}.workspace`);
  return { taskId, sessionId, mode, inputSummary, workspace, lifecycle, createdAt, updatedAt };
}

function parseLifecycle(value: unknown, label: string): TaskIndexLifecycle {
  const record = expectRecord(value, label);
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== (record['reason'] === undefined ? 'state' : 'reason,state')) {
    throw invalid(`${label} 字段无效`);
  }
  const state = record['state'];
  if (!isLifecycleState(state)) throw invalid(`${label}.state 无效`);
  if (record['reason'] === undefined) {
    const lifecycle = Object.freeze({ state });
    validateLifecycle(lifecycle);
    return lifecycle;
  }
  const reasonRecord = expectExactRecord(record['reason'], ['code', 'message'], `${label}.reason`);
  const reason = {
    code: expectString(reasonRecord['code'], `${label}.reason.code`),
    message: expectString(reasonRecord['message'], `${label}.reason.message`),
  };
  validateFailureReason(reason);
  const lifecycle = Object.freeze({ state, reason: Object.freeze(reason) });
  validateLifecycle(lifecycle);
  return lifecycle;
}

function parseWorkspace(value: unknown, label: string): TaskIndexWorkspace | null {
  if (value === null) return null;
  const record = expectExactRecord(value, ['name', 'path'], label);
  const name = expectString(record['name'], `${label}.name`);
  const workspacePath = expectString(record['path'], `${label}.path`);
  validateWorkspace({ name, path: workspacePath });
  return Object.freeze({ name, path: workspacePath });
}

function validateCreateInput(input: TaskIndexCreateInput): void {
  validateIdentifier(input.taskId, 'taskId');
  validateIdentifier(input.sessionId, 'sessionId');
  if (input.mode !== 'chat' && input.mode !== 'task') throw invalid('mode 无效');
  validateInputSummary(input.inputSummary);
  if (input.workspace !== null) validateWorkspace(input.workspace);
}

function sameCreateInput(task: TaskIndexRecord, input: TaskIndexCreateInput): boolean {
  return task.taskId === input.taskId
    && task.sessionId === input.sessionId
    && task.mode === input.mode
    && task.inputSummary === input.inputSummary
    && (task.workspace === null
      ? input.workspace === null
      : input.workspace !== null
        && task.workspace.name === input.workspace.name
        && task.workspace.path === input.workspace.path);
}

function validateLifecycle(lifecycle: TaskIndexLifecycle): void {
  if (!isLifecycleState(lifecycle.state)) throw invalid('任务生命周期状态无效');
  const requiresReason = lifecycle.state === 'failed' || lifecycle.state === 'interrupted';
  if (requiresReason !== (lifecycle.reason !== undefined)) {
    throw invalid('只有失败或中断状态必须携带原因');
  }
  if (lifecycle.reason !== undefined) validateFailureReason(lifecycle.reason);
}

function validateFailureReason(reason: TaskIndexFailureReason): void {
  const codeLength = Array.from(reason.code).length;
  const messageLength = Array.from(reason.message).length;
  if (codeLength === 0 || codeLength > MAX_REASON_CODE_CHARACTERS || !/^[a-z0-9_]+$/u.test(reason.code)) {
    throw invalid('失败原因 code 无效');
  }
  if (messageLength === 0 || messageLength > MAX_REASON_MESSAGE_CHARACTERS) {
    throw invalid('失败原因 message 无效');
  }
  if (containsAbsolutePath(reason.message)) {
    throw invalid('失败原因 message 不得包含本机绝对路径');
  }
}

function validateWorkspace(workspace: TaskIndexWorkspace): void {
  if (workspace.name.trim() !== workspace.name || workspace.name.length === 0 || workspace.name.length > 256) {
    throw invalid('workspace.name 无效');
  }
  if (!path.isAbsolute(workspace.path) || path.normalize(workspace.path) !== workspace.path) {
    throw invalid('workspace.path 必须是规范化绝对路径');
  }
}

function validateIdentifier(value: string, label: string): void {
  const length = Array.from(value).length;
  if (length === 0 || length > MAX_IDENTIFIER_CHARACTERS || value.trim() !== value || /\s/u.test(value)) {
    throw invalid(`${label} 无效`);
  }
}

function validateInputSummary(value: string): void {
  const characters = Array.from(value);
  if (characters.length === 0 || characters.length > 49 || value.trim() !== value || /\s{2,}|[\r\n]/u.test(value)) {
    throw invalid('inputSummary 无效');
  }
  if (characters.length === 49 && characters[characters.length - 1] !== '…') {
    throw invalid('超长 inputSummary 必须以省略号结尾');
  }
}

function validateTimestamp(value: string, label: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) throw invalid(`${label} 无效`);
}

function freezeDocument(document: TaskIndexDocument): TaskIndexDocument {
  const tasks = document.tasks.map(task => Object.freeze({
    ...task,
    workspace: task.workspace === null ? null : Object.freeze({ ...task.workspace }),
    lifecycle: Object.freeze({
      ...task.lifecycle,
      ...(task.lifecycle.reason === undefined
        ? {}
        : { reason: Object.freeze({ ...task.lifecycle.reason }) }),
    }),
  }));
  return Object.freeze({ ...document, tasks: Object.freeze(tasks) });
}

function expectExactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const record = expectRecord(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalid(`${label} 字段无效`);
  }
  return record;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.prototype.toString.call(value) !== '[object Object]') {
    throw invalid(`${label} 必须是普通对象`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw invalid(`${label} 必须是字符串`);
  return value;
}

function isLifecycleState(value: unknown): value is TaskIndexLifecycleState {
  return ['failed', 'interrupted', 'ready', 'running', 'starting'].includes(String(value));
}

function containsAbsolutePath(value: string): boolean {
  return /(?:^|\s)(?:[a-zA-Z]:[\\/]|\\\\|\/[^\s])/u.test(value);
}

function normalizeForComparison(value: string): string {
  const normalized = path.resolve(value).replace(/[\\/]+$/u, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function resolvePotentialPath(candidate: string): Promise<string> {
  const unresolved: string[] = [];
  let current = path.resolve(candidate);
  while (true) {
    try {
      return path.join(await realpath(current), ...unresolved.reverse());
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      unresolved.push(path.basename(current));
      current = parent;
    }
  }
}

function invalid(message: string): TaskIndexError {
  return new TaskIndexError('task_index_invalid', message);
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, '-');
}

async function readLockRecord(lockPath: string): Promise<LockRecord | null> {
  try {
    const value = JSON.parse(await readFile(lockPath, 'utf8')) as unknown;
    const record = expectExactRecord(value, ['createdAt', 'pid', 'token', 'version'], '任务索引写锁');
    if (record['version'] !== 1 || typeof record['pid'] !== 'number'
      || !Number.isSafeInteger(record['pid']) || record['pid'] <= 0
      || typeof record['token'] !== 'string' || record['token'].length === 0
      || typeof record['createdAt'] !== 'string') {
      return null;
    }
    return {
      version: 1,
      pid: record['pid'],
      token: record['token'],
      createdAt: record['createdAt'],
    };
  } catch {
    return null;
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error, 'EPERM');
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}
