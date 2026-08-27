export const MAX_NEW_TASK_CONTEXT_ITEMS = 10;
export const MAX_NEW_TASK_CONTEXT_ITEM_BYTES = 96 * 1024;
export const MAX_NEW_TASK_CONTEXT_TOTAL_BYTES = 192 * 1024;
export const MAX_NEW_TASK_VAULT_PATH_LENGTH = 1024;

export type NewTaskContextKind = 'current-note' | 'current-selection' | 'vault-file';

export type NewTaskContextErrorCode =
  | 'context_binary'
  | 'context_count_exceeded'
  | 'context_empty'
  | 'context_item_too_large'
  | 'context_missing'
  | 'context_path_invalid'
  | 'context_total_too_large'
  | 'context_unreadable'
  | 'duplicate_context';

interface NewTaskVaultFileContext {
  readonly id: string;
  readonly kind: 'current-note' | 'vault-file';
  readonly path: string;
}

interface NewTaskCurrentSelectionContext {
  readonly content: string;
  readonly id: string;
  readonly kind: 'current-selection';
  readonly rangeKey: string;
  readonly sourcePath?: string;
}

export type NewTaskContextSelection =
  | NewTaskCurrentSelectionContext
  | NewTaskVaultFileContext;

export interface NewTaskContextSnapshotItem {
  readonly bytes: number;
  readonly content: string;
  readonly id: string;
  readonly kind: NewTaskContextKind;
  readonly path?: string;
}

export interface NewTaskContextSnapshot {
  readonly items: readonly NewTaskContextSnapshotItem[];
  readonly totalBytes: number;
  readonly version: 1;
}

export interface NewTaskContextReader {
  readVaultText(path: string): Promise<{ readonly content: string; readonly path: string }>;
}

export class NewTaskContextError extends Error {
  constructor(
    readonly code: NewTaskContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NewTaskContextError';
  }
}

export function createVaultFileContext(
  kind: 'current-note' | 'vault-file',
  path: string,
): NewTaskContextSelection {
  const validatedPath = validateVaultMarkdownPath(path);
  return Object.freeze({
    id: `vault-file:${validatedPath}`,
    kind,
    path: validatedPath,
  });
}

export function createCurrentSelectionContext(input: {
  readonly content: string;
  readonly rangeKey: string;
  readonly sourcePath?: string;
}): NewTaskContextSelection {
  if (input.content.trim().length === 0) {
    throw new NewTaskContextError('context_empty', '当前选区为空，未加入上下文。');
  }
  assertItemByteLimit(input.content, '当前选区');
  const rangeKey = input.rangeKey.trim();
  if (rangeKey.length === 0 || rangeKey.length > 128) {
    throw new NewTaskContextError('context_path_invalid', '当前选区范围无效。');
  }
  const sourcePath = input.sourcePath === undefined
    ? undefined
    : validateVaultMarkdownPath(input.sourcePath);
  const sourceKey = sourcePath ?? '未命名笔记';
  return Object.freeze({
    content: input.content,
    id: `current-selection:${sourceKey}:${rangeKey}`,
    kind: 'current-selection',
    rangeKey,
    ...(sourcePath === undefined ? {} : { sourcePath }),
  });
}

export function addNewTaskContextSelection(
  selections: readonly NewTaskContextSelection[],
  selection: NewTaskContextSelection,
): readonly NewTaskContextSelection[] {
  if (selections.some((item) => item.id === selection.id)) {
    throw new NewTaskContextError('duplicate_context', '该上下文已经加入。');
  }
  if (selections.length >= MAX_NEW_TASK_CONTEXT_ITEMS) {
    throw new NewTaskContextError(
      'context_count_exceeded',
      `最多选择 ${String(MAX_NEW_TASK_CONTEXT_ITEMS)} 项上下文。`,
    );
  }
  return Object.freeze([...selections, selection]);
}

export function removeNewTaskContextSelection(
  selections: readonly NewTaskContextSelection[],
  id: string,
): readonly NewTaskContextSelection[] {
  return Object.freeze(selections.filter((selection) => selection.id !== id));
}

export async function createNewTaskContextSnapshot(
  selections: readonly NewTaskContextSelection[],
  reader: NewTaskContextReader,
): Promise<NewTaskContextSnapshot> {
  if (selections.length > MAX_NEW_TASK_CONTEXT_ITEMS) {
    throw new NewTaskContextError(
      'context_count_exceeded',
      `最多选择 ${String(MAX_NEW_TASK_CONTEXT_ITEMS)} 项上下文。`,
    );
  }

  const items: NewTaskContextSnapshotItem[] = [];
  let totalBytes = 0;
  for (const selection of selections) {
    const item = selection.kind === 'current-selection'
      ? snapshotCurrentSelection(selection)
      : await snapshotVaultFile(selection, reader);
    totalBytes += item.bytes;
    if (totalBytes > MAX_NEW_TASK_CONTEXT_TOTAL_BYTES) {
      throw new NewTaskContextError(
        'context_total_too_large',
        `上下文合计不得超过 ${formatKib(MAX_NEW_TASK_CONTEXT_TOTAL_BYTES)}。`,
      );
    }
    items.push(item);
  }

  return Object.freeze({
    items: Object.freeze(items),
    totalBytes,
    version: 1,
  });
}

export function contextSelectionLabel(selection: NewTaskContextSelection): string {
  switch (selection.kind) {
    case 'current-note':
      return `当前笔记 · ${selection.path}`;
    case 'current-selection':
      return `当前选区 · ${selection.sourcePath ?? '未命名笔记'}`;
    case 'vault-file':
      return `Vault 文件 · ${selection.path}`;
  }
}

export function formatContextByteLimit(): string {
  return `${String(MAX_NEW_TASK_CONTEXT_ITEMS)} 项 / 单项 ${formatKib(MAX_NEW_TASK_CONTEXT_ITEM_BYTES)} / 合计 ${formatKib(MAX_NEW_TASK_CONTEXT_TOTAL_BYTES)}`;
}

function snapshotCurrentSelection(
  selection: NewTaskCurrentSelectionContext,
): NewTaskContextSnapshotItem {
  const bytes = assertItemByteLimit(selection.content, '当前选区');
  return Object.freeze({
    bytes,
    content: selection.content,
    id: selection.id,
    kind: selection.kind,
    ...(selection.sourcePath === undefined ? {} : { path: selection.sourcePath }),
  });
}

async function snapshotVaultFile(
  selection: NewTaskVaultFileContext,
  reader: NewTaskContextReader,
): Promise<NewTaskContextSnapshotItem> {
  let result: { readonly content: string; readonly path: string };
  try {
    result = await reader.readVaultText(selection.path);
  } catch (error) {
    if (error instanceof NewTaskContextError) throw error;
    throw new NewTaskContextError(
      'context_unreadable',
      `无法读取所选文件：${selection.path}`,
    );
  }
  if (result.path !== selection.path) {
    throw new NewTaskContextError('context_path_invalid', '宿主返回了不匹配的 Vault 路径。');
  }
  const bytes = assertItemByteLimit(result.content, selection.path);
  return Object.freeze({
    bytes,
    content: result.content,
    id: selection.id,
    kind: selection.kind,
    path: selection.path,
  });
}

function assertItemByteLimit(content: string, label: string): number {
  const bytes = new TextEncoder().encode(content).byteLength;
  if (bytes > MAX_NEW_TASK_CONTEXT_ITEM_BYTES) {
    throw new NewTaskContextError(
      'context_item_too_large',
      `${label} 超过单项 ${formatKib(MAX_NEW_TASK_CONTEXT_ITEM_BYTES)} 上限。`,
    );
  }
  return bytes;
}

function validateVaultMarkdownPath(path: string): string {
  const candidate = path.trim();
  const segments = candidate.split('/');
  const invalid = candidate.length === 0
    || candidate.length > MAX_NEW_TASK_VAULT_PATH_LENGTH
    || candidate.includes('\\')
    || candidate.includes('\0')
    || candidate.startsWith('/')
    || /^[a-zA-Z]:/u.test(candidate)
    || segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..');
  if (invalid) {
    throw new NewTaskContextError('context_path_invalid', 'Vault 上下文路径无效或已越界。');
  }
  if (!candidate.toLocaleLowerCase().endsWith('.md')) {
    throw new NewTaskContextError('context_binary', '只允许选择 Vault 内的 Markdown 文本文件。');
  }
  return candidate;
}

function formatKib(bytes: number): string {
  return `${String(bytes / 1024)} KiB`;
}
