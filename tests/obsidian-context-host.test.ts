import { describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';

import {
  MAX_NEW_TASK_CONTEXT_ITEM_BYTES,
  createCurrentSelectionContext,
  createVaultFileContext,
} from '../src/new-task-context';
import { ObsidianNewTaskContextHost } from '../src/obsidian-context-host';
import {
  App,
  Editor,
  MarkdownView,
  TFolder,
  mockObsidian,
  resetMockObsidian,
} from './mocks/obsidian';

describe('Obsidian 只读上下文宿主', () => {
  it('从活动 Markdown 视图捕获当前笔记和当前选区，并由用户显式加入', async () => {
    resetMockObsidian();
    const app = new App();
    const file = app.vault.addMarkdownFile('项目/周报.md', '# 周报\n用户选择的段落');
    app.workspace.activeFile = file;
    const markdownView = new MarkdownView(
      file,
      new Editor('用户选择的段落', { ch: 0, line: 1 }, { ch: 8, line: 1 }),
    );
    const markdownLeaf = app.workspace.getLeaf('tab');
    await markdownLeaf.setViewState({ active: false, type: 'markdown' });
    markdownLeaf.view = markdownView;
    const host = new ObsidianNewTaskContextHost(app as unknown as ObsidianApp);
    const onSelect = vi.fn();

    host.openPicker({ onError: vi.fn(), onSelect, onSelectMany: vi.fn(), selected: [] });

    const modal = mockObsidian.openModals[0];
    expect(modal?.title).toBe('选择知识库内容');
    const content = modal?.contentEl;
    expect(content?.allText()).toEqual(expect.arrayContaining([
      '只读取你明确加入的 Markdown 笔记或在编辑器里选中的文本；不会自动读取整个 Vault，也不会写入文件。',
      '加入当前笔记',
      '加入当前选区',
      '已选中 7 个字符；加入后冻结此文本',
      '选择 Vault Markdown 文件…',
      '选择文件夹…',
    ]));
    const choices = content?.findAllByClass('dsh-context-picker__choice') ?? [];
    expect(choices.map((choice) => choice.disabled)).toEqual([false, false, false, false]);
    await choices[1]?.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      content: '用户选择的段落',
      kind: 'current-selection',
      sourcePath: '项目/周报.md',
    }));
  });

  it('文件选择器只列出尚未加入的 Markdown 文件', async () => {
    resetMockObsidian();
    const app = new App();
    app.vault.addMarkdownFile('资料/已选.md', '已选');
    const available = app.vault.addMarkdownFile('资料/可选.md', '可选');
    app.vault.addMarkdownFile('资料/图片.png', 'not really text');
    const host = new ObsidianNewTaskContextHost(app as unknown as ObsidianApp);
    const onSelect = vi.fn();
    host.openPicker({
      onError: vi.fn(),
      onSelect,
      onSelectMany: vi.fn(),
      selected: [createVaultFileContext('vault-file', '资料/已选.md')],
    });
    const sourceModal = mockObsidian.openModals[0];
    await sourceModal?.contentEl.findAllByClass('dsh-context-picker__choice')[2]?.click();

    const fileModal = mockObsidian.openModals[1] as unknown as {
      getItems(): unknown[];
      onChooseItem(file: typeof available): void;
      placeholder: string;
    };
    expect(fileModal.placeholder).toBe('选择一个 Vault Markdown 文件');
    expect(fileModal.getItems()).toEqual([available]);
    fileModal.onChooseItem(available);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'vault-file',
      path: '资料/可选.md',
    }));
  });

  it('选择文件夹时递归展开未选择的 Markdown，并作为一个受限批次加入', async () => {
    resetMockObsidian();
    const app = new App();
    const folder = app.vault.addFolder('资料');
    app.vault.addFolder('资料/子目录');
    app.vault.addMarkdownFile('资料/已选.md', '已选');
    const direct = app.vault.addMarkdownFile('资料/一.md', '一');
    const nested = app.vault.addMarkdownFile('资料/子目录/二.md', '二');
    app.vault.addMarkdownFile('资料/图片.png', 'binary');
    const host = new ObsidianNewTaskContextHost(app as unknown as ObsidianApp);
    const onSelectMany = vi.fn();

    host.openPicker({
      onError: vi.fn(),
      onSelect: vi.fn(),
      onSelectMany,
      selected: [createVaultFileContext('vault-file', '资料/已选.md')],
    });
    const sourceModal = mockObsidian.openModals[0];
    await sourceModal?.contentEl.findAllByClass('dsh-context-picker__choice')[3]?.click();

    const folderModal = mockObsidian.openModals[1] as unknown as {
      getItemText(folder: TFolder): string;
      getItems(): TFolder[];
      onChooseItem(folder: TFolder): void;
      placeholder: string;
    };
    expect(folderModal.placeholder).toBe('选择一个 Vault 文件夹');
    expect(folderModal.getItems()).toEqual([folder, expect.objectContaining({ path: '资料/子目录' })]);
    expect(folderModal.getItemText(folder)).toBe('资料（2 篇可加入的 Markdown）');
    folderModal.onChooseItem(folder);
    expect(onSelectMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: `vault-file:${direct.path}`, path: direct.path }),
      expect.objectContaining({ id: `vault-file:${nested.path}`, path: nested.path }),
    ]);
  });

  it('文件夹展开超过剩余项数时整体失败且不提交部分笔记', async () => {
    resetMockObsidian();
    const app = new App();
    const folder = app.vault.addFolder('批量');
    app.vault.addMarkdownFile('批量/一.md', '一');
    app.vault.addMarkdownFile('批量/二.md', '二');
    const selected = Array.from(
      { length: 9 },
      (_, index) => createVaultFileContext('vault-file', `已选/${String(index)}.md`),
    );
    const host = new ObsidianNewTaskContextHost(app as unknown as ObsidianApp);
    const onError = vi.fn();
    const onSelectMany = vi.fn();

    host.openPicker({ onError, onSelect: vi.fn(), onSelectMany, selected });
    await mockObsidian.openModals[0]?.contentEl
      .findAllByClass('dsh-context-picker__choice')[3]?.click();
    const folderModal = mockObsidian.openModals[1] as unknown as {
      onChooseItem(folder: TFolder): void;
    };
    folderModal.onChooseItem(folder);

    expect(onError).toHaveBeenCalledWith('最多选择 10 项上下文。');
    expect(onSelectMany).not.toHaveBeenCalled();
  });

  it('文件夹展开使合计字节超限时在读取前整体失败', async () => {
    resetMockObsidian();
    const app = new App();
    const folder = app.vault.addFolder('大文件夹');
    app.vault.addMarkdownFile(
      '大文件夹/候选.md',
      'a'.repeat(MAX_NEW_TASK_CONTEXT_ITEM_BYTES),
    );
    const host = new ObsidianNewTaskContextHost(app as unknown as ObsidianApp);
    const onError = vi.fn();
    const onSelectMany = vi.fn();
    const selected = [createCurrentSelectionContext({
      content: 'b'.repeat(MAX_NEW_TASK_CONTEXT_ITEM_BYTES),
      rangeKey: '1:0-1:1',
      sourcePath: '资料/已选.md',
    }), createCurrentSelectionContext({
      content: 'c',
      rangeKey: '2:0-2:1',
      sourcePath: '资料/已选.md',
    })];

    host.openPicker({ onError, onSelect: vi.fn(), onSelectMany, selected });
    await mockObsidian.openModals[0]?.contentEl
      .findAllByClass('dsh-context-picker__choice')[3]?.click();
    const folderModal = mockObsidian.openModals[1] as unknown as {
      onChooseItem(folder: TFolder): void;
    };
    folderModal.onChooseItem(folder);

    expect(onError).toHaveBeenCalledWith('所选文件夹会使上下文合计超过 192 KiB 上限。');
    expect(onSelectMany).not.toHaveBeenCalled();
  });

  it('重复打开或宿主释放时关闭已有选择器', () => {
    resetMockObsidian();
    const app = new App();
    const host = new ObsidianNewTaskContextHost(app as unknown as ObsidianApp);
    const request = {
      onError: vi.fn(),
      onSelect: vi.fn(),
      onSelectMany: vi.fn(),
      selected: [],
    };

    host.openPicker(request);
    const first = mockObsidian.openModals[0];
    expect(first?.contentEl.allText().length).toBeGreaterThan(0);
    host.openPicker(request);
    const second = mockObsidian.openModals[1];
    expect(first?.contentEl.allText()).toEqual([]);
    expect(second?.contentEl.allText().length).toBeGreaterThan(0);

    host.dispose();
    expect(second?.contentEl.allText()).toEqual([]);
  });

  it('快照读取只接受仍存在且未超限的 Markdown 文件', async () => {
    resetMockObsidian();
    const app = new App();
    const host = new ObsidianNewTaskContextHost(app as unknown as ObsidianApp);
    app.vault.addMarkdownFile('资料/有效.md', '有效内容');
    app.vault.addMarkdownFile('资料/图片.png', 'binary');
    app.vault.addMarkdownFile(
      '资料/超限.md',
      'a'.repeat(MAX_NEW_TASK_CONTEXT_ITEM_BYTES + 1),
    );

    await expect(host.readVaultText('资料/有效.md')).resolves.toEqual({
      content: '有效内容',
      path: '资料/有效.md',
    });
    await expect(host.readVaultText('资料/失效.md')).rejects.toMatchObject({
      code: 'context_missing',
    });
    await expect(host.readVaultText('资料/图片.png')).rejects.toMatchObject({
      code: 'context_binary',
    });
    await expect(host.readVaultText('资料/超限.md')).rejects.toMatchObject({
      code: 'context_item_too_large',
    });
  });
});
