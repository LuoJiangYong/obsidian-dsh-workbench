import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectIndexStore } from '../src/project-index';
import { TaskIndexStore } from '../src/task-index';
import { TaskRecoveryController } from '../src/task-recovery';
import { TaskNavigationController } from '../src/task-navigation';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('N1 项目与最近的只读导航投影', () => {
  it('保留项目索引顺序，不按同目录猜测归属；最近按实际活动倒序且每个任务只出现一次', async () => {
    const h = await harness();
    await h.projects.createProject({ projectId: 'project-one', displayName: '真实项目',
      workspaces: [{ workspaceId: 'workspace-one', canonicalPath: h.workspace }] });
    await h.tasks.createTask({ taskId: 'task-one', sessionId: 'session-one', mode: 'task',
      inputSummary: '较早任务', workspace: { name: '外部工作区', path: h.workspace } });
    h.setTime('2026-10-01T01:00:00.000Z');
    await h.tasks.createTask({ taskId: 'task-two', sessionId: 'session-two', mode: 'chat',
      inputSummary: '较新任务', workspace: null });
    await h.navigation.refresh();
    expect(h.navigation.getSnapshot().projects.map(p => p.projectId)).toEqual(['project-one']);
    expect(h.navigation.getSnapshot().recent.map(t => t.taskId)).toEqual(['task-two', 'task-one']);
    expect(h.navigation.getSnapshot().recent.map(t => t.displayTitle)).toEqual(['DSH 原生标题', 'DSH 原生标题']);
    expect(h.open).not.toHaveBeenCalled();
    h.setTime('2026-10-01T02:00:00.000Z');
    await h.tasks.updateTask('task-one', { state: 'ready' });
    await h.navigation.reloadIndex();
    expect(h.navigation.getSnapshot().recent.map(t => t.taskId)).toEqual(['task-one', 'task-two']);
    expect(h.reads()).toBe(1);
    await expect(h.navigation.openTask('task-one')).resolves.toBe(true);
    expect(h.open).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-one', sessionId: 'session-one' }));
  });

  it('冷启动缺失任务保留摘要和原因，检查失败与不可恢复分开，不开放替代 session', async () => {
    const h = await harness();
    await h.tasks.createTask({ taskId: 'task-missing', sessionId: 'missing', mode: 'chat',
      inputSummary: '原始摘要', workspace: null });
    await h.tasks.updateTask('task-missing', { state: 'ready' });
    await h.navigation.refresh();
    expect(h.navigation.getSnapshot().recent).toMatchObject([
      { taskId: 'task-missing', inputSummary: '原始摘要', status: 'unrecoverable', reason: { code: 'session_not_found' } },
    ]);
    await expect(h.navigation.openTask('task-missing')).resolves.toBe(false);
    await expect(h.navigation.openTask('unknown')).resolves.toBe(false);
    expect(h.open).not.toHaveBeenCalled();
    expect((await h.tasks.load()).document.tasks).toHaveLength(1);
  });

  it('刷新不写索引，不在运行中检查或切换，释放后不再通知关闭的视图', async () => {
    const h = await harness();
    const listener = vi.fn();
    const detach = h.navigation.subscribe(listener);
    await h.navigation.refresh();
    expect(listener).toHaveBeenCalled();
    expect((await h.tasks.load()).document.revision).toBe(0);
    h.setBusy(true);
    await h.navigation.refresh();
    expect(h.navigation.getSnapshot().error).toContain('运行');
    await expect(h.navigation.openTask('unknown')).resolves.toBe(false);
    expect(h.open).not.toHaveBeenCalled();
    detach();
    listener.mockClear();
    h.setBusy(false);
    await h.navigation.reloadIndex();
    expect(listener).not.toHaveBeenCalled();
  });

  it('视图订阅异常不覆盖已完成的索引写入或阻止其他视图通知', async () => {
    const h = await harness();
    h.navigation.subscribe(() => { throw new Error('view detached'); });
    const listener = vi.fn();
    h.navigation.subscribe(listener);
    await expect(h.navigation.refresh()).resolves.toBeUndefined();
    expect(h.navigation.getSnapshot().phase).toBe('ready');
    expect(listener).toHaveBeenCalled();
  });
});

async function harness() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-n1-navigation-'));
  roots.push(root);
  const stateDirectory = path.join(root, 'state');
  const vaultPath = path.join(root, 'vault');
  const workspace = path.join(root, 'workspace');
  await Promise.all([stateDirectory, vaultPath, workspace].map(p => mkdir(p)));
  let time = '2026-10-01T00:00:00.000Z';
  const tasks = new TaskIndexStore({ stateDirectory, vaultPath, now: () => new Date(time) });
  const projects = new ProjectIndexStore({ stateDirectory, vaultPath });
  let reads = 0;
  let busy = false;
  const recovery = new TaskRecoveryController({ store: tasks, stateDirectory, createProcess: () => ({
    start: async () => ({ readSessions: async (ids) => {
      reads += 1;
      return { items: ids.map(sessionId => sessionId === 'missing'
        ? { sessionId, status: 'missing' as const }
        : { sessionId, status: 'available' as const, title: 'DSH 原生标题', blank: false,
          running: false, cwd: sessionId === 'session-one' ? workspace : stateDirectory }) };
    } }),
    dispose: async () => ({ outcome: 'graceful' as const }),
    terminateImmediately: () => undefined,
  }) });
  const open = vi.fn(async () => true);
  const navigation = new TaskNavigationController({ tasks, projects, recovery,
    isBusy: () => busy, openTask: open });
  return { tasks, projects, navigation, workspace, open, reads: () => reads,
    setBusy: (value: boolean) => { busy = value; },
    setTime: (value: string) => { time = value; } };
}
