import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { BridgeSessionReadResult } from '../src/bridge-protocol';
import { TaskIndexStore } from '../src/task-index';
import {
  TaskRecoveryController,
  type TaskRecoveryBridgeClient,
  type TaskRecoveryProcess,
} from '../src/task-recovery';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('R2 跨重启任务恢复投影', () => {
  it('只查询索引引用，重建可继续、不可恢复、启动失败和已中断状态', async () => {
    const harness = await createHarness();
    await harness.store.createTask(task('task-ready', 'session-ready', 'chat', null));
    await harness.store.updateTask('task-ready', { state: 'ready' });
    await harness.store.createTask(task('task-running', 'session-running', 'task', harness.workspace));
    await harness.store.updateTask('task-running', { state: 'running' });
    await harness.store.createTask(task('task-missing', 'session-missing', 'chat', null));
    await harness.store.updateTask('task-missing', { state: 'ready' });
    await harness.store.createTask(task('task-start-failed', 'session-start-failed', 'chat', null));
    await harness.store.updateTask('task-start-failed', {
      reason: { code: 'runtime_start_failed', message: 'DSH 启动失败' },
      state: 'failed',
    });

    const process = new FakeRecoveryProcess(new FakeRecoveryClient({ items: [
      available('session-ready', harness.stateDirectory, 'DSH 标题'),
      available('session-running', harness.workspace.path),
      { sessionId: 'session-missing', status: 'missing' },
      { sessionId: 'session-start-failed', status: 'missing' },
    ] }));
    const controller = new TaskRecoveryController({
      createProcess: () => process,
      stateDirectory: harness.stateDirectory,
      store: new TaskIndexStore(harness.storeOptions),
    });

    await controller.refresh();
    expect(process.client.requestedSessionIds).toEqual([
      'session-ready',
      'session-running',
      'session-missing',
      'session-start-failed',
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'ready',
      revision: 8,
      tasks: [
        { displayTitle: 'DSH 标题', status: 'continuable', taskId: 'task-ready' },
        { interrupted: true, status: 'continuable', taskId: 'task-running' },
        { reason: { code: 'session_not_found' }, status: 'unrecoverable', taskId: 'task-missing' },
        { reason: { code: 'runtime_start_failed' }, status: 'startup_failed', taskId: 'task-start-failed' },
      ],
    });
    expect(process.disposeCount).toBe(1);
  });

  it('拒绝 cwd 冲突和 subagent，不自动接管未索引 session', async () => {
    const harness = await createHarness();
    await harness.store.createTask(task('task-cwd', 'session-cwd', 'task', harness.workspace));
    await harness.store.updateTask('task-cwd', { state: 'ready' });
    await harness.store.createTask(task('task-subagent', 'session-subagent', 'chat', null));
    await harness.store.updateTask('task-subagent', { state: 'ready' });
    await harness.store.createTask(task('task-running-native', 'session-running-native', 'chat', null));
    await harness.store.updateTask('task-running-native', { state: 'ready' });
    const client = new FakeRecoveryClient({ items: [
      available('session-cwd', path.join(harness.stateDirectory, 'wrong')),
      { sessionId: 'session-subagent', status: 'subagent' },
      available('session-running-native', harness.stateDirectory, undefined, true),
      available('unindexed-session', harness.stateDirectory),
    ] });
    const controller = new TaskRecoveryController({
      createProcess: () => new FakeRecoveryProcess(client),
      stateDirectory: harness.stateDirectory,
      store: new TaskIndexStore(harness.storeOptions),
    });

    await controller.refresh();
    expect(controller.getSnapshot().tasks.map(item => ({
      code: item.reason?.code,
      status: item.status,
    }))).toEqual([
      { code: 'session_cwd_conflict', status: 'unrecoverable' },
      { code: 'session_subagent', status: 'unrecoverable' },
      { code: 'session_running', status: 'unrecoverable' },
    ]);
    expect(controller.getSnapshot().tasks.every(item => typeof item.reason?.message === 'string')).toBe(true);
    expect(controller.getSnapshot().tasks.some(item => item.sessionId === 'unindexed-session')).toBe(false);
  });

  it('DSH 读取失败时保留索引并显示检查失败，不伪造不可恢复', async () => {
    const harness = await createHarness();
    await harness.store.createTask(task('task-one', 'session-one', 'chat', null));
    await harness.store.updateTask('task-one', { state: 'ready' });
    const client = new FakeRecoveryClient({ items: [] });
    client.failure = new Error('DSH 不可用');
    const controller = new TaskRecoveryController({
      createProcess: () => new FakeRecoveryProcess(client),
      stateDirectory: harness.stateDirectory,
      store: new TaskIndexStore(harness.storeOptions),
    });

    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      error: { code: 'session_read_failed' },
      phase: 'failed',
      tasks: [{ status: 'check_failed', taskId: 'task-one' }],
    });
    expect((await new TaskIndexStore(harness.storeOptions).load()).document.tasks).toHaveLength(1);
  });

  it('单槽损坏回退时保留可读任务并显式标记索引降级', async () => {
    const harness = await createHarness();
    await harness.store.createTask(task('task-one', 'session-one', 'chat', null));
    await harness.store.updateTask('task-one', { state: 'ready' });
    await writeFile(path.join(harness.stateDirectory, 'task-index', 'index-0.json'), '{broken', 'utf8');
    const controller = new TaskRecoveryController({
      createProcess: () => new FakeRecoveryProcess(new FakeRecoveryClient({ items: [
        available('session-one', harness.stateDirectory),
      ] })),
      stateDirectory: harness.stateDirectory,
      store: new TaskIndexStore(harness.storeOptions),
    });

    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      error: { code: 'task_index_degraded' },
      phase: 'ready',
      tasks: [{ status: 'continuable', taskId: 'task-one' }],
    });
  });

  it('空索引不启动 DSH，控制器释放时同步终止在途进程', async () => {
    const harness = await createHarness();
    const process = new FakeRecoveryProcess(new FakeRecoveryClient({ items: [] }), true);
    const controller = new TaskRecoveryController({
      createProcess: () => process,
      stateDirectory: harness.stateDirectory,
      store: new TaskIndexStore(harness.storeOptions),
    });
    await controller.refresh();
    expect(process.startCount).toBe(0);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', tasks: [] });

    await harness.store.createTask(task('task-one', 'session-one', 'chat', null));
    const refresh = controller.refresh();
    await process.started;
    controller.disposeImmediately();
    await refresh;
    expect(process.terminateImmediatelyCount).toBe(1);
  });
});

class FakeRecoveryClient implements TaskRecoveryBridgeClient {
  failure: Error | undefined;
  readonly requestedSessionIds: string[] = [];

  constructor(private readonly result: BridgeSessionReadResult) {}

  async readSessions(sessionIds: readonly string[]): Promise<BridgeSessionReadResult> {
    this.requestedSessionIds.push(...sessionIds);
    if (this.failure) throw this.failure;
    return this.result;
  }
}

class FakeRecoveryProcess implements TaskRecoveryProcess {
  disposeCount = 0;
  startCount = 0;
  terminateImmediatelyCount = 0;

  readonly started: Promise<void>;
  private readonly pauseStart: boolean;
  private releaseStart: () => void = () => undefined;
  private signalStarted: () => void = () => undefined;

  constructor(readonly client: FakeRecoveryClient, pauseStart = false) {
    this.pauseStart = pauseStart;
    this.started = new Promise(resolve => { this.signalStarted = resolve; });
  }

  async dispose() {
    this.disposeCount += 1;
    return { outcome: 'graceful' as const };
  }

  async start(): Promise<TaskRecoveryBridgeClient> {
    this.startCount += 1;
    this.signalStarted();
    if (this.pauseStart) {
      await new Promise<void>(resolve => { this.releaseStart = resolve; });
    }
    return this.client;
  }

  terminateImmediately(): void {
    this.terminateImmediatelyCount += 1;
    this.releaseStart();
  }
}

function available(sessionId: string, cwd: string, title?: string, running = false) {
  return {
    blank: false,
    cwd,
    running,
    sessionId,
    status: 'available' as const,
    ...(title === undefined ? {} : { title }),
  };
}

function task(
  taskId: string,
  sessionId: string,
  mode: 'chat' | 'task',
  workspace: { readonly name: string; readonly path: string } | null,
) {
  return { inputSummary: taskId, mode, sessionId, taskId, workspace };
}

async function createHarness() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-task-recovery-'));
  temporaryRoots.push(root);
  const stateDirectory = path.join(root, 'state');
  const vaultPath = path.join(root, 'vault');
  const workspacePath = path.join(root, 'workspace');
  await Promise.all([
    mkdir(stateDirectory, { recursive: true }),
    mkdir(vaultPath, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
  ]);
  const storeOptions = {
    isProcessAlive: () => false,
    now: () => new Date('2026-09-01T00:00:00.000Z'),
    randomId: () => 'fixed-token',
    stateDirectory,
    vaultPath,
  };
  return {
    stateDirectory,
    store: new TaskIndexStore(storeOptions),
    storeOptions,
    workspace: { name: 'workspace', path: workspacePath },
  };
}
