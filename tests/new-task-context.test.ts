import { describe, expect, it } from 'vitest';

import { MAX_NDJSON_FRAME_BYTES } from '../src/bridge-ndjson-transport';
import {
  MAX_NEW_TASK_CONTEXT_ITEM_BYTES,
  MAX_NEW_TASK_CONTEXT_ITEMS,
  MAX_NEW_TASK_CONTEXT_TOTAL_BYTES,
  NewTaskContextError,
  addNewTaskContextSelection,
  addNewTaskContextSelections,
  createCurrentSelectionContext,
  createNewTaskContextSnapshot,
  createVaultFileContext,
  removeNewTaskContextSelection,
  type NewTaskContextReader,
} from '../src/new-task-context';

describe('新建任务只读上下文', () => {
  it('只接受规范化的 Vault Markdown 路径并拒绝重复或超量选择', () => {
    const current = createVaultFileContext('current-note', '项目/周报.md');
    let selections = addNewTaskContextSelection([], current);

    expect(selections).toEqual([current]);
    expect(Object.isFrozen(selections)).toBe(true);
    expect(() => addNewTaskContextSelection(selections, current)).toThrow(
      expect.objectContaining({ code: 'duplicate_context' }),
    );
    expect(() => createVaultFileContext('vault-file', '../越界.md')).toThrow(
      expect.objectContaining({ code: 'context_path_invalid' }),
    );
    expect(() => createVaultFileContext('vault-file', '附件.png')).toThrow(
      expect.objectContaining({ code: 'context_binary' }),
    );

    for (let index = 1; index < MAX_NEW_TASK_CONTEXT_ITEMS; index += 1) {
      selections = addNewTaskContextSelection(
        selections,
        createVaultFileContext('vault-file', `资料/${String(index)}.md`),
      );
    }
    expect(() => addNewTaskContextSelection(
      selections,
      createVaultFileContext('vault-file', '资料/超量.md'),
    )).toThrow(expect.objectContaining({ code: 'context_count_exceeded' }));

    expect(removeNewTaskContextSelection(selections, current.id)).not.toContain(current);
  });

  it('把文件夹展开结果作为一个原子批次加入，重复或超量时不部分修改', () => {
    const existing = [createVaultFileContext('vault-file', '资料/已选.md')];
    const folderFiles = [
      createVaultFileContext('vault-file', '资料/一.md'),
      createVaultFileContext('vault-file', '资料/子目录/二.md'),
    ];

    const selections = addNewTaskContextSelections(existing, folderFiles);
    expect(selections.map((selection) => selection.id)).toEqual([
      'vault-file:资料/已选.md',
      'vault-file:资料/一.md',
      'vault-file:资料/子目录/二.md',
    ]);
    expect(Object.isFrozen(selections)).toBe(true);

    const duplicateBatch = [folderFiles[0]!, folderFiles[0]!];
    expect(() => addNewTaskContextSelections(existing, duplicateBatch)).toThrow(
      expect.objectContaining({ code: 'duplicate_context' }),
    );
    expect(existing).toHaveLength(1);

    const tooMany = Array.from(
      { length: MAX_NEW_TASK_CONTEXT_ITEMS },
      (_, index) => createVaultFileContext('vault-file', `批量/${String(index)}.md`),
    );
    expect(() => addNewTaskContextSelections(existing, tooMany)).toThrow(
      expect.objectContaining({ code: 'context_count_exceeded' }),
    );
    expect(existing).toHaveLength(1);
  });

  it('在加入时固定当前选区文本并拒绝空白或单项超限', () => {
    const selection = createCurrentSelectionContext({
      content: '本段是用户明确选择的内容',
      rangeKey: '3:0-3:13',
      sourcePath: '项目/周报.md',
    });

    expect(selection).toMatchObject({
      content: '本段是用户明确选择的内容',
      kind: 'current-selection',
      sourcePath: '项目/周报.md',
    });
    expect(Object.isFrozen(selection)).toBe(true);
    expect(() => createCurrentSelectionContext({
      content: '   ',
      rangeKey: '1:0-1:3',
      sourcePath: '项目/周报.md',
    })).toThrow(expect.objectContaining({ code: 'context_empty' }));
    expect(() => createCurrentSelectionContext({
      content: 'a'.repeat(MAX_NEW_TASK_CONTEXT_ITEM_BYTES + 1),
      rangeKey: '1:0-1:1',
      sourcePath: '项目/周报.md',
    })).toThrow(expect.objectContaining({ code: 'context_item_too_large' }));
  });

  it('发送前从宿主重新读取文件并建立不随后续编辑变化的不可变快照', async () => {
    let currentContent = '发送时版本';
    const reader: NewTaskContextReader = {
      readVaultText: async (path) => ({ content: currentContent, path }),
    };
    const file = createVaultFileContext('current-note', '项目/周报.md');
    const selection = createCurrentSelectionContext({
      content: '固定选区',
      rangeKey: '2:0-2:4',
      sourcePath: '项目/周报.md',
    });

    const snapshot = await createNewTaskContextSnapshot([file, selection], reader);
    currentContent = '发送后的编辑';

    expect(snapshot.items.map((item) => item.content)).toEqual(['发送时版本', '固定选区']);
    expect(snapshot.totalBytes).toBeGreaterThan(0);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.items)).toBe(true);
    expect(snapshot.items.every((item) => Object.isFrozen(item))).toBe(true);
  });

  it('把失效读取与合计超限作为可定位错误，不修改既有选择', async () => {
    const selected = [createVaultFileContext('vault-file', '资料/失效.md')];
    const missingReader: NewTaskContextReader = {
      readVaultText: async () => {
        throw new NewTaskContextError('context_missing', '所选文件已失效：资料/失效.md');
      },
    };

    await expect(createNewTaskContextSnapshot(selected, missingReader)).rejects.toMatchObject({
      code: 'context_missing',
    });
    expect(selected).toHaveLength(1);

    const tooLargeReader: NewTaskContextReader = {
      readVaultText: async (path) => ({
        content: 'a'.repeat(MAX_NEW_TASK_CONTEXT_ITEM_BYTES),
        path,
      }),
    };
    const files = [
      createVaultFileContext('vault-file', '资料/一.md'),
      createVaultFileContext('vault-file', '资料/二.md'),
      createVaultFileContext('vault-file', '资料/三.md'),
    ];
    await expect(createNewTaskContextSnapshot(files, tooLargeReader)).rejects.toMatchObject({
      code: 'context_total_too_large',
    });
  });

  it('以最坏转义内容实测上下文上限仍低于 1 MiB bridge frame', async () => {
    const half = MAX_NEW_TASK_CONTEXT_TOTAL_BYTES / 2;
    expect(Number.isInteger(half)).toBe(true);
    expect(half).toBeLessThanOrEqual(MAX_NEW_TASK_CONTEXT_ITEM_BYTES);
    const files = [
      createVaultFileContext('vault-file', '资料/引号.md'),
      createVaultFileContext('vault-file', '资料/换行.md'),
    ];
    const reader: NewTaskContextReader = {
      readVaultText: async (path) => ({
        content: path.includes('引号') ? '"'.repeat(half) : '\n'.repeat(half),
        path,
      }),
    };
    const snapshot = await createNewTaskContextSnapshot(files, reader);
    const projectedText = JSON.stringify(snapshot);
    const wire = `${JSON.stringify({
      id: 'request-1',
      method: 'turn/start',
      params: { sessionId: 'session-1', text: projectedText, turnId: 'turn-1' },
      type: 'request',
    })}\n`;

    expect(snapshot.totalBytes).toBe(MAX_NEW_TASK_CONTEXT_TOTAL_BYTES);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThan(MAX_NDJSON_FRAME_BYTES);
  });
});
