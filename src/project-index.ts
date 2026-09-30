import { randomUUID } from 'node:crypto';
import {
  mkdir,
  lstat,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  type FileHandle,
} from 'node:fs/promises';
import path from 'node:path';

export const PROJECT_INDEX_VERSION = 1;

const INDEX_DIRECTORY_NAME = 'project-index';
const INDEX_FILE_NAMES = ['index-0.json', 'index-1.json'] as const;
const LOCK_FILE_NAME = 'write.lock';
const MAX_INDEX_BYTES = 4 * 1024 * 1024;
const MAX_PROJECTS = 5_000;
const MAX_SOURCE_FOLDERS = 64;
const MAX_IDENTIFIER_CHARACTERS = 160;
const MAX_DISPLAY_NAME_CHARACTERS = 160;

/**
 * The DSH Workspace identity is the authority. The path is the last public
 * canonical-path observation used to detect drift; it is not a second DSH
 * registry and is never used to create or execute a Workspace.
 */
export interface ProjectWorkspaceReference {
  readonly workspaceId: string;
  readonly canonicalPath: string;
}

export interface ProjectRecord {
  readonly projectId: string;
  readonly displayName: string;
  readonly workspaces: readonly ProjectWorkspaceReference[];
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectIndexDocument {
  readonly version: typeof PROJECT_INDEX_VERSION;
  readonly revision: number;
  /** Array order is the durable user project order. */
  readonly projects: readonly ProjectRecord[];
}

export interface ProjectIndexLoadResult {
  readonly document: ProjectIndexDocument;
  readonly degraded: boolean;
  readonly isolatedFiles: readonly string[];
}

export interface ProjectIndexCreateInput {
  readonly projectId?: string;
  readonly displayName: string;
  readonly workspaces: readonly ProjectWorkspaceReference[];
  readonly pinned?: boolean;
}

export interface ProjectIndexUpdateInput {
  readonly displayName?: string;
  readonly workspaces?: readonly ProjectWorkspaceReference[];
  readonly pinned?: boolean;
}

export interface ProjectIndexStoreOptions {
  readonly stateDirectory: string;
  readonly vaultPath: string;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly now?: () => Date;
  readonly randomId?: () => string;
}

export type ProjectIndexErrorCode =
  | 'project_index_corrupt'
  | 'project_index_invalid'
  | 'project_index_locked'
  | 'project_index_name_conflict'
  | 'project_index_project_conflict'
  | 'project_index_source_conflict'
  | 'project_index_source_invalid'
  | 'project_index_state_in_vault'
  | 'project_index_version_unsupported';

export class ProjectIndexError extends Error {
  constructor(
    readonly code: ProjectIndexErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectIndexError';
  }
}

interface SlotReadResult {
  readonly fileName: typeof INDEX_FILE_NAMES[number];
  readonly status: 'invalid' | 'missing' | 'valid';
  readonly document?: ProjectIndexDocument;
}

interface LockRecord {
  readonly version: 1;
  readonly pid: number;
  readonly token: string;
  readonly createdAt: string;
}

export class ProjectIndexStore {
  private writeTail: Promise<void> = Promise.resolve();
  private readonly indexDirectory: string;
  private readonly isProcessAlive: (pid: number) => boolean;
  private readonly now: () => Date;
  private readonly randomId: () => string;

  constructor(private readonly options: ProjectIndexStoreOptions) {
    this.indexDirectory = path.join(options.stateDirectory, INDEX_DIRECTORY_NAME);
    this.isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
    this.now = options.now ?? (() => new Date());
    this.randomId = options.randomId ?? (() => randomUUID());
  }

  async load(): Promise<ProjectIndexLoadResult> {
    await this.assertVaultExternal();
    await mkdir(this.indexDirectory, { recursive: true });
    return await this.loadUnlocked();
  }

  async createProject(input: ProjectIndexCreateInput): Promise<ProjectIndexDocument> {
    return await this.enqueueWrite(async () => {
      validateCreateInput(input);
      await this.validateSourceDirectories(input.workspaces);
      return await this.withWriteLock(async () => {
        const loaded = await this.loadUnlocked();
        const projectId = input.projectId ?? this.randomId();
        validateIdentifier(projectId, 'projectId');
        const existing = loaded.document.projects.find(project => project.projectId === projectId);
        if (existing) {
          if (sameCreateInput(existing, input)) return loaded.document;
          throw new ProjectIndexError('project_index_project_conflict', 'projectId 已存在');
        }
        if (loaded.document.projects.length >= MAX_PROJECTS) {
          throw new ProjectIndexError('project_index_invalid', '项目索引已达到容量上限');
        }
        const timestamp = this.now().toISOString();
        const project: ProjectRecord = {
          projectId,
          displayName: input.displayName,
          workspaces: freezeWorkspaces(input.workspaces),
          pinned: input.pinned ?? false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const projects = [...loaded.document.projects, project];
        validateProjectCollection(projects);
        const next = freezeDocument({
          version: PROJECT_INDEX_VERSION,
          revision: loaded.document.revision + 1,
          projects,
        });
        await this.writeSnapshot(next);
        return next;
      });
    });
  }

  async updateProject(
    projectId: string,
    input: ProjectIndexUpdateInput,
  ): Promise<ProjectIndexDocument> {
    return await this.enqueueWrite(async () => {
      validateIdentifier(projectId, 'projectId');
      validateUpdateInput(input);
      if (input.workspaces !== undefined) await this.validateSourceDirectories(input.workspaces);
      return await this.withWriteLock(async () => {
        const loaded = await this.loadUnlocked();
        const current = loaded.document.projects.find(project => project.projectId === projectId);
        if (!current) throw new ProjectIndexError('project_index_project_conflict', '待更新项目不存在');
        const timestamp = this.now().toISOString();
        const nextProject: ProjectRecord = {
          ...current,
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.workspaces === undefined
            ? {}
            : { workspaces: freezeWorkspaces(input.workspaces) }),
          ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
          updatedAt: timestamp,
        };
        const projects = loaded.document.projects.map(project => (
          project.projectId === projectId ? nextProject : project
        ));
        validateProjectCollection(projects);
        const next = freezeDocument({
          version: PROJECT_INDEX_VERSION,
          revision: loaded.document.revision + 1,
          projects,
        });
        await this.writeSnapshot(next);
        return next;
      });
    });
  }

  async reorderProjects(projectIds: readonly string[]): Promise<ProjectIndexDocument> {
    return await this.enqueueWrite(async () => {
      validateProjectOrder(projectIds);
      return await this.withWriteLock(async () => {
        const loaded = await this.loadUnlocked();
        const known = new Map(loaded.document.projects.map(project => [project.projectId, project]));
        if (projectIds.length !== known.size || projectIds.some(projectId => !known.has(projectId))) {
          throw new ProjectIndexError('project_index_project_conflict', '项目顺序必须完整覆盖当前项目');
        }
        const projects = projectIds.map((projectId) => {
          const project = known.get(projectId);
          if (!project) throw new ProjectIndexError('project_index_project_conflict', '项目顺序引用未知项目');
          return project;
        });
        const next = freezeDocument({
          version: PROJECT_INDEX_VERSION,
          revision: loaded.document.revision + 1,
          projects,
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
    // Serialize lock acquisition/recovery as well as writes. An interrupted
    // guard is deliberately fail-closed: its owner cannot be proved dead.
    const guardPath = path.join(this.indexDirectory, `${LOCK_FILE_NAME}.guard`);
    let guard: FileHandle;
    try {
      guard = await open(guardPath, 'wx', 0o600);
    } catch (error) {
      if (isNodeError(error, 'EEXIST')) {
        throw new ProjectIndexError('project_index_locked', '项目索引锁正在获取或需要人工检查');
      }
      throw error;
    }
    try {
      return await this.acquireGuardedWriteLock();
    } finally {
      await guard.close();
      await rm(guardPath);
    }
  }

  private async acquireGuardedWriteLock(): Promise<FileHandle> {
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
        try {
          await lock.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
          await lock.sync();
        } catch (error) {
          await lock.close();
          throw error;
        }
        return lock;
      } catch (error) {
        if (!isNodeError(error, 'EEXIST')) throw error;
        const owner = await readLockRecord(lockPath);
        if (owner === null || this.isProcessAlive(owner.pid)) {
          throw new ProjectIndexError('project_index_locked', '项目索引正在由另一个进程写入');
        }
        if (attempt > 0) {
          throw new ProjectIndexError('project_index_locked', '项目索引写锁无法安全接管');
        }
        await rename(
          lockPath,
          path.join(
            this.indexDirectory,
            `${LOCK_FILE_NAME}.stale.${fileTimestamp(this.now())}.${this.randomId()}`,
          ),
        );
      }
    }
    throw new ProjectIndexError('project_index_locked', '项目索引写锁无法获取');
  }

  private async loadUnlocked(): Promise<ProjectIndexLoadResult> {
    const slots = await Promise.all(INDEX_FILE_NAMES.map(async fileName => await this.readSlot(fileName)));
    const valid = slots
      .filter((slot): slot is SlotReadResult & { readonly document: ProjectIndexDocument } => (
        slot.status === 'valid' && slot.document !== undefined
      ))
      .sort((left, right) => right.document.revision - left.document.revision);
    const invalid = slots.filter(slot => slot.status === 'invalid').map(slot => slot.fileName);
    if (valid.length === 0) {
      if (slots.every(slot => slot.status === 'missing')) {
        return {
          document: freezeDocument({ version: PROJECT_INDEX_VERSION, revision: 0, projects: [] }),
          degraded: false,
          isolatedFiles: Object.freeze([]),
        };
      }
      throw new ProjectIndexError('project_index_corrupt', '项目索引没有可读的有效快照');
    }
    const latest = valid[0];
    if (!latest) throw new ProjectIndexError('project_index_corrupt', '项目索引有效快照丢失');
    return {
      document: latest.document,
      degraded: invalid.length > 0,
      isolatedFiles: Object.freeze(invalid),
    };
  }

  private async readSlot(fileName: typeof INDEX_FILE_NAMES[number]): Promise<SlotReadResult> {
    const filePath = path.join(this.indexDirectory, fileName);
    try {
      const metadata = await lstat(filePath);
      if (!metadata.isFile() || metadata.size > MAX_INDEX_BYTES) {
        return { fileName, status: 'invalid' };
      }
      const document = parseDocument(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
      return { fileName, status: 'valid', document };
    } catch (error) {
      if (error instanceof ProjectIndexError && error.code === 'project_index_version_unsupported') {
        throw error;
      }
      if (isNodeError(error, 'ENOENT')) return { fileName, status: 'missing' };
      return { fileName, status: 'invalid' };
    }
  }

  private async writeSnapshot(document: ProjectIndexDocument): Promise<void> {
    const slotIndex = document.revision % INDEX_FILE_NAMES.length;
    const fileName = INDEX_FILE_NAMES[slotIndex];
    if (!fileName) throw new ProjectIndexError('project_index_invalid', '项目索引槽位无效');
    const destination = path.join(this.indexDirectory, fileName);
    const temporary = `${destination}.${this.randomId()}.tmp`;
    const serialized = `${JSON.stringify(document)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_INDEX_BYTES) {
      throw new ProjectIndexError('project_index_invalid', '项目索引超过文件大小上限');
    }
    try {
      const temporaryHandle = await open(temporary, 'wx', 0o600);
      try {
        await temporaryHandle.writeFile(serialized, 'utf8');
        await temporaryHandle.sync();
      } finally {
        await temporaryHandle.close();
      }
      const verified = parseDocument(JSON.parse(await readFile(temporary, 'utf8')) as unknown);
      if (verified.revision !== document.revision) {
        throw new ProjectIndexError('project_index_corrupt', '项目索引临时快照读回不一致');
      }
      const existing = await this.readSlot(fileName);
      if (existing.status === 'invalid') {
        await rename(
          destination,
          `${destination}.corrupt.${fileTimestamp(this.now())}.${this.randomId()}`,
        );
      }
      await rename(temporary, destination);
      const readback = await this.readSlot(fileName);
      if (readback.status !== 'valid' || readback.document?.revision !== document.revision) {
        throw new ProjectIndexError('project_index_corrupt', '项目索引原子写入读回失败');
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async assertVaultExternal(): Promise<void> {
    if (!path.isAbsolute(this.options.stateDirectory) || !path.isAbsolute(this.options.vaultPath)) {
      throw new ProjectIndexError('project_index_invalid', 'stateDirectory 和 vaultPath 必须是绝对路径');
    }
    let state: string;
    let vault: string;
    let index: string;
    try {
      [state, vault, index] = await Promise.all([
        resolvePotentialPath(this.options.stateDirectory),
        realpath(this.options.vaultPath),
        resolvePotentialPath(this.indexDirectory),
      ]);
    } catch {
      throw new ProjectIndexError('project_index_invalid', '无法安全解析项目索引或 Vault 路径');
    }
    state = normalizeForComparison(state);
    vault = normalizeForComparison(vault);
    if (isWithin(vault, state) || isWithin(vault, normalizeForComparison(index))) {
      throw new ProjectIndexError('project_index_state_in_vault', '项目索引必须保存在 Vault 外');
    }
    if (!samePath(index, path.join(state, INDEX_DIRECTORY_NAME))) {
      throw new ProjectIndexError('project_index_invalid', '项目索引子目录不能重定向到状态分区之外');
    }
  }

  private async validateSourceDirectories(workspaces: readonly ProjectWorkspaceReference[]): Promise<void> {
    await this.assertVaultExternal();
    const [vault, state] = await Promise.all([
      realpath(this.options.vaultPath), resolvePotentialPath(this.options.stateDirectory),
    ]);
    await validateSourceDirectories(workspaces);
    for (const workspace of workspaces) {
      if (pathsOverlap(workspace.canonicalPath, vault) || pathsOverlap(workspace.canonicalPath, state)) {
        throw new ProjectIndexError('project_index_source_invalid', '项目源必须与 Vault 和运行状态分区分离');
      }
    }
  }
}

function validateCreateInput(input: ProjectIndexCreateInput): void {
  if (input.projectId !== undefined) validateIdentifier(input.projectId, 'projectId');
  validateDisplayName(input.displayName);
  validateWorkspaceReferences(input.workspaces);
  if (input.pinned !== undefined && typeof input.pinned !== 'boolean') {
    throw new ProjectIndexError('project_index_invalid', 'pinned 必须是 boolean');
  }
}

function validateUpdateInput(input: ProjectIndexUpdateInput): void {
  if (input.displayName !== undefined) validateDisplayName(input.displayName);
  if (input.workspaces !== undefined) validateWorkspaceReferences(input.workspaces);
  if (input.pinned !== undefined && typeof input.pinned !== 'boolean') {
    throw new ProjectIndexError('project_index_invalid', 'pinned 必须是 boolean');
  }
  if (input.displayName === undefined && input.workspaces === undefined && input.pinned === undefined) {
    throw new ProjectIndexError('project_index_invalid', '项目更新不能为空');
  }
}

function validateWorkspaceReferences(workspaces: readonly ProjectWorkspaceReference[]): void {
  if (workspaces.length === 0 || workspaces.length > MAX_SOURCE_FOLDERS) {
    throw new ProjectIndexError('project_index_invalid', '项目必须包含 1 至 64 个 DSH Workspace');
  }
  const workspaceIds = new Set<string>();
  for (const workspace of workspaces) {
    validateIdentifier(workspace.workspaceId, 'workspaceId');
    if (workspaceIds.has(workspace.workspaceId)) {
      throw new ProjectIndexError('project_index_source_conflict', '项目包含重复 DSH Workspace');
    }
    workspaceIds.add(workspace.workspaceId);
    validateCanonicalPath(workspace.canonicalPath);
  }
  assertNoOverlappingPaths(workspaces);
}

async function validateSourceDirectories(
  workspaces: readonly ProjectWorkspaceReference[],
): Promise<void> {
  for (const workspace of workspaces) {
    let resolved: string;
    try {
      resolved = await realpath(workspace.canonicalPath);
      if (!(await stat(resolved)).isDirectory()) throw new Error('not-directory');
    } catch {
      throw new ProjectIndexError(
        'project_index_source_invalid',
        `DSH Workspace 路径不可用：${path.basename(workspace.canonicalPath) || '[root]'}`,
      );
    }
    if (!samePath(resolved, workspace.canonicalPath)) {
      throw new ProjectIndexError(
        'project_index_source_invalid',
        'DSH Workspace 路径不是已规范化的 canonical path',
      );
    }
  }
}

function validateProjectCollection(projects: readonly ProjectRecord[]): void {
  if (projects.length > MAX_PROJECTS) {
    throw new ProjectIndexError('project_index_invalid', '项目索引已达到容量上限');
  }
  const projectIds = new Set<string>();
  const names = new Set<string>();
  const workspaceIds = new Set<string>();
  const sources: ProjectWorkspaceReference[] = [];
  for (const project of projects) {
    validateIdentifier(project.projectId, 'projectId');
    if (projectIds.has(project.projectId)) {
      throw new ProjectIndexError('project_index_corrupt', '项目索引包含重复 projectId');
    }
    projectIds.add(project.projectId);
    validateDisplayName(project.displayName);
    if (names.has(project.displayName)) {
      throw new ProjectIndexError('project_index_name_conflict', '项目显示名称重复');
    }
    names.add(project.displayName);
    validateWorkspaceReferences(project.workspaces);
    if (typeof project.pinned !== 'boolean') {
      throw new ProjectIndexError('project_index_corrupt', '项目 pinned 无效');
    }
    validateTimestamp(project.createdAt, 'createdAt');
    validateTimestamp(project.updatedAt, 'updatedAt');
    for (const workspace of project.workspaces) {
      if (workspaceIds.has(workspace.workspaceId)) {
        throw new ProjectIndexError('project_index_source_conflict', 'DSH Workspace 已归属于多个项目');
      }
      workspaceIds.add(workspace.workspaceId);
      sources.push(workspace);
    }
  }
  assertNoOverlappingPaths(sources);
}

function validateProjectOrder(projectIds: readonly string[]): void {
  if (new Set(projectIds).size !== projectIds.length) {
    throw new ProjectIndexError('project_index_project_conflict', '项目顺序包含重复 projectId');
  }
  projectIds.forEach(projectId => validateIdentifier(projectId, 'projectId'));
}

function sameCreateInput(project: ProjectRecord, input: ProjectIndexCreateInput): boolean {
  return project.projectId === input.projectId
    && project.displayName === input.displayName
    && project.pinned === (input.pinned ?? false)
    && sameWorkspaceReferences(project.workspaces, input.workspaces);
}

function sameWorkspaceReferences(
  left: readonly ProjectWorkspaceReference[],
  right: readonly ProjectWorkspaceReference[],
): boolean {
  return left.length === right.length
    && left.every((workspace, index) => {
      const other = right[index];
      return other !== undefined
        && workspace.workspaceId === other.workspaceId
        && samePath(workspace.canonicalPath, other.canonicalPath);
    });
}

function assertNoOverlappingPaths(workspaces: readonly ProjectWorkspaceReference[]): void {
  for (let index = 0; index < workspaces.length; index += 1) {
    const current = workspaces[index];
    if (!current) continue;
    for (let otherIndex = index + 1; otherIndex < workspaces.length; otherIndex += 1) {
      const other = workspaces[otherIndex];
      if (other && pathsOverlap(current.canonicalPath, other.canonicalPath)) {
        throw new ProjectIndexError('project_index_source_conflict', 'DSH Workspace 路径存在重复或包含关系');
      }
    }
  }
}

function validateDisplayName(value: string): void {
  const characters = Array.from(value);
  if (characters.length === 0
    || characters.length > MAX_DISPLAY_NAME_CHARACTERS
    || value.trim() !== value
    || /[\r\n]/u.test(value)) {
    throw new ProjectIndexError('project_index_invalid', '项目显示名称无效');
  }
}

function validateIdentifier(value: string, label: string): void {
  const characters = Array.from(value);
  if (characters.length === 0
    || characters.length > MAX_IDENTIFIER_CHARACTERS
    || value.trim() !== value
    || /\s/u.test(value)) {
    throw new ProjectIndexError('project_index_invalid', `${label} 无效`);
  }
}

function validateCanonicalPath(value: string): void {
  if (!path.isAbsolute(value) || value.includes('\0') || path.normalize(value) !== value) {
    throw new ProjectIndexError('project_index_source_invalid', 'DSH Workspace 必须是规范化绝对路径');
  }
}

function validateTimestamp(value: string, label: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ProjectIndexError('project_index_corrupt', `${label} 无效`);
  }
}

function parseDocument(value: unknown): ProjectIndexDocument {
  // A future schema may add keys. Detect its version before validating v1
  // shape so an older plugin cannot treat it as corruption and overwrite it.
  if (value !== null && typeof value === 'object' && !Array.isArray(value)
    && 'version' in value && value.version !== PROJECT_INDEX_VERSION) {
    throw new ProjectIndexError('project_index_version_unsupported', '项目索引版本不受支持，禁止覆盖或自动迁移');
  }
  const record = expectExactRecord(value, ['projects', 'revision', 'version'], '项目索引');
  if (record['version'] !== PROJECT_INDEX_VERSION) {
    throw new ProjectIndexError('project_index_version_unsupported', '项目索引版本不受支持，禁止覆盖或自动迁移');
  }
  const revision = record['revision'];
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new ProjectIndexError('project_index_corrupt', '项目索引 revision 无效');
  }
  const rawProjects = record['projects'];
  if (!Array.isArray(rawProjects) || rawProjects.length > MAX_PROJECTS) {
    throw new ProjectIndexError('project_index_corrupt', '项目索引 projects 无效');
  }
  const projects = rawProjects.map((project, index) => parseProject(project, index));
  validateProjectCollection(projects);
  return freezeDocument({ version: PROJECT_INDEX_VERSION, revision, projects });
}

function parseProject(value: unknown, index: number): ProjectRecord {
  const label = `项目索引 projects[${String(index)}]`;
  const record = expectExactRecord(
    value,
    ['createdAt', 'displayName', 'pinned', 'projectId', 'updatedAt', 'workspaces'],
    label,
  );
  const projectId = expectString(record['projectId'], `${label}.projectId`);
  validateIdentifier(projectId, `${label}.projectId`);
  const displayName = expectString(record['displayName'], `${label}.displayName`);
  validateDisplayName(displayName);
  if (typeof record['pinned'] !== 'boolean') {
    throw new ProjectIndexError('project_index_corrupt', `${label}.pinned 无效`);
  }
  const rawWorkspaces = record['workspaces'];
  if (!Array.isArray(rawWorkspaces)) {
    throw new ProjectIndexError('project_index_corrupt', `${label}.workspaces 无效`);
  }
  const workspaces = rawWorkspaces.map((workspace, workspaceIndex) => {
    const workspaceLabel = `${label}.workspaces[${String(workspaceIndex)}]`;
    const parsed = expectExactRecord(workspace, ['canonicalPath', 'workspaceId'], workspaceLabel);
    const workspaceId = expectString(parsed['workspaceId'], `${workspaceLabel}.workspaceId`);
    validateIdentifier(workspaceId, `${workspaceLabel}.workspaceId`);
    const canonicalPath = expectString(parsed['canonicalPath'], `${workspaceLabel}.canonicalPath`);
    validateCanonicalPath(canonicalPath);
    return { workspaceId, canonicalPath };
  });
  const createdAt = expectString(record['createdAt'], `${label}.createdAt`);
  const updatedAt = expectString(record['updatedAt'], `${label}.updatedAt`);
  validateTimestamp(createdAt, `${label}.createdAt`);
  validateTimestamp(updatedAt, `${label}.updatedAt`);
  return { projectId, displayName, workspaces, pinned: record['pinned'], createdAt, updatedAt };
}

function freezeDocument(document: ProjectIndexDocument): ProjectIndexDocument {
  const projects = document.projects.map(project => Object.freeze({
    ...project,
    workspaces: freezeWorkspaces(project.workspaces),
  }));
  return Object.freeze({ ...document, projects: Object.freeze(projects) });
}

function freezeWorkspaces(
  workspaces: readonly ProjectWorkspaceReference[],
): readonly ProjectWorkspaceReference[] {
  return Object.freeze(workspaces.map(workspace => Object.freeze({ ...workspace })));
}

function expectExactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectIndexError('project_index_corrupt', `${label} 必须是对象`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ProjectIndexError('project_index_corrupt', `${label} 字段无效`);
  }
  return record;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ProjectIndexError('project_index_corrupt', `${label} 必须是字符串`);
  }
  return value;
}

function pathsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);
  return isWithin(normalizedLeft, normalizedRight) || isWithin(normalizedRight, normalizedLeft);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  return normalizeForComparison(left) === normalizeForComparison(right);
}

function normalizeForComparison(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

async function resolvePotentialPath(candidate: string): Promise<string> {
  const unresolved: string[] = [];
  let current = path.resolve(candidate);
  while (true) {
    try {
      const existing = path.resolve(await realpath(current));
      return path.join(existing, ...unresolved.reverse());
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      unresolved.push(path.basename(current));
      current = parent;
    }
  }
}

async function readLockRecord(lockPath: string): Promise<LockRecord | null> {
  try {
    if (!(await lstat(lockPath)).isFile()) return null;
    const parsed = JSON.parse(await readFile(lockPath, 'utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record['version'] !== 1
      || typeof record['pid'] !== 'number'
      || !Number.isSafeInteger(record['pid'])
      || record['pid'] <= 0
      || typeof record['token'] !== 'string'
      || record['token'].length === 0
      || typeof record['createdAt'] !== 'string') return null;
    return { version: 1, pid: record['pid'], token: record['token'], createdAt: record['createdAt'] };
  } catch {
    return null;
  }
}

function fileTimestamp(now: Date): string {
  return now.toISOString().replace(/[.:]/gu, '-');
}

function defaultIsProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isNodeError(error, 'ESRCH');
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && error.code === code;
}
