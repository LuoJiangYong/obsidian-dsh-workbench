import {
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  TFile,
  type App,
} from 'obsidian';

import {
  MAX_NEW_TASK_CONTEXT_ITEM_BYTES,
  MAX_NEW_TASK_CONTEXT_ITEMS,
  NewTaskContextError,
  createCurrentSelectionContext,
  createVaultFileContext,
  type NewTaskContextReader,
  type NewTaskContextSelection,
} from './new-task-context';

export interface NewTaskContextPickerRequest {
  readonly onError: (message: string) => void;
  readonly onSelect: (selection: NewTaskContextSelection) => void;
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
}

class ContextSourceModal extends Modal {
  constructor(
    app: App,
    private readonly options: ContextSourceModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('选择只读上下文');
    this.contentEl.empty();
    this.contentEl.addClass('dsh-context-picker');
    this.contentEl.createEl('p', {
      cls: 'dsh-context-picker__boundary',
      text: '只读取你明确加入的 Markdown 笔记或当前选区；不会读取整个 Vault，也不会写入文件。',
    });
    const choicesEl = this.contentEl.createDiv({ cls: 'dsh-context-picker__choices' });
    this.renderChoice(choicesEl, '加入当前笔记', this.options.currentNote);
    this.renderChoice(choicesEl, '加入当前选区', this.options.currentSelection);
    const fileButtonEl = choicesEl.createEl('button', {
      cls: 'dsh-context-picker__choice',
      text: '选择 Vault Markdown 文件…',
      attr: { type: 'button' },
    });
    fileButtonEl.disabled = this.options.selected.length >= MAX_NEW_TASK_CONTEXT_ITEMS;
    fileButtonEl.addEventListener('click', () => {
      this.close();
      this.options.openVaultFilePicker();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderChoice(
    parentEl: HTMLElement,
    label: string,
    selection?: NewTaskContextSelection,
  ): void {
    const buttonEl = parentEl.createEl('button', {
      cls: 'dsh-context-picker__choice',
      text: label,
      attr: { type: 'button' },
    });
    buttonEl.disabled = selection === undefined
      || this.options.selected.length >= MAX_NEW_TASK_CONTEXT_ITEMS
      || this.options.selected.some((item) => item.id === selection.id);
    buttonEl.addEventListener('click', () => {
      if (!selection) return;
      this.choose(selection);
    });
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

function contextErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '无法加入所选上下文。';
}
