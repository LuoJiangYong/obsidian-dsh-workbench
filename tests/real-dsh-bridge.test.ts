import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KnownBridgeEvent } from '../src/bridge-protocol';
import { ManagedBridgeProcess } from '../src/managed-bridge-process';

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

describe.runIf(existsSync(dshCommand))('DSH 0.1.1-rc.2 正式 bridge 运行验收', () => {
  it('真实加载 artifact，完成握手、Agent session、mid-turn cancel、关闭与零残留', async () => {
    const model = await createSlowModelServer();
    const runtimeHome = path.join(temporaryRoot, 'dsh-home');
    const workingDirectory = path.join(temporaryRoot, 'workspace');
    const manager = new ManagedBridgeProcess({
      bridgePath,
      command: dshCommand,
      environment: {
        ...process.env,
        DEEPSEEK_API_KEY: 'fixture-key-never-logged',
        DEEPSEEK_BASE_URL: model.url,
      },
      requestTimeoutMs: 10_000,
      runtimeHome,
      shutdownTimeoutMs: 5_000,
      startTimeoutMs: 15_000,
      workingDirectory,
    });

    await mkdir(workingDirectory, { recursive: true });
    try {
      const client = await manager.start();
      await client.createSession({ sessionId: 'real-session-1', mode: 'chat' });
      const terminal = waitForEvent(client, event => event.event === 'turn.ended');
      const started = waitForEvent(client, event => event.event === 'turn.started');
      await client.startTurn({
        sessionId: 'real-session-1',
        turnId: 'real-turn-1',
        text: '只回复一个字：好',
      });
      await started;
      await client.cancelTurn({ sessionId: 'real-session-1', turnId: 'real-turn-1' });
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

async function createSlowModelServer(): Promise<{
  readonly close: () => Promise<void>;
  readonly url: string;
}> {
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"role":"assistant","content":null}}]}\n\n');
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
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}
