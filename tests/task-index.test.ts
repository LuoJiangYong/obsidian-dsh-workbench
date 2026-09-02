import { mkdir, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createTaskInputSummary,
  TaskIndexError,
  TaskIndexStore,
} from '../src/task-index';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('Vault 外最小任务索引', () => {
  it('以版本化双槽快照跨实例读回任务身份、摘要和启动状态', async () => {
    const stateDirectory = await temporaryStateDirectory();
    const store = createStore(stateDirectory);
    const longInput = '甲'.repeat(60);

    await store.createTask({
      inputSummary: createTaskInputSummary(longInput),
      mode: 'chat',
      sessionId: 'session-one',
      taskId: 'task-one',
      workspace: null,
    });
    await store.updateTask('task-one', { state: 'ready' });

    const reloaded = await createStore(stateDirectory).load();
    expect(reloaded.degraded).toBe(false);
    expect(reloaded.document).toMatchObject({
      revision: 2,
      version: 1,
      tasks: [{
        inputSummary: `${'甲'.repeat(48)}…`,
        lifecycle: { state: 'ready' },
        mode: 'chat',
        sessionId: 'session-one',
        taskId: 'task-one',
        workspace: null,
      }],
    });
    expect(Object.isFrozen(reloaded.document)).toBe(true);
    expect(Object.isFrozen(reloaded.document.tasks)).toBe(true);
  });

  it('拒绝重复 taskId、重复 sessionId 和不在 Vault 外的状态目录', async () => {
    const stateDirectory = await temporaryStateDirectory();
    const vaultPath = path.join(path.dirname(stateDirectory), 'vault');
    await expect(new TaskIndexStore({ stateDirectory: vaultPath, vaultPath }).load())
      .rejects.toMatchObject({ code: 'task_index_state_in_vault' });
    const vaultState = path.join(vaultPath, 'linked-state-target');
    const linkedState = path.join(path.dirname(stateDirectory), 'linked-state');
    await mkdir(vaultState, { recursive: true });
    await symlink(vaultState, linkedState, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new TaskIndexStore({ stateDirectory: linkedState, vaultPath }).load())
      .rejects.toMatchObject({ code: 'task_index_state_in_vault' });

    const store = createStore(stateDirectory);
    await store.createTask(taskInput('task-one', 'session-one'));
    await expect(store.createTask(taskInput('task-one', 'session-one')))
      .resolves.toMatchObject({ revision: 1 });
    await expect(store.createTask(taskInput('task-one', 'session-two')))
      .rejects.toMatchObject({ code: 'task_index_task_conflict' });
    await expect(store.createTask(taskInput('task-two', 'session-one')))
      .rejects.toMatchObject({ code: 'task_index_session_conflict' });
  });

  it('最新槽损坏时只读回退到上一个有效版本并保留损坏证据', async () => {
    const stateDirectory = await temporaryStateDirectory();
    const store = createStore(stateDirectory);
    await store.createTask(taskInput('task-one', 'session-one'));
    await store.updateTask('task-one', { state: 'ready' });

    const indexDirectory = path.join(stateDirectory, 'task-index');
    await writeFile(path.join(indexDirectory, 'index-0.json'), '{broken', 'utf8');
    const loaded = await createStore(stateDirectory).load();
    expect(loaded.degraded).toBe(true);
    expect(loaded.document.revision).toBe(1);
    expect(loaded.isolatedFiles).toEqual(['index-0.json']);

    await createStore(stateDirectory).updateTask('task-one', {
      reason: { code: 'connection_failed', message: '连接已中断' },
      state: 'interrupted',
    });
    const files = await readdir(indexDirectory);
    expect(files.some(file => file.startsWith('index-0.json.corrupt.'))).toBe(true);
    expect((await createStore(stateDirectory).load()).document.revision).toBe(2);
  });

  it('没有任何有效槽时 fail closed，不静默创建空索引', async () => {
    const stateDirectory = await temporaryStateDirectory();
    const indexDirectory = path.join(stateDirectory, 'task-index');
    await writeFile(path.join(indexDirectory, 'index-0.json'), '{broken', 'utf8');
    await writeFile(path.join(indexDirectory, 'index-1.json'), JSON.stringify({
      revision: 2,
      tasks: [],
      version: 99,
    }), 'utf8');

    await expect(createStore(stateDirectory).load())
      .rejects.toMatchObject({ code: 'task_index_corrupt' });
    await expect(createStore(stateDirectory).createTask(taskInput('task-one', 'session-one')))
      .rejects.toMatchObject({ code: 'task_index_corrupt' });
  });

  it('活动写锁导致显式并发失败，死亡进程锁被隔离后可恢复', async () => {
    const stateDirectory = await temporaryStateDirectory();
    const indexDirectory = path.join(stateDirectory, 'task-index');
    const lockPath = path.join(indexDirectory, 'write.lock');
    const liveLock = await open(lockPath, 'wx', 0o600);
    await liveLock.writeFile(JSON.stringify({
      createdAt: '2026-09-01T00:00:00.000Z',
      pid: 123,
      token: 'live-lock',
      version: 1,
    }), 'utf8');
    await liveLock.close();

    const liveStore = createStore(stateDirectory, pid => pid === 123);
    await expect(liveStore.createTask(taskInput('task-one', 'session-one')))
      .rejects.toMatchObject({ code: 'task_index_locked' });

    const recovered = createStore(stateDirectory, () => false);
    await recovered.createTask(taskInput('task-one', 'session-one'));
    const files = await readdir(indexDirectory);
    expect(files.some(file => file.startsWith('write.lock.stale.'))).toBe(true);
    expect(files.some(file => file.endsWith('.tmp'))).toBe(false);
    expect(JSON.parse(await readFile(path.join(indexDirectory, 'index-1.json'), 'utf8')))
      .toMatchObject({ revision: 1, version: 1 });
  });

  it('拒绝篡改、越界摘要和带路径的失败消息', async () => {
    const stateDirectory = await temporaryStateDirectory();
    const store = createStore(stateDirectory);
    await store.createTask(taskInput('task-one', 'session-one'));
    await expect(store.updateTask('task-one', {
      reason: { code: 'runtime_start_failed', message: 'C:\\private\\secret.txt' },
      state: 'failed',
    })).rejects.toBeInstanceOf(TaskIndexError);
  });
});

function createStore(
  stateDirectory: string,
  isProcessAlive: (pid: number) => boolean = () => false,
): TaskIndexStore {
  return new TaskIndexStore({
    isProcessAlive,
    now: () => new Date('2026-09-01T00:00:00.000Z'),
    randomId: () => 'fixed-token',
    stateDirectory,
    vaultPath: path.join(path.dirname(stateDirectory), 'vault'),
  });
}

function taskInput(taskId: string, sessionId: string) {
  return {
    inputSummary: '总结资料',
    mode: 'chat' as const,
    sessionId,
    taskId,
    workspace: null,
  };
}

async function temporaryStateDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-task-index-'));
  temporaryRoots.push(root);
  const stateDirectory = path.join(root, 'state');
  await rm(stateDirectory, { force: true, recursive: true });
  await Promise.all([
    mkdir(stateDirectory, { recursive: true }),
    mkdir(path.join(root, 'vault'), { recursive: true }),
    mkdir(path.join(stateDirectory, 'task-index'), { recursive: true }),
  ]);
  return stateDirectory;
}
