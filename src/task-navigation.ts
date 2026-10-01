import type { ProjectIndexStore, ProjectRecord } from './project-index';
import type { TaskIndexStore } from './task-index';
import type { TaskRecoveryController, TaskRecoveryItem } from './task-recovery';

export interface TaskNavigationSnapshot {
  readonly phase: 'failed' | 'loading' | 'ready';
  readonly projects: readonly ProjectRecord[];
  readonly recent: readonly TaskRecoveryItem[];
  readonly error?: string;
}

export interface TaskNavigationHost {
  getSnapshot(): TaskNavigationSnapshot;
  openTask(taskId: string): Promise<boolean>;
  refresh(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

interface TaskNavigationOptions {
  readonly tasks: TaskIndexStore;
  readonly projects: ProjectIndexStore;
  readonly recovery: TaskRecoveryController;
  readonly isBusy: () => boolean;
  readonly openTask: (task: TaskRecoveryItem) => Promise<boolean>;
}

/** Read-only UI projection. No task/project assignment or navigation database. */
export class TaskNavigationController implements TaskNavigationHost {
  private snapshot: TaskNavigationSnapshot = Object.freeze({
    phase: 'loading', projects: Object.freeze([]), recent: Object.freeze([]),
  });
  private readonly listeners = new Set<() => void>();
  private refreshTail: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: TaskNavigationOptions) {}

  getSnapshot(): TaskNavigationSnapshot { return this.snapshot; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      if (this.options.isBusy()) {
        this.setSnapshot({ ...this.snapshot, error: '当前运行尚未结束，请结束后刷新任务状态。' });
        return;
      }
      this.setSnapshot({ ...this.snapshot, phase: 'loading' });
      await this.options.recovery.refresh();
      await this.loadIndexes();
    });
  }

  /** Index writes update activity without activating a second DSH Host during a turn. */
  reloadIndex(): Promise<void> {
    return this.enqueue(async () => await this.loadIndexes());
  }

  async openTask(taskId: string): Promise<boolean> {
    if (this.disposed || this.options.isBusy() || this.snapshot.phase !== 'ready') return false;
    const task = this.snapshot.recent.find(item => item.taskId === taskId);
    if (!task || task.status !== 'continuable') return false;
    return await this.options.openTask(task);
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const pending = this.refreshTail.then(async () => {
      if (!this.disposed) await operation();
    });
    this.refreshTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private async loadIndexes(): Promise<void> {
    const issues: string[] = [];
    let projects = this.snapshot.projects;
    let recent = this.snapshot.recent;
    let failed = false;
    try {
      const loaded = await this.options.projects.load();
      projects = loaded.document.projects;
      if (loaded.degraded) issues.push('项目索引已回退到上一有效快照。');
    } catch {
      failed = true;
      issues.push('项目索引无法安全读取，已有记录未删除。');
    }
    try {
      const loaded = await this.options.tasks.load();
      const recovery = this.options.recovery.getSnapshot();
      const facts = new Map(recovery.tasks.map(task => [task.taskId, task]));
      // R2 v1 has no explicit project assignment. Paths and native membership do
      // not authorize retrospective ownership; all v1 tasks belong to Recent.
      recent = Object.freeze(loaded.document.tasks.map(task => {
        const fact = facts.get(task.taskId);
        return Object.freeze({
          ...(fact?.sessionId === task.sessionId ? fact : {
            taskId: task.taskId, sessionId: task.sessionId, mode: task.mode,
            workspace: task.workspace, inputSummary: task.inputSummary,
            displayTitle: task.inputSummary, status: 'check_failed' as const,
            reason: { code: 'session_not_checked', message: '请刷新后核对 DSH session 状态。' },
          }),
          createdAt: task.createdAt, updatedAt: task.updatedAt,
        });
      }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)
        || left.taskId.localeCompare(right.taskId)));
      if (loaded.degraded) issues.push('任务索引已回退到上一有效快照。');
      if (recovery.error) issues.push(recovery.error.message);
    } catch {
      failed = true;
      issues.push('任务索引无法安全读取，已有记录未删除。');
      recent = Object.freeze(recent.map(task => Object.freeze({ ...task,
        status: 'check_failed' as const,
        reason: { code: 'task_index_read_failed', message: '最小任务索引无法安全读取。' },
      })));
    }
    if (this.disposed) return;
    this.setSnapshot({ phase: failed ? 'failed' : 'ready', projects, recent,
      ...(issues.length === 0 ? {} : { error: issues.join(' ') }) });
  }

  private setSnapshot(snapshot: TaskNavigationSnapshot): void {
    if (this.disposed) return;
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // UI notification failure must not turn a completed index write into a storage failure.
        continue;
      }
    }
  }
}
