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
  text = '';

  addClass(className: string): void {
    this.classes.add(className);
  }

  createDiv(options: { cls?: string; text?: string } = {}): MockElement {
    return this.createChild(options);
  }

  createEl(_tag: string, options: { cls?: string; text?: string } = {}): MockElement {
    return this.createChild(options);
  }

  createSpan(options: { cls?: string; text?: string } = {}): MockElement {
    return this.createChild(options);
  }

  empty(): void {
    this.children.length = 0;
    this.classes.clear();
    this.text = '';
  }

  allText(): string[] {
    return [this.text, ...this.children.flatMap((child) => child.allText())]
      .filter((value) => value.length > 0);
  }

  private createChild(options: { cls?: string; text?: string }): MockElement {
    const child = new MockElement();
    if (options.cls) child.addClass(options.cls);
    if (options.text) child.text = options.text;
    this.children.push(child);
    return child;
  }
}

export class WorkspaceLeaf {
  readonly app: App;
  viewState: ViewState | undefined;

  constructor(app: App) {
    this.app = app;
  }

  async setViewState(viewState: ViewState): Promise<void> {
    this.viewState = viewState;
  }
}

export class Workspace {
  readonly detachedTypes: string[] = [];
  readonly leaves: WorkspaceLeaf[] = [];
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
  notices: [] as string[],
  ribbonCallbacks: [] as Array<() => void>,
  views: new Map<string, (leaf: WorkspaceLeaf) => unknown>(),
};

export function resetMockObsidian(): void {
  mockObsidian.commands.length = 0;
  mockObsidian.lastApp = undefined;
  mockObsidian.notices.length = 0;
  mockObsidian.ribbonCallbacks.length = 0;
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

  addRibbonIcon(_icon: string, _title: string, callback: () => void): MockElement {
    mockObsidian.ribbonCallbacks.push(callback);
    return new MockElement();
  }

  registerView(type: string, creator: (leaf: WorkspaceLeaf) => unknown): void {
    mockObsidian.views.set(type, creator);
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
