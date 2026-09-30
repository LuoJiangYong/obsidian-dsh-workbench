import { mkdir, mkdtemp, open, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectIndexStore } from '../src/project-index';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('Vault 外项目数据模型与持久化', () => {
  it('以版本化双槽快照保存 DSH Workspace 引用、置顶和用户顺序，并可跨实例读回', async () => {
    const root = await temporaryRoot();
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    const third = path.join(root, 'third');
    await Promise.all([mkdir(first), mkdir(second), mkdir(third)]);
    await writeFile(path.join(first, 'source.txt'), '源内容保持不变', 'utf8');
    const store = createStore(root);

    await store.createProject({
      displayName: '项目一',
      pinned: true,
      projectId: 'project-one',
      workspaces: [
        { workspaceId: 'dsh-workspace-one', canonicalPath: first },
        { workspaceId: 'dsh-workspace-three', canonicalPath: third },
      ],
    });
    await store.createProject({
      displayName: '项目二',
      projectId: 'project-two',
      workspaces: [{ workspaceId: 'dsh-workspace-two', canonicalPath: second }],
    });
    await store.updateProject('project-two', { pinned: true });
    const saved = await store.reorderProjects(['project-two', 'project-one']);

    expect(saved).toMatchObject({
      revision: 4,
      version: 1,
      projects: [
        { projectId: 'project-two', displayName: '项目二', pinned: true },
        { projectId: 'project-one', displayName: '项目一', pinned: true },
      ],
    });
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Object.isFrozen(saved.projects)).toBe(true);
    expect(Object.isFrozen(saved.projects[0]?.workspaces)).toBe(true);

    const reloaded = await createStore(root).load();
    expect(reloaded.degraded).toBe(false);
    expect(reloaded.document).toEqual(saved);
    expect(await readFile(path.join(first, 'source.txt'), 'utf8')).toBe('源内容保持不变');
    expect(await readdir(path.join(root, 'vault'))).toEqual([]);
  });

  it('拒绝名称、DSH Workspace 身份和路径包含关系冲突，并保留失效源文件夹记录', async () => {
    const root = await temporaryRoot();
    const first = path.join(root, 'first');
    const nested = path.join(first, 'nested');
    const second = path.join(root, 'second');
    await mkdir(nested, { recursive: true });
    await mkdir(second);
    const store = createStore(root);
    await store.createProject({
      displayName: '项目一',
      projectId: 'project-one',
      workspaces: [{ workspaceId: 'dsh-workspace-one', canonicalPath: first }],
    });

    await expect(store.createProject({
      displayName: '项目一',
      projectId: 'project-two',
      workspaces: [{ workspaceId: 'dsh-workspace-two', canonicalPath: second }],
    })).rejects.toMatchObject({ code: 'project_index_name_conflict' });
    await expect(store.createProject({
      displayName: '项目二',
      projectId: 'project-two',
      workspaces: [{ workspaceId: 'dsh-workspace-one', canonicalPath: second }],
    })).rejects.toMatchObject({ code: 'project_index_source_conflict' });
    await expect(store.createProject({
      displayName: '项目二',
      projectId: 'project-two',
      workspaces: [{ workspaceId: 'dsh-workspace-nested', canonicalPath: nested }],
    })).rejects.toMatchObject({ code: 'project_index_source_conflict' });

    await rm(first, { recursive: true });
    const loaded = await createStore(root).load();
    expect(loaded.document.projects[0]?.workspaces[0]?.canonicalPath).toBe(first);
  });

  it('拒绝无效、非 canonical 或不存在的源文件夹，且不把失败写入索引', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'source');
    const link = path.join(root, 'source-link');
    await mkdir(source);
    await symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir');
    const store = createStore(root);

    await expect(store.createProject({
      displayName: '缺失路径',
      projectId: 'missing',
      workspaces: [{ workspaceId: 'dsh-missing', canonicalPath: path.join(root, 'missing') }],
    })).rejects.toMatchObject({ code: 'project_index_source_invalid' });
    await expect(store.createProject({
      displayName: '符号链接',
      projectId: 'link',
      workspaces: [{ workspaceId: 'dsh-link', canonicalPath: link }],
    })).rejects.toMatchObject({ code: 'project_index_source_invalid' });
    await expect(store.createProject({
      displayName: '相对路径',
      projectId: 'relative',
      workspaces: [{ workspaceId: 'dsh-relative', canonicalPath: 'source' }],
    })).rejects.toMatchObject({ code: 'project_index_source_invalid' });

    expect((await store.load()).document.projects).toHaveLength(0);
  });

  it('最新槽损坏时隔离证据并回退上一有效版本，所有槽损坏时 fail closed', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'source');
    await mkdir(source);
    const store = createStore(root);
    await store.createProject({
      displayName: '项目一',
      projectId: 'project-one',
      workspaces: [{ workspaceId: 'dsh-workspace-one', canonicalPath: source }],
    });
    await store.updateProject('project-one', { pinned: true });

    const indexDirectory = path.join(root, 'state', 'project-index');
    await writeFile(path.join(indexDirectory, 'index-0.json'), '{broken', 'utf8');
    const degraded = await createStore(root).load();
    expect(degraded.degraded).toBe(true);
    expect(degraded.document.revision).toBe(1);
    expect(degraded.isolatedFiles).toEqual(['index-0.json']);

    await createStore(root).updateProject('project-one', { pinned: false });
    const files = await readdir(indexDirectory);
    expect(files.some(file => file.startsWith('index-0.json.corrupt.'))).toBe(true);
    expect((await createStore(root).load()).document.revision).toBe(2);

    await writeFile(path.join(indexDirectory, 'index-0.json'), '{broken-again', 'utf8');
    await writeFile(path.join(indexDirectory, 'index-1.json'), JSON.stringify({
      projects: [],
      revision: 9,
      version: 1,
      extra: 'invalid schema',
    }), 'utf8');
    await expect(createStore(root).load())
      .rejects.toMatchObject({ code: 'project_index_corrupt' });
  });

  it('活动写锁显式失败，死亡进程锁被隔离后可恢复', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'source');
    await mkdir(source);
    const indexDirectory = path.join(root, 'state', 'project-index');
    await mkdir(indexDirectory, { recursive: true });
    const lock = await open(path.join(indexDirectory, 'write.lock'), 'wx', 0o600);
    await lock.writeFile(JSON.stringify({
      createdAt: '2026-09-01T00:00:00.000Z',
      pid: 123,
      token: 'live-lock',
      version: 1,
    }), 'utf8');
    await lock.close();

    await expect(createStore(root, pid => pid === 123).createProject({
      displayName: '项目一',
      projectId: 'project-one',
      workspaces: [{ workspaceId: 'dsh-workspace-one', canonicalPath: source }],
    })).rejects.toMatchObject({ code: 'project_index_locked' });
    await createStore(root, () => false).createProject({
      displayName: '项目一',
      projectId: 'project-one',
      workspaces: [{ workspaceId: 'dsh-workspace-one', canonicalPath: source }],
    });
    expect((await readdir(indexDirectory)).some(file => file.startsWith('write.lock.stale.'))).toBe(true);
  });

  it('拒绝 Vault 内或通过 junction 越界的状态目录', async () => {
    const root = await temporaryRoot();
    const vault = path.join(root, 'vault');
    await expect(new ProjectIndexStore({
      stateDirectory: vault,
      vaultPath: vault,
    }).load()).rejects.toMatchObject({ code: 'project_index_state_in_vault' });
    const linkedState = path.join(root, 'linked-state');
    await symlink(vault, linkedState, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new ProjectIndexStore({
      stateDirectory: linkedState,
      vaultPath: vault,
    }).load()).rejects.toMatchObject({ code: 'project_index_state_in_vault' });
    const state = path.join(root, 'state');
    await mkdir(state);
    await symlink(vault, path.join(state, 'project-index'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(createStore(root).load()).rejects.toMatchObject({ code: 'project_index_state_in_vault' });
    expect(await readdir(vault)).toEqual([]);
  });

  it('拒绝 Vault 或状态目录作为项目源，且不改写其内容', async () => {
    const root = await temporaryRoot();
    const state = path.join(root, 'state');
    await mkdir(state);
    const store = createStore(root);
    for (const source of [path.join(root, 'vault'), state, root]) {
      await expect(store.createProject({
        projectId: 'invalid-source', displayName: '无效源',
        workspaces: [{ workspaceId: 'dsh-invalid-source', canonicalPath: await realpath(source) }],
      })).rejects.toMatchObject({ code: 'project_index_source_invalid' });
    }
    expect((await store.load()).document.projects).toEqual([]);
    expect(await readdir(path.join(root, 'vault'))).toEqual([]);
  });

  it('不接管尚未写完整的锁，并拒绝未知版本覆盖旧快照', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'source');
    await mkdir(source);
    const input = { projectId: 'one', displayName: '项目', workspaces: [
      { workspaceId: 'dsh-one', canonicalPath: source },
    ] };
    const store = createStore(root);
    await store.createProject(input);
    const index = path.join(root, 'state', 'project-index');
    await writeFile(path.join(index, 'write.lock'), '', 'utf8');
    await expect(store.updateProject('one', { pinned: true }))
      .rejects.toMatchObject({ code: 'project_index_locked' });
    await rm(path.join(index, 'write.lock'));
    const future = JSON.stringify({ version: 99, revision: 2, projects: [], futureField: true });
    await writeFile(path.join(index, 'index-0.json'), future, 'utf8');
    await expect(store.load()).rejects.toMatchObject({ code: 'project_index_version_unsupported' });
    await expect(store.updateProject('one', { pinned: true }))
      .rejects.toMatchObject({ code: 'project_index_version_unsupported' });
    expect(await readFile(path.join(index, 'index-0.json'), 'utf8')).toBe(future);
  });

  it('并发实例不会丢失成功写入，残留恢复 guard 明确阻止写入', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'source');
    const second = path.join(root, 'second');
    await Promise.all([mkdir(source), mkdir(second)]);
    const stores = [createStore(root, () => true), createStore(root, () => true)];
    const outcomes = await Promise.allSettled(stores.map(async (store, index) => await store.createProject({
      projectId: `project-${String(index)}`, displayName: `项目 ${String(index)}`,
      workspaces: [{ workspaceId: `workspace-${String(index)}`, canonicalPath: index === 0 ? source : second }],
    })));
    const succeeded = outcomes.filter(outcome => outcome.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThan(0);
    expect((await createStore(root).load()).document.projects).toHaveLength(succeeded.length);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ code: 'project_index_locked' });
    }
    const guard = path.join(root, 'state', 'project-index', 'write.lock.guard');
    await writeFile(guard, '', 'utf8');
    await expect(createStore(root).updateProject('project-0', { pinned: true }))
      .rejects.toMatchObject({ code: 'project_index_locked' });
    expect(await readFile(guard, 'utf8')).toBe('');
  });
});

function createStore(
  root: string,
  isProcessAlive: (pid: number) => boolean = () => false,
): ProjectIndexStore {
  return new ProjectIndexStore({
    isProcessAlive,
    now: () => new Date('2026-09-01T00:00:00.000Z'),
    randomId: () => 'fixed-token',
    stateDirectory: path.join(root, 'state'),
    vaultPath: path.join(root, 'vault'),
  });
}

async function temporaryRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'dsh-project-index-')));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'vault'), { recursive: true });
  return root;
}
