import { realpath } from 'node:fs/promises';

import type {
  BridgeSessionReadItem,
  BridgeSessionReadResult,
} from './bridge-protocol';
import type {
  TaskIndexRecord,
  TaskIndexStore,
} from './task-index';

export type TaskRecoveryStatus =
  | 'check_failed'
  | 'continuable'
  | 'startup_failed'
  | 'unrecoverable';

export interface TaskRecoveryReason {
  readonly code: string;
  readonly message: string;
}

export interface TaskRecoveryItem {
  readonly taskId: string;
  readonly sessionId: string;
  readonly mode: TaskIndexRecord['mode'];
  readonly inputSummary: string;
  readonly displayTitle: string;
  readonly workspace: TaskIndexRecord['workspace'];
  readonly status: TaskRecoveryStatus;
  readonly interrupted?: true;
  readonly reason?: TaskRecoveryReason;
}

export interface TaskRecoverySnapshot {
  readonly phase: 'failed' | 'idle' | 'loading' | 'ready';
  readonly revision: number;
  readonly tasks: readonly TaskRecoveryItem[];
  readonly error?: TaskRecoveryReason;
}

export interface TaskRecoveryBridgeClient {
  readSessions(sessionIds: readonly string[]): Promise<BridgeSessionReadResult>;
}

export interface TaskRecoveryProcess {
  start(): Promise<TaskRecoveryBridgeClient>;
  dispose(): Promise<{ readonly outcome: 'forced' | 'graceful' }>;
  terminateImmediately(): void;
}

export interface TaskRecoveryControllerOptions {
  readonly store: TaskIndexStore;
  readonly stateDirectory: string;
  readonly createProcess: () => TaskRecoveryProcess;
}

export class TaskRecoveryController {
  private snapshot: TaskRecoverySnapshot = Object.freeze({
    phase: 'idle',
    revision: 0,
    tasks: Object.freeze([]),
  });
  private activeProcess: TaskRecoveryProcess | undefined;
  private disposed = false;
  private refreshTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: TaskRecoveryControllerOptions) {}

  getSnapshot(): TaskRecoverySnapshot {
    return this.snapshot;
  }

  refresh(): Promise<void> {
    const refresh = this.refreshTail.then(async () => await this.performRefresh());
    this.refreshTail = refresh.then(() => undefined, () => undefined);
    return refresh;
  }

  disposeImmediately(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activeProcess?.terminateImmediately();
    this.activeProcess = undefined;
  }

  private async performRefresh(): Promise<void> {
    if (this.disposed) return;
    this.snapshot = freezeSnapshot({
      phase: 'loading',
      revision: this.snapshot.revision,
      tasks: this.snapshot.tasks,
    });
    let loaded: Awaited<ReturnType<TaskIndexStore['load']>>;
    try {
      loaded = await this.options.store.load();
    } catch {
      if (this.disposed) return;
      this.snapshot = freezeSnapshot({
        phase: 'failed',
        revision: this.snapshot.revision,
        tasks: this.snapshot.tasks,
        error: { code: 'task_index_read_failed', message: '最小任务索引无法安全读取' },
      });
      return;
    }
    if (this.disposed) return;
    if (loaded.document.tasks.length === 0) {
      this.snapshot = freezeSnapshot({
        phase: 'ready',
        revision: loaded.document.revision,
        tasks: [],
        ...(loaded.degraded ? { error: degradedIndexReason() } : {}),
      });
      return;
    }

    const runtimeProcess = this.options.createProcess();
    this.activeProcess = runtimeProcess;
    let result: BridgeSessionReadResult;
    try {
      const client = await runtimeProcess.start();
      if (this.disposed) return;
      result = await client.readSessions(loaded.document.tasks.map(task => task.sessionId));
      if (this.disposed) return;
      const shutdown = await runtimeProcess.dispose();
      if (shutdown.outcome !== 'graceful') throw new Error('读取 bridge 未正常关闭');
    } catch {
      if (this.disposed) return;
      await disposeAfterFailure(runtimeProcess);
      this.activeProcess = undefined;
      const reason = { code: 'session_read_failed', message: '暂时无法核对 DSH session 状态' };
      this.snapshot = freezeSnapshot({
        phase: 'failed',
        revision: loaded.document.revision,
        tasks: loaded.document.tasks.map(task => projectCheckFailure(task, reason)),
        error: reason,
      });
      return;
    } finally {
      if (this.activeProcess === runtimeProcess) this.activeProcess = undefined;
    }

    const returned = new Map(result.items.map(item => [item.sessionId, item]));
    const tasks: TaskRecoveryItem[] = [];
    for (const task of loaded.document.tasks) {
      const item = returned.get(task.sessionId);
      tasks.push(await projectTask(task, item, this.options.stateDirectory));
    }
    if (this.disposed) return;
    this.snapshot = freezeSnapshot({
      phase: 'ready',
      revision: loaded.document.revision,
      tasks,
      ...(loaded.degraded ? { error: degradedIndexReason() } : {}),
    });
  }
}

async function projectTask(
  task: TaskIndexRecord,
  item: BridgeSessionReadItem | undefined,
  stateDirectory: string,
): Promise<TaskRecoveryItem> {
  const common = {
    taskId: task.taskId,
    sessionId: task.sessionId,
    mode: task.mode,
    inputSummary: task.inputSummary,
    displayTitle: item?.status === 'available' && item.title
      ? item.title
      : task.inputSummary,
    workspace: task.workspace,
  };
  if (!item || item.status === 'missing') {
    if (task.lifecycle.state === 'failed' || task.lifecycle.state === 'starting') {
      return {
        ...common,
        status: 'startup_failed',
        reason: task.lifecycle.reason ?? {
          code: 'runtime_start_incomplete',
          message: '任务未建立可恢复的 DSH session',
        },
      };
    }
    return {
      ...common,
      status: 'unrecoverable',
      reason: { code: 'session_not_found', message: 'DSH 中未找到此任务的 session' },
    };
  }
  if (item.status === 'subagent') {
    return {
      ...common,
      status: 'unrecoverable',
      reason: { code: 'session_subagent', message: 'DSH subagent 不能作为工作台任务继续' },
    };
  }
  if (item.status === 'unreadable') {
    return {
      ...common,
      status: 'unrecoverable',
      reason: { code: 'session_unreadable', message: 'DSH session 无法安全读取' },
    };
  }
  if (item.status !== 'available') {
    return {
      ...common,
      status: 'unrecoverable',
      reason: { code: 'session_unreadable', message: 'DSH session 返回了未知读取状态' },
    };
  }
  if (item.running) {
    return {
      ...common,
      status: 'unrecoverable',
      reason: { code: 'session_running', message: 'DSH session 仍标记为运行中，不能安全接管' },
    };
  }
  const expectedCwd = task.workspace?.path ?? stateDirectory;
  if (!await pathsMatch(item.cwd, expectedCwd)) {
    return {
      ...common,
      status: 'unrecoverable',
      reason: { code: 'session_cwd_conflict', message: 'DSH session 工作目录与任务边界不一致' },
    };
  }
  return {
    ...common,
    status: 'continuable',
    ...(task.lifecycle.state === 'running' ? { interrupted: true as const } : {}),
  };
}

function degradedIndexReason(): TaskRecoveryReason {
  return Object.freeze({
    code: 'task_index_degraded',
    message: '最小任务索引已隔离损坏快照并回退到上一有效版本',
  });
}

function projectCheckFailure(
  task: TaskIndexRecord,
  reason: TaskRecoveryReason,
): TaskRecoveryItem {
  return {
    taskId: task.taskId,
    sessionId: task.sessionId,
    mode: task.mode,
    inputSummary: task.inputSummary,
    displayTitle: task.inputSummary,
    workspace: task.workspace,
    status: 'check_failed',
    reason,
  };
}

async function pathsMatch(left: string, right: string): Promise<boolean> {
  try {
    const [canonicalLeft, canonicalRight] = await Promise.all([realpath(left), realpath(right)]);
    return process.platform === 'win32'
      ? canonicalLeft.toLowerCase() === canonicalRight.toLowerCase()
      : canonicalLeft === canonicalRight;
  } catch {
    return false;
  }
}

async function disposeAfterFailure(runtimeProcess: TaskRecoveryProcess): Promise<void> {
  try {
    await runtimeProcess.dispose();
  } catch {
    runtimeProcess.terminateImmediately();
  }
}

function freezeSnapshot(snapshot: TaskRecoverySnapshot): TaskRecoverySnapshot {
  const tasks = snapshot.tasks.map(task => Object.freeze({
    ...task,
    workspace: task.workspace === null ? null : Object.freeze({ ...task.workspace }),
    ...(task.reason === undefined ? {} : { reason: Object.freeze({ ...task.reason }) }),
  }));
  return Object.freeze({
    ...snapshot,
    tasks: Object.freeze(tasks),
    ...(snapshot.error === undefined ? {} : { error: Object.freeze({ ...snapshot.error }) }),
  });
}
