import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KnownBridgeEvent } from '../src/bridge-protocol';
import { ManagedBridgeProcess } from '../src/managed-bridge-process';
import { NewTaskConversationController } from '../src/new-task-conversation';
import { TaskIndexStore } from '../src/task-index';
import { TaskRecoveryController } from '../src/task-recovery';
import { TaskNavigationController } from '../src/task-navigation';
import { ProjectIndexStore } from '../src/project-index';

const fixtureRoot = path.join(process.cwd(), 'tests', 'runtime-fixture');
const dshCommand = path.join(
  fixtureRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'dsh.cmd' : 'dsh',
);
const bridgePath = path.join(process.cwd(), 'obsidian-bridge.mjs');
let temporaryRoot = '';

beforeAll(async () => {
  vi.stubGlobal('window', {
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
  });
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'real-dsh-bridge-'));
});

afterAll(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe.runIf(existsSync(dshCommand))('DSH 0.1.2-alpha.3 正式 bridge 运行验收', () => {
  it('N1 从新实例索引导航打开真实原 session 并继续；打开不发模型请求，正常关闭受管进程', async () => {
    const root = path.join(temporaryRoot, 'navigation');
    const stateDirectory = path.join(root, 'state');
    const vaultPath = path.join(root, 'vault');
    await Promise.all([mkdir(stateDirectory, { recursive: true }), mkdir(vaultPath, { recursive: true })]);
    const model = await createModelServer();
    const managers: ManagedBridgeProcess[] = [];
    const createProcess = () => {
      const manager = new ManagedBridgeProcess({
        bridgePath, command: dshCommand, dshHome: path.join(root, 'dsh-home'),
        environment: { ...process.env, DEEPSEEK_API_KEY: 'fixture-key-never-logged', DEEPSEEK_BASE_URL: model.url },
        stateDirectory, vaultPath, workingDirectory: stateDirectory,
        startTimeoutMs: 15_000, requestTimeoutMs: 10_000, shutdownTimeoutMs: 5_000,
      });
      managers.push(manager);
      return manager;
    };
    const tasks = new TaskIndexStore({ stateDirectory, vaultPath });
    const seed = createProcess();
    const controller = new NewTaskConversationController({ createProcess: async () => createProcess(), taskIndex: tasks });
    const recovery = new TaskRecoveryController({ createProcess, store: new TaskIndexStore({ stateDirectory, vaultPath }), stateDirectory });
    const navigation = new TaskNavigationController({ tasks, projects: new ProjectIndexStore({ stateDirectory, vaultPath }), recovery,
      isBusy: () => !['idle', 'completed', 'failed', 'cancelled'].includes(controller.getSnapshot().phase),
      openTask: async task => await controller.openTask(task) });
    try {
      const client = await seed.start();
      await client.createSession({ sessionId: 'n1-original-session', mode: 'chat', title: 'N1 原生标题' });
      await client.closeSession('n1-original-session');
      await expect(seed.shutdown()).resolves.toEqual({ outcome: 'graceful' });
      await tasks.createTask({ taskId: 'n1-original-task', sessionId: 'n1-original-session', mode: 'chat', workspace: null, inputSummary: '原始摘要' });
      await tasks.updateTask('n1-original-task', { state: 'ready' });
      await navigation.refresh();
      expect(navigation.getSnapshot().recent).toMatchObject([
        { taskId: 'n1-original-task', sessionId: 'n1-original-session', displayTitle: 'N1 原生标题', status: 'continuable' },
      ]);
      await expect(navigation.openTask('n1-original-task')).resolves.toBe(true);
      expect(controller.getSnapshot()).toMatchObject({ taskId: 'n1-original-task', restored: true, phase: 'idle', messages: [] });
      expect(model.requests).toEqual([]);
      await expect(controller.submit({ contexts: [], draft: '继续原 session，只回复好', mode: 'chat', reader: { readVaultText: async p => ({ content: '', path: p }) } })).resolves.toBe(true);
      await vi.waitFor(() => expect(controller.getSnapshot().phase).toBe('completed'), { timeout: 10_000 });
      expect(controller.getSnapshot().messages).toMatchObject([{ role: 'user' }, { role: 'assistant', text: '好' }]);
      expect((await tasks.load()).document.tasks.map(task => [task.taskId, task.sessionId])).toEqual([
        ['n1-original-task', 'n1-original-session'],
      ]);
      await controller.dispose();
      for (const manager of managers) await expect(manager.dispose()).resolves.toEqual({ outcome: 'graceful' });
      expect(await readdir(vaultPath)).toEqual([]);
    } finally {
      navigation.dispose();
      recovery.disposeImmediately();
      await controller.dispose();
      await Promise.all(managers.map(manager => manager.dispose()));
      await model.close();
    }
  }, 45_000);

  it('真实加载 artifact，以 Vault 外 cwd 完成回复、原生 DSH 会话落盘、mid-turn cancel、跨进程 session 恢复与零残留', async () => {
    const model = await createModelServer();
    const dshHome = path.join(temporaryRoot, 'dsh-home');
    const stateDirectory = path.join(temporaryRoot, 'plugin-state');
    const workingDirectory = path.join(temporaryRoot, 'workspace');
    const manager = new ManagedBridgeProcess({
      bridgePath,
      command: dshCommand,
      dshHome,
      environment: {
        ...process.env,
        DEEPSEEK_API_KEY: 'fixture-key-never-logged',
        DEEPSEEK_BASE_URL: model.url,
      },
      requestTimeoutMs: 10_000,
      stateDirectory,
      shutdownTimeoutMs: 5_000,
      startTimeoutMs: 15_000,
      vaultPath: path.join(temporaryRoot, 'vault'),
      workingDirectory,
    });

    await Promise.all([
      mkdir(workingDirectory, { recursive: true }),
      mkdir(path.join(temporaryRoot, 'vault'), { recursive: true }),
    ]);
    try {
      const client = await manager.start();
      await client.createSession({ sessionId: 'real-session-1', mode: 'chat', title: '正式 bridge 验收' });
      const firstReply = waitForEvent(client, event => event.event === 'assistant.message');
      const firstTerminal = waitForEvent(client, event => event.event === 'turn.ended');
      await client.startTurn({
        sessionId: 'real-session-1',
        turnId: 'real-turn-1',
        text: '只回复一个字：好',
      });
      await expect(firstReply).resolves.toMatchObject({ payload: { text: '好' } });
      await expect(firstTerminal).resolves.toMatchObject({ payload: { outcome: 'completed' } });
      const chatRequest = model.requests.find(body => body.includes('contexts[].content'));
      expect(chatRequest).toContain('不得输出 DSML 或其他工具调用标记');
      expect(JSON.parse(chatRequest ?? '{}')).not.toHaveProperty('tools');

      const terminal = waitForEvent(client, event => (
        event.event === 'turn.ended' && event.turnId === 'real-turn-2'
      ));
      const started = waitForEvent(client, event => (
        event.event === 'turn.started' && event.turnId === 'real-turn-2'
      ));
      await client.startTurn({
        sessionId: 'real-session-1',
        turnId: 'real-turn-2',
        text: '持续回复，直到我停止',
      });
      await started;
      await client.cancelTurn({ sessionId: 'real-session-1', turnId: 'real-turn-2' });
      await expect(terminal).resolves.toMatchObject({
        event: 'turn.ended',
        payload: { outcome: 'cancelled' },
      });
      await client.closeSession('real-session-1');
      const shutdown = await manager.shutdown();
      expect({ shutdown, failure: client.failure }).toEqual({
        shutdown: { outcome: 'graceful' },
        failure: undefined,
      });
      const restartManager = new ManagedBridgeProcess({
        bridgePath,
        command: dshCommand,
        dshHome,
        environment: {
          ...process.env,
          DEEPSEEK_API_KEY: 'fixture-key-never-logged',
          DEEPSEEK_BASE_URL: model.url,
        },
        requestTimeoutMs: 10_000,
        stateDirectory,
        shutdownTimeoutMs: 5_000,
        startTimeoutMs: 15_000,
        vaultPath: path.join(temporaryRoot, 'vault'),
        workingDirectory,
      });
      try {
        const restoredClient = await restartManager.start();
        await expect(restoredClient.readSessions(['real-session-1', 'missing-session']))
          .resolves.toEqual({ items: [
            expect.objectContaining({
              sessionId: 'real-session-1',
              status: 'available',
              title: '正式 bridge 验收',
            }),
            { sessionId: 'missing-session', status: 'missing' },
          ] });
        await restoredClient.restoreSession({ sessionId: 'real-session-1', mode: 'chat' });
        await restoredClient.closeSession('real-session-1');
        await expect(restartManager.shutdown()).resolves.toEqual({ outcome: 'graceful' });
        expect(restoredClient.failure).toBeUndefined();
      } finally {
        await restartManager.dispose();
      }
      const sessionArtifacts = await readdir(path.join(dshHome, 'sessions'), { recursive: true });
      expect(sessionArtifacts.some((entry) => /session\.jsonl(?:\.zstd)?$/u.test(entry))).toBe(true);
      expect(existsSync(path.join(stateDirectory, 'obsidian-bridge.cordis.patch.yml'))).toBe(true);
      expect(existsSync(path.join(dshHome, 'obsidian-bridge.cordis.patch.yml'))).toBe(false);
    } finally {
      await manager.dispose();
      await model.close();
    }
  }, 30_000);
});

function waitForEvent(
  client: NonNullable<ManagedBridgeProcess['client']>,
  predicate: (event: KnownBridgeEvent) => boolean,
): Promise<KnownBridgeEvent> {
  return new Promise((resolve) => {
    const detach = client.onEvent((event) => {
      if (!predicate(event)) return;
      detach();
      resolve(event);
    });
  });
}

async function createModelServer(): Promise<{
  readonly close: () => Promise<void>;
  readonly requests: string[];
  readonly url: string;
}> {
  let requestCount = 0;
  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { body += chunk; });
    request.on('end', () => {
      requestCount += 1;
      requests.push(body);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"role":"assistant","content":null}}]}\n\n');
      if (requestCount === 1) {
        response.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n');
        response.write('data: [DONE]\n\n');
        response.end();
        return;
      }
      const timer = setInterval(() => {
        response.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n');
      }, 1_000);
      response.on('close', () => clearInterval(timer));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('本地模型服务器没有端口');
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}
