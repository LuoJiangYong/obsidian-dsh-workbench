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
  private readonly eventListeners = new Map<string, Array<() => void | Promise<void>>>();
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

  addEventListener(type: string, callback: () => void | Promise<void>): void {
    const listeners = this.eventListeners.get(type) ?? [];
    listeners.push(callback);
    this.eventListeners.set(type, listeners);
  }

  async click(): Promise<void> {
    if (this.disabled) return;
    for (const listener of this.eventListeners.get('click') ?? []) await listener();
  }

  async trigger(type: string): Promise<void> {
    for (const listener of this.eventListeners.get(type) ?? []) await listener();
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
  readonly workspace: Workspace;

  constructor() {
    this.workspace = new Workspace(this);
  }
}

export const mockObsidian = {
  commands: [] as CommandRegistration[],
  lastApp: undefined as App | undefined,
  loadedData: null as unknown,
  notices: [] as string[],
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
