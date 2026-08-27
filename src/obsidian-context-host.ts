import {
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  TFile,
  TFolder,
  type App,
} from 'obsidian';

import {
  MAX_NEW_TASK_CONTEXT_ITEM_BYTES,
  MAX_NEW_TASK_CONTEXT_ITEMS,
  MAX_NEW_TASK_CONTEXT_TOTAL_BYTES,
  NewTaskContextError,
  addNewTaskContextSelections,
  createCurrentSelectionContext,
  createVaultFileContext,
  type NewTaskContextReader,
  type NewTaskContextSelection,
} from './new-task-context';

export interface NewTaskContextPickerRequest {
  readonly onError: (message: string) => void;
  readonly onSelect: (selection: NewTaskContextSelection) => void;
  readonly onSelectMany: (selections: readonly NewTaskContextSelection[]) => void;
  readonly selected: readonly NewTaskContextSelection[];
}

export interface NewTaskContextHost extends NewTaskContextReader {
  dispose(): void;
  openPicker(request: NewTaskContextPickerRequest): void;
}

interface PickerSources {
  readonly currentNote?: NewTaskContextSelection;
  readonly currentSelection?: NewTaskContextSelection;
}

export class ObsidianNewTaskContextHost implements NewTaskContextHost {
  private activeModal: Modal | undefined;

  constructor(private readonly app: App) {}

  dispose(): void {
    this.activeModal?.close();
    this.activeModal = undefined;
  }

  openPicker(request: NewTaskContextPickerRequest): void {
    this.dispose();
    const sources = this.capturePickerSources(request.onError);
    const modal = new ContextSourceModal(this.app, {
      ...request,
      ...sources,
      openVaultFilePicker: () => {
        this.openVaultFilePicker(request);
      },
      openVaultFolderPicker: () => {
        this.openVaultFolderPicker(request);
      },
    });
    this.openTrackedModal(modal);
  }

  async readVaultText(path: string): Promise<{ readonly content: string; readonly path: string }> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.path !== path) {
      throw new NewTaskContextError('context_missing', `所选文件已失效：${path}`);
    }
    if (file.extension.toLocaleLowerCase() !== 'md') {
      throw new NewTaskContextError('context_binary', '只允许读取 Vault 内的 Markdown 文本文件。');
    }
    if (file.stat.size > MAX_NEW_TASK_CONTEXT_ITEM_BYTES) {
      throw new NewTaskContextError(
        'context_item_too_large',
        `${path} 超过单项 ${String(MAX_NEW_TASK_CONTEXT_ITEM_BYTES / 1024)} KiB 上限。`,
      );
    }
    try {
      return Object.freeze({ content: await this.app.vault.cachedRead(file), path: file.path });
    } catch {
      throw new NewTaskContextError('context_unreadable', `无法读取所选文件：${path}`);
    }
  }

  private capturePickerSources(onError: (message: string) => void): PickerSources {
    const activeFile = this.app.workspace.getActiveFile();
    const markdownFile = activeFile?.extension.toLocaleLowerCase() === 'md'
      ? activeFile
      : undefined;
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView)
      ?? this.app.workspace.getLeavesOfType('markdown')
        .map((leaf) => leaf.view)
        .find((view): view is MarkdownView => view instanceof MarkdownView
          && view.file?.path === markdownFile?.path);
    let currentNote: NewTaskContextSelection | undefined;
    let currentSelection: NewTaskContextSelection | undefined;

    try {
      if (markdownFile) currentNote = createVaultFileContext('current-note', markdownFile.path);
      const selectedText = markdownView?.editor.getSelection() ?? '';
      if (selectedText.trim().length > 0) {
        const from = markdownView?.editor.getCursor('from');
        const to = markdownView?.editor.getCursor('to');
        const rangeKey = from && to
          ? `${String(from.line)}:${String(from.ch)}-${String(to.line)}:${String(to.ch)}`
          : `selection-${String(selectedText.length)}`;
        currentSelection = createCurrentSelectionContext({
          content: selectedText,
          rangeKey,
          ...(markdownView?.file?.path ? { sourcePath: markdownView.file.path } : {}),
        });
      }
    } catch (error) {
      onError(contextErrorMessage(error));
    }

    return {
      ...(currentNote === undefined ? {} : { currentNote }),
      ...(currentSelection === undefined ? {} : { currentSelection }),
    };
  }

  private openVaultFilePicker(request: NewTaskContextPickerRequest): void {
    this.dispose();
    this.openTrackedModal(new VaultFileSuggestModal(this.app, request));
  }

  private openVaultFolderPicker(request: NewTaskContextPickerRequest): void {
    this.dispose();
    this.openTrackedModal(new VaultFolderSuggestModal(this.app, request));
  }

  private openTrackedModal(modal: Modal): void {
    this.activeModal = modal;
    modal.setCloseCallback(() => {
      if (this.activeModal === modal) this.activeModal = undefined;
    });
    modal.open();
  }
}

interface ContextSourceModalOptions extends NewTaskContextPickerRequest, PickerSources {
  readonly openVaultFilePicker: () => void;
  readonly openVaultFolderPicker: () => void;
}

class ContextSourceModal extends Modal {
  constructor(
    app: App,
    private readonly options: ContextSourceModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('选择知识库内容');
    this.contentEl.empty();
    this.contentEl.addClass('dsh-context-picker');
    this.contentEl.createEl('p', {
      cls: 'dsh-context-picker__boundary',
      text: '只读取你明确加入的 Markdown 笔记或在编辑器里选中的文本；不会自动读取整个 Vault，也不会写入文件。',
    });
    const choicesEl = this.contentEl.createDiv({ cls: 'dsh-context-picker__choices' });
    this.renderChoice(
      choicesEl,
      '加入当前笔记',
      this.options.currentNote === undefined ? '先打开一篇 Markdown 笔记' : '发送时读取这篇笔记的最新内容',
      this.options.currentNote,
    );
    this.renderChoice(
      choicesEl,
      '加入当前选区',
      this.options.currentSelection?.kind !== 'current-selection'
        ? '先在 Markdown 编辑器中选中文本'
        : `已选中 ${String(Array.from(this.options.currentSelection.content).length)} 个字符；加入后冻结此文本`,
      this.options.currentSelection,
    );
    this.renderPickerChoice(
      choicesEl,
      '选择 Vault Markdown 文件…',
      '按文件名选择一篇笔记',
      this.options.openVaultFilePicker,
    );
    this.renderPickerChoice(
      choicesEl,
      '选择文件夹…',
      '递归加入文件夹当前已有的 Markdown 笔记',
      this.options.openVaultFolderPicker,
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderChoice(
    parentEl: HTMLElement,
    label: string,
    hint: string,
    selection?: NewTaskContextSelection,
  ): void {
    const buttonEl = this.createChoiceButton(parentEl, label, hint);
    buttonEl.disabled = selection === undefined
      || this.options.selected.length >= MAX_NEW_TASK_CONTEXT_ITEMS
      || this.options.selected.some((item) => item.id === selection.id);
    buttonEl.addEventListener('click', () => {
      if (!selection) return;
      this.choose(selection);
    });
  }

  private renderPickerChoice(
    parentEl: HTMLElement,
    label: string,
    hint: string,
    openPicker: () => void,
  ): void {
    const buttonEl = this.createChoiceButton(parentEl, label, hint);
    buttonEl.disabled = this.options.selected.length >= MAX_NEW_TASK_CONTEXT_ITEMS;
    buttonEl.addEventListener('click', () => {
      this.close();
      openPicker();
    });
  }

  private createChoiceButton(parentEl: HTMLElement, label: string, hint: string): HTMLButtonElement {
    const buttonEl = parentEl.createEl('button', {
      cls: 'dsh-context-picker__choice',
      attr: { type: 'button' },
    });
    buttonEl.createSpan({ cls: 'dsh-context-picker__choice-label', text: label });
    buttonEl.createEl('small', { cls: 'dsh-context-picker__choice-hint', text: hint });
    return buttonEl;
  }

  private choose(selection: NewTaskContextSelection): void {
    try {
      this.options.onSelect(selection);
      this.close();
    } catch (error) {
      this.options.onError(contextErrorMessage(error));
    }
  }
}

class VaultFileSuggestModal extends FuzzySuggestModal<TFile> {
  private readonly selectedFileIds: ReadonlySet<string>;

  constructor(
    app: App,
    private readonly request: NewTaskContextPickerRequest,
  ) {
    super(app);
    this.selectedFileIds = new Set(request.selected.map((selection) => selection.id));
    this.setPlaceholder('选择一个 Vault Markdown 文件');
    this.emptyStateText = '没有可加入的 Markdown 文件';
    this.limit = 100;
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles()
      .filter((file) => !this.selectedFileIds.has(`vault-file:${file.path}`))
      .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    try {
      this.request.onSelect(createVaultFileContext('vault-file', file.path));
    } catch (error) {
      this.request.onError(contextErrorMessage(error));
    }
  }
}

class VaultFolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private readonly selectedFileIds: ReadonlySet<string>;

  constructor(
    app: App,
    private readonly request: NewTaskContextPickerRequest,
  ) {
    super(app);
    this.selectedFileIds = new Set(request.selected.map((selection) => selection.id));
    this.setPlaceholder('选择一个 Vault 文件夹');
    this.emptyStateText = '没有包含可加入 Markdown 笔记的文件夹';
    this.limit = 100;
  }

  getItems(): TFolder[] {
    return this.app.vault.getAllLoadedFiles()
      .filter((entry): entry is TFolder => entry instanceof TFolder
        && entry.path.length > 0
        && entry.path !== '/')
      .filter((folder) => this.folderFiles(folder).length > 0)
      .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
  }

  getItemText(folder: TFolder): string {
    return `${folder.path}（${String(this.folderFiles(folder).length)} 篇可加入的 Markdown）`;
  }

  onChooseItem(folder: TFolder): void {
    try {
      const files = this.folderFiles(folder);
      if (files.length === 0) {
        throw new NewTaskContextError('context_empty', '该文件夹没有可加入的 Markdown 笔记。');
      }
      this.assertFolderByteLimits(files);
      const selections = files.map((file) => createVaultFileContext('vault-file', file.path));
      addNewTaskContextSelections(this.request.selected, selections);
      this.request.onSelectMany(Object.freeze(selections));
    } catch (error) {
      this.request.onError(contextErrorMessage(error));
    }
  }

  private folderFiles(folder: TFolder): TFile[] {
    const prefix = `${folder.path}/`;
    return this.app.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith(prefix)
        && !this.selectedFileIds.has(`vault-file:${file.path}`))
      .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
  }

  private assertFolderByteLimits(files: readonly TFile[]): void {
    const oversized = files.find((file) => file.stat.size > MAX_NEW_TASK_CONTEXT_ITEM_BYTES);
    if (oversized) {
      throw new NewTaskContextError(
        'context_item_too_large',
        `${oversized.path} 超过单项 ${String(MAX_NEW_TASK_CONTEXT_ITEM_BYTES / 1024)} KiB 上限。`,
      );
    }
    const selectedBytes = this.request.selected.reduce((total, selection) => {
      if (selection.kind === 'current-selection') {
        return total + new TextEncoder().encode(selection.content).byteLength;
      }
      const selectedFile = this.app.vault.getAbstractFileByPath(selection.path);
      return total + (selectedFile instanceof TFile ? selectedFile.stat.size : 0);
    }, 0);
    const folderBytes = files.reduce((total, file) => total + file.stat.size, 0);
    if (selectedBytes + folderBytes > MAX_NEW_TASK_CONTEXT_TOTAL_BYTES) {
      throw new NewTaskContextError(
        'context_total_too_large',
        `所选文件夹会使上下文合计超过 ${String(MAX_NEW_TASK_CONTEXT_TOTAL_BYTES / 1024)} KiB 上限。`,
      );
    }
  }
}

function contextErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '无法加入所选上下文。';
}
