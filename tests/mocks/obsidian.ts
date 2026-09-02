export interface ViewState {
  readonly active?: boolean;
  readonly type: string;
}

export interface CommandRegistration {
  readonly callback: () => void;
  readonly id: string;
  readonly name: string;
}

export class MockElement {
  readonly children: MockElement[] = [];
  readonly classes = new Set<string>();
  readonly attributes = new Map<string, string>();
  disabled = false;
  private readonly eventListeners = new Map<
    string,
    Array<(event?: unknown) => void | Promise<void>>
  >();
  icon = '';
  readonly tagName: string;
  text = '';
  value = '';

  constructor(tagName = 'div') {
    this.tagName = tagName;
  }

  addClass(className: string): void {
    this.classes.add(className);
  }

  createDiv(options: ElementOptions = {}): MockElement {
    return this.createChild('div', options);
  }

  createEl(tag: string, options: ElementOptions = {}): MockElement {
    return this.createChild(tag, options);
  }

  createSpan(options: ElementOptions = {}): MockElement {
    return this.createChild('span', options);
  }

  empty(): void {
    this.children.length = 0;
    this.classes.clear();
    this.text = '';
  }

  addEventListener(
    type: string,
    callback: (event?: unknown) => void | Promise<void>,
  ): void {
    const listeners = this.eventListeners.get(type) ?? [];
    listeners.push(callback);
    this.eventListeners.set(type, listeners);
  }

  async click(): Promise<void> {
    if (this.disabled) return;
    for (const listener of this.eventListeners.get('click') ?? []) await listener();
  }

  async trigger(type: string, event?: unknown): Promise<void> {
    for (const listener of this.eventListeners.get(type) ?? []) await listener(event);
  }

  findAllByClass(className: string): MockElement[] {
    return [
      ...(this.classes.has(className) ? [this] : []),
      ...this.children.flatMap((child) => child.findAllByClass(className)),
    ];
  }

  findAllByTag(tagName: string): MockElement[] {
    return [
      ...(this.tagName === tagName ? [this] : []),
      ...this.children.flatMap((child) => child.findAllByTag(tagName)),
    ];
  }

  setAttr(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  setText(value: string): void {
    this.children.length = 0;
    this.text = value;
  }

  allText(): string[] {
    return [this.text, ...this.children.flatMap((child) => child.allText())]
      .filter((value) => value.length > 0);
  }

  private createChild(tagName: string, options: ElementOptions): MockElement {
    const child = new MockElement(tagName);
    if (options.cls) {
      for (const className of options.cls.split(' ')) child.addClass(className);
    }
    if (options.text) child.text = options.text;
    for (const [name, value] of Object.entries(options.attr ?? {})) {
      child.setAttr(name, value);
    }
    this.children.push(child);
    return child;
  }
}

interface ElementOptions {
  readonly attr?: Readonly<Record<string, string>>;
  readonly cls?: string;
  readonly text?: string;
}

export class WorkspaceLeaf {
  readonly app: App;
  view: unknown;
  viewState: ViewState | undefined;

  constructor(app: App) {
    this.app = app;
  }

  async setViewState(viewState: ViewState): Promise<void> {
    this.viewState = viewState;
    const creator = mockObsidian.views.get(viewState.type);
    if (creator && !this.view) this.view = creator(this);
  }
}

export class Workspace {
  activeFile: TFile | null = null;
  activeMarkdownView: MarkdownView | null = null;
  readonly detachedTypes: string[] = [];
  readonly leaves: WorkspaceLeaf[] = [];
  readonly requestedLeafTypes: string[] = [];
  revealedLeaf: WorkspaceLeaf | undefined;
  readonly rightLeaf: WorkspaceLeaf;

  constructor(app: App) {
    this.rightLeaf = new WorkspaceLeaf(app);
    this.leaves.push(this.rightLeaf);
  }

  detachLeavesOfType(type: string): void {
    this.detachedTypes.push(type);
    for (let index = this.leaves.length - 1; index >= 0; index -= 1) {
      if (this.leaves[index]?.viewState?.type === type) this.leaves.splice(index, 1);
    }
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((leaf) => leaf.viewState?.type === type);
  }

  getActiveFile(): TFile | null {
    return this.activeFile;
  }

  getActiveViewOfType<T>(viewType: new (...args: never[]) => T): T | null {
    if (viewType === MarkdownView && this.activeMarkdownView) {
      return this.activeMarkdownView as T;
    }
    return null;
  }

  getLeaf(type: string): WorkspaceLeaf {
    this.requestedLeafTypes.push(type);
    const leaf = new WorkspaceLeaf(this.rightLeaf.app);
    this.leaves.push(leaf);
    return leaf;
  }

  getRightLeaf(_split: boolean): WorkspaceLeaf {
    return this.rightLeaf;
  }

  async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
    this.revealedLeaf = leaf;
  }
}

export class App {
  readonly vault = new Vault();
  readonly workspace: Workspace;

  constructor() {
    this.workspace = new Workspace(this);
  }
}

export class TFile {
  readonly basename: string;
  readonly extension: string;
  readonly stat: { readonly ctime: number; readonly mtime: number; readonly size: number };

  constructor(
    readonly path: string,
    size = 0,
  ) {
    const parts = path.split('/');
    const name = parts[parts.length - 1] ?? path;
    const dot = name.lastIndexOf('.');
    this.basename = dot < 0 ? name : name.slice(0, dot);
    this.extension = dot < 0 ? '' : name.slice(dot + 1);
    this.stat = { ctime: 0, mtime: 0, size };
  }
}

export class TFolder {
  constructor(readonly path: string) {}
}

export class FileSystemAdapter {
  constructor(private readonly basePath: string) {}

  getBasePath(): string {
    return this.basePath;
  }
}

export class Vault {
  adapter: FileSystemAdapter | undefined;
  readonly contents = new Map<string, string>();
  readonly files: TFile[] = [];
  readonly folders: TFolder[] = [];

  addFolder(path: string): TFolder {
    const folder = new TFolder(path);
    this.folders.push(folder);
    return folder;
  }

  addMarkdownFile(path: string, content: string): TFile {
    const file = new TFile(path, new TextEncoder().encode(content).byteLength);
    this.files.push(file);
    this.contents.set(path, content);
    return file;
  }

  cachedRead(file: TFile): Promise<string> {
    const content = this.contents.get(file.path);
    return content === undefined
      ? Promise.reject(new Error('missing'))
      : Promise.resolve(content);
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return this.files.find((file) => file.path === path)
      ?? this.folders.find((folder) => folder.path === path)
      ?? null;
  }

  getAllLoadedFiles(): Array<TFile | TFolder> {
    return [...this.folders, ...this.files];
  }

  getMarkdownFiles(): TFile[] {
    return this.files.filter((file) => file.extension.toLocaleLowerCase() === 'md');
  }
}

export class Editor {
  constructor(
    private readonly selection: string,
    private readonly from = { ch: 0, line: 0 },
    private readonly to = { ch: selection.length, line: 0 },
  ) {}

  getCursor(which: 'from' | 'to'): { readonly ch: number; readonly line: number } {
    return which === 'from' ? this.from : this.to;
  }

  getSelection(): string {
    return this.selection;
  }
}

export class MarkdownView {
  constructor(
    readonly file: TFile | null,
    readonly editor: Editor,
  ) {}
}

export class Modal {
  readonly contentEl = new MockElement();
  private closeCallback: (() => void) | undefined;
  title = '';

  constructor(readonly app: App) {}

  close(): void {
    this.onClose();
    this.closeCallback?.();
  }

  onClose(): void {}

  onOpen(): void {}

  open(): void {
    mockObsidian.openModals.push(this);
    this.onOpen();
  }

  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  setCloseCallback(callback: () => void): this {
    this.closeCallback = callback;
    return this;
  }
}

export class FuzzySuggestModal<T> extends Modal {
  emptyStateText = '';
  limit = 100;
  placeholder = '';

  setPlaceholder(placeholder: string): void {
    this.placeholder = placeholder;
  }

  getItems(): T[] {
    return [];
  }
}

export class MenuItem {
  disabled = false;
  icon = '';
  title = '';
  private clickCallback: (() => void | Promise<void>) | undefined;

  async click(): Promise<void> {
    if (!this.disabled) await this.clickCallback?.();
  }

  onClick(callback: () => void | Promise<void>): this {
    this.clickCallback = callback;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }

  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }

  setTitle(title: string): this {
    this.title = title;
    return this;
  }
}

export class Menu {
  readonly items: Array<MenuItem | 'separator'> = [];

  addItem(callback: (item: MenuItem) => void): this {
    const item = new MenuItem();
    callback(item);
    this.items.push(item);
    return this;
  }

  addSeparator(): this {
    this.items.push('separator');
    return this;
  }

  showAtMouseEvent(_event: MouseEvent): this {
    mockObsidian.openMenus.push(this);
    return this;
  }
}

export const mockObsidian = {
  commands: [] as CommandRegistration[],
  lastApp: undefined as App | undefined,
  loadedData: null as unknown,
  notices: [] as string[],
  openMenus: [] as Menu[],
  openModals: [] as Modal[],
  icons: new Map<string, string>(),
  ribbonIcons: [] as string[],
  ribbonCallbacks: [] as Array<() => void>,
  savedData: [] as unknown[],
  settingTabs: [] as PluginSettingTab[],
  views: new Map<string, (leaf: WorkspaceLeaf) => unknown>(),
};

export function resetMockObsidian(): void {
  mockObsidian.commands.length = 0;
  mockObsidian.lastApp = undefined;
  mockObsidian.loadedData = null;
  mockObsidian.notices.length = 0;
  mockObsidian.openMenus.length = 0;
  mockObsidian.openModals.length = 0;
  mockObsidian.icons.clear();
  mockObsidian.ribbonIcons.length = 0;
  mockObsidian.ribbonCallbacks.length = 0;
  mockObsidian.savedData.length = 0;
  mockObsidian.settingTabs.length = 0;
  mockObsidian.views.clear();
}

export class Plugin {
  readonly app = new App();

  constructor() {
    mockObsidian.lastApp = this.app;
  }

  addCommand(command: CommandRegistration): void {
    mockObsidian.commands.push(command);
  }

  addRibbonIcon(icon: string, _title: string, callback: () => void): MockElement {
    mockObsidian.ribbonIcons.push(icon);
    mockObsidian.ribbonCallbacks.push(callback);
    return new MockElement();
  }

  addSettingTab(settingTab: PluginSettingTab): void {
    mockObsidian.settingTabs.push(settingTab);
  }

  async loadData(): Promise<unknown> {
    return mockObsidian.loadedData;
  }

  registerView(type: string, creator: (leaf: WorkspaceLeaf) => unknown): void {
    mockObsidian.views.set(type, creator);
  }

  async saveData(data: unknown): Promise<void> {
    mockObsidian.savedData.push(data);
  }
}

export class PluginSettingTab {
  readonly app: App;
  readonly plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}

export class ItemView {
  readonly app: App;
  readonly contentEl = new MockElement();
  readonly leaf: WorkspaceLeaf;

  constructor(leaf: WorkspaceLeaf) {
    this.app = leaf.app;
    this.leaf = leaf;
  }
}

export class Notice {
  constructor(message: string) {
    mockObsidian.notices.push(message);
  }
}

export function addIcon(iconId: string, svgContent: string): void {
  mockObsidian.icons.set(iconId, svgContent);
}

export function setIcon(element: MockElement, iconName: string): void {
  element.icon = iconName;
}
