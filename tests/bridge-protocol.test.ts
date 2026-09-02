import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  BRIDGE_CAPABILITIES,
  BRIDGE_PROTOCOL_VERSION,
  TARGET_BRIDGE_DSH_VERSION,
  TARGET_BRIDGE_VERSION,
  type BridgeInitializeResult,
  type BridgeRequest,
} from '../src/bridge-protocol';
import {
  BridgeProtocolClient,
  BridgeRemoteError,
} from '../src/bridge-protocol-client';
import { FakeBridgeTransport } from './fakes/fake-bridge';

const SESSION_ID = 'session-1';
const TURN_ID = 'turn-1';

beforeAll(() => {
  vi.stubGlobal('window', {
    clearTimeout,
    setTimeout,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('bridge 协议 v1 与假 bridge', () => {
  it('完成精确握手并固定 initialize 请求', async () => {
    const { client, initialize, transport } = startClient();
    const request = transport.takeRequest();

    expect(request).toEqual({
      type: 'request',
      id: 'request-1',
      method: 'initialize',
      params: {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        client: {
          name: 'deepseek-harness-workbench',
          version: '0.1.0',
        },
        requiredCapabilities: BRIDGE_CAPABILITIES,
      },
    });

    transport.deliver(okResponse(request, initializeResult()));

    await expect(initialize).resolves.toEqual(initializeResult());
    expect(client.connectionState).toBe('ready');
  });

  it.each([
    ['protocolVersion', { protocolVersion: '2' }],
    ['bridgeVersion', { bridgeVersion: '0.1.0' }],
    ['dshVersion', { dshVersion: '0.1.1-rc.1' }],
    ['capabilities', { capabilities: ['session', 'events', 'cancel', 'shutdown'] }],
  ] as const)('握手 %s 不匹配时 fail closed', async (_field, override) => {
    const { client, initialize, transport } = startClient();
    const request = transport.takeRequest();
    transport.deliver(okResponse(request, initializeResult(override)));

    await expect(initialize).rejects.toMatchObject({ code: 'handshake_mismatch' });
    expect(client.connectionState).toBe('failed');
  });

  it('只读取指定 session，并把公开 session 原身份恢复为可用客户端记录', async () => {
    const ready = await createReadyClient();
    const read = ready.client.readSessions([SESSION_ID, 'session-missing']);
    const readRequest = ready.transport.takeRequest();
    expect(readRequest).toMatchObject({
      method: 'session/read',
      params: { sessionIds: [SESSION_ID, 'session-missing'] },
    });
    ready.transport.deliver(okResponse(readRequest, { items: [
      {
        sessionId: SESSION_ID,
        status: 'available',
        blank: false,
        cwd: process.cwd(),
        running: false,
        title: '持久化标题',
      },
      { sessionId: 'session-missing', status: 'missing' },
    ] }));
    await expect(read).resolves.toMatchObject({
      items: [{ sessionId: SESSION_ID, status: 'available' }, { status: 'missing' }],
    });

    const restore = ready.client.restoreSession({ sessionId: SESSION_ID, mode: 'chat' });
    const restoreRequest = ready.transport.takeRequest();
    expect(restoreRequest).toMatchObject({
      method: 'session/restore',
      params: { sessionId: SESSION_ID, mode: 'chat' },
    });
    ready.transport.deliver(okResponse(restoreRequest, { sessionId: SESSION_ID }));
    await expect(restore).resolves.toEqual({ sessionId: SESSION_ID });
    expect(ready.client.getSession(SESSION_ID)).toMatchObject({ state: 'idle', mode: 'chat' });
  });

  it('session/read 返回未请求或缺失的身份时 fail closed', async () => {
    const ready = await createReadyClient();
    const read = ready.client.readSessions([SESSION_ID]);
    const request = ready.transport.takeRequest();
    ready.transport.deliver(okResponse(request, {
      items: [{ sessionId: 'unrequested', status: 'missing' }],
    }));
    await expect(read).rejects.toMatchObject({ code: 'invalid_result' });
    expect(ready.client.connectionState).toBe('failed');
  });

  it('session/read 拒绝超长原生标题，不把未界定文本带入任务投影', async () => {
    const ready = await createReadyClient();
    const read = ready.client.readSessions([SESSION_ID]);
    const request = ready.transport.takeRequest();
    ready.transport.deliver(okResponse(request, { items: [{
      sessionId: SESSION_ID,
      status: 'available',
      blank: false,
      cwd: process.cwd(),
      running: false,
      title: '甲'.repeat(161),
    }] }));
    await expect(read).rejects.toMatchObject({ code: 'invalid_result' });
    expect(ready.client.connectionState).toBe('failed');
  });

  it('按 session/turn/seq 接收流式事件并建立唯一完成终态', async () => {
    const { client, transport } = await createReadySession();
    const events: unknown[] = [];
    client.onEvent((event) => events.push(event));

    const start = client.startTurn({ sessionId: SESSION_ID, turnId: TURN_ID, text: '你好' });
    const request = transport.takeRequest();
    expect(request).toMatchObject({
      method: 'turn/start',
      params: { sessionId: SESSION_ID, turnId: TURN_ID, text: '你好' },
    });
    transport.deliver(okResponse(request, { accepted: true }));
    await expect(start).resolves.toEqual({ accepted: true });

    transport.deliver(eventFrame('turn.started', 0, {}));
    transport.deliver(eventFrame('assistant.delta', 1, { text: '你' }, 4));
    transport.deliver(eventFrame('assistant.message', 2, { text: '你好' }, 5));
    transport.deliver(eventFrame('turn.ended', 3, { outcome: 'completed' }, 6));

    expect(events).toHaveLength(4);
    expect(client.getSession(SESSION_ID)).toMatchObject({
      state: 'idle',
      lastEventSeq: 3,
      lastTerminal: { turnId: TURN_ID, outcome: 'completed' },
    });
  });

  it('拒绝事件 seq 缺口、重复和未知 required 事件', async () => {
    const gap = await createRunningTurn();
    gap.transport.deliver(eventFrame('assistant.delta', 2, { text: '跳号' }));
    expect(gap.client.connectionState).toBe('failed');
    expect(gap.client.failure).toMatchObject({ code: 'event_sequence' });

    const duplicate = await createRunningTurn();
    duplicate.transport.deliver(eventFrame('assistant.delta', 1, { text: '一' }));
    duplicate.transport.deliver(eventFrame('assistant.delta', 1, { text: '重复' }));
    expect(duplicate.client.failure).toMatchObject({ code: 'event_sequence' });

    const unknown = await createRunningTurn();
    unknown.transport.deliver({
      ...eventFrame('assistant.delta', 1, { text: '一' }),
      event: 'future.required',
    });
    expect(unknown.client.failure).toMatchObject({ code: 'invalid_frame' });

    const sourceRegression = await createRunningTurn();
    sourceRegression.transport.deliver(eventFrame('assistant.delta', 1, { text: '回退' }, 1));
    expect(sourceRegression.client.failure).toMatchObject({ code: 'event_sequence' });

    const unknownField = await createRunningTurn();
    unknownField.transport.deliver({
      ...eventFrame('assistant.delta', 1, { text: '多余字段' }),
      unexpected: true,
    });
    expect(unknownField.client.failure).toMatchObject({ code: 'invalid_frame' });
  });

  it('未知或重复 response id 使连接失败', async () => {
    const unknown = await createReadyClient();
    unknown.transport.deliver({
      type: 'response',
      id: 'request-999',
      ok: true,
      result: { accepted: true },
    });
    expect(unknown.client.failure).toMatchObject({ code: 'unknown_response' });

    const duplicate = await createReadyClient();
    const create = duplicate.client.createSession({ sessionId: SESSION_ID, mode: 'chat', title: '测试任务' });
    const request = duplicate.transport.takeRequest();
    const response = okResponse(request, { sessionId: SESSION_ID });
    duplicate.transport.deliver(response);
    await create;
    duplicate.transport.deliver(response);
    expect(duplicate.client.failure).toMatchObject({ code: 'unknown_response' });
  });

  it('未知 ignorable 事件只推进 seq，不进入产品事件流', async () => {
    const { client, transport } = await createRunningTurn();
    const events: unknown[] = [];
    client.onEvent((event) => events.push(event));

    transport.deliver({
      ...eventFrame('future.informational', 1, { note: 'ignored' }),
      ignorable: true,
    });
    transport.deliver(eventFrame('assistant.delta', 2, { text: '继续' }));

    expect(client.connectionState).toBe('ready');
    expect(client.getSession(SESSION_ID)?.lastEventSeq).toBe(2);
    expect(events).toHaveLength(1);
  });

  it('权限请求只允许当前 session/turn/request 的一次性决定', async () => {
    const { client, transport } = await createRunningTurn();
    transport.deliver(eventFrame('permission.requested', 1, {
      requestId: 'permission-1',
      callId: 'call-1',
      toolName: 'bash',
      reason: '需要访问已选择的工作区',
    }));
    expect(client.getSession(SESSION_ID)?.activeTurn).toMatchObject({
      state: 'awaiting_permission',
      permissionRequestId: 'permission-1',
    });

    const resolve = client.resolvePermission({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      requestId: 'permission-1',
      decision: 'allow-once',
    });
    const request = transport.takeRequest();
    expect(request).toMatchObject({
      method: 'permission/resolve',
      params: { requestId: 'permission-1', decision: 'allow-once' },
    });
    transport.deliver(okResponse(request, { accepted: true }));
    await expect(resolve).resolves.toEqual({ accepted: true });
    expect(client.getSession(SESSION_ID)?.activeTurn?.state).toBe('running');

    await expect(client.resolvePermission({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      requestId: 'permission-1',
      decision: 'reject',
    })).rejects.toMatchObject({ code: 'invalid_state' });

    transport.deliver(eventFrame('permission.requested', 2, {
      requestId: 'permission-1',
      toolName: 'bash',
    }));
    expect(client.failure).toMatchObject({ code: 'invalid_state' });
  });

  it('cancel 响应只表示已接收，只有取消终态才建立 cancelled', async () => {
    const { client, transport } = await createRunningTurn();
    const cancel = client.cancelTurn({ sessionId: SESSION_ID, turnId: TURN_ID });
    expect(client.getSession(SESSION_ID)?.activeTurn?.state).toBe('cancelling');
    const request = transport.takeRequest();
    transport.deliver(okResponse(request, { accepted: true }));
    await expect(cancel).resolves.toEqual({ accepted: true });
    expect(client.getSession(SESSION_ID)?.activeTurn?.state).toBe('cancelling');

    transport.deliver(eventFrame('turn.ended', 1, { outcome: 'cancelled' }, 9));
    expect(client.getSession(SESSION_ID)).toMatchObject({
      state: 'idle',
      lastTerminal: { turnId: TURN_ID, outcome: 'cancelled' },
    });

    transport.deliver(eventFrame('turn.ended', 2, { outcome: 'cancelled' }, 10));
    expect(client.failure).toMatchObject({ code: 'invalid_state' });
  });

  it('没有 cancel 请求时拒绝 cancelled 终态', async () => {
    const { client, transport } = await createRunningTurn();
    transport.deliver(eventFrame('turn.ended', 1, { outcome: 'cancelled' }));
    expect(client.failure).toMatchObject({ code: 'invalid_state' });
  });

  it.each([
    [{ outcome: 'completed' }],
    [{ outcome: 'failed', errorCode: 'runtime_error' }],
  ])('cancel 竞态中允许真实 $outcome 终态，不改写为 cancelled', async (terminalPayload) => {
    const { client, transport } = await createRunningTurn();
    const cancel = client.cancelTurn({ sessionId: SESSION_ID, turnId: TURN_ID });
    const request = transport.takeRequest();
    transport.deliver(okResponse(request, { accepted: true }));
    await cancel;
    transport.deliver(eventFrame('turn.ended', 1, terminalPayload));
    expect(client.getSession(SESSION_ID)?.lastTerminal).toEqual({
      turnId: TURN_ID,
      outcome: terminalPayload.outcome,
    });
  });

  it('远端业务错误拒绝单个请求，但不伪造 session 成功', async () => {
    const { client, transport } = await createReadyClient();
    const create = client.createSession({ sessionId: SESSION_ID, mode: 'chat', title: '测试任务' });
    const request = transport.takeRequest();
    transport.deliver(errorResponse(request, 'session_busy', 'session 已占用'));

    await expect(create).rejects.toBeInstanceOf(BridgeRemoteError);
    expect(client.connectionState).toBe('ready');
    expect(client.getSession(SESSION_ID)).toBeUndefined();
  });

  it('正常 shutdown 必须先收到响应再由 EOF 建立 closed', async () => {
    const { client, transport } = await createReadyClient();
    const shutdown = client.shutdown();
    const request = transport.takeRequest();
    transport.deliver(okResponse(request, { accepted: true }));
    await expect(shutdown).resolves.toEqual({ accepted: true });
    expect(client.connectionState).toBe('closing');

    transport.close();
    expect(client.connectionState).toBe('closed');
  });

  it('意外 EOF 与请求超时都使连接失败且拒绝后续请求', async () => {
    const ready = await createReadyClient();
    ready.transport.close();
    expect(ready.client.failure).toMatchObject({ code: 'unexpected_eof' });
    await expect(ready.client.createSession({ sessionId: SESSION_ID, mode: 'chat', title: '测试任务' }))
      .rejects.toMatchObject({ code: 'connection_unavailable' });

    const timeoutTransport = new FakeBridgeTransport();
    const timeoutClient = new BridgeProtocolClient(timeoutTransport, { requestTimeoutMs: 25 });
    await expect(timeoutClient.initialize()).rejects.toMatchObject({ code: 'request_timeout' });
    expect(timeoutClient.connectionState).toBe('failed');
  });
});

function startClient(requestTimeoutMs = 1_000): {
  client: BridgeProtocolClient;
  initialize: ReturnType<BridgeProtocolClient['initialize']>;
  transport: FakeBridgeTransport;
} {
  const transport = new FakeBridgeTransport();
  const client = new BridgeProtocolClient(transport, { requestTimeoutMs });
  return { client, initialize: client.initialize(), transport };
}

async function createReadyClient(): Promise<{
  client: BridgeProtocolClient;
  transport: FakeBridgeTransport;
}> {
  const { client, initialize, transport } = startClient();
  const request = transport.takeRequest();
  transport.deliver(okResponse(request, initializeResult()));
  await initialize;
  return { client, transport };
}

async function createReadySession(): Promise<{
  client: BridgeProtocolClient;
  transport: FakeBridgeTransport;
}> {
  const ready = await createReadyClient();
  const create = ready.client.createSession({ sessionId: SESSION_ID, mode: 'chat', title: '测试任务' });
  const request = ready.transport.takeRequest();
  ready.transport.deliver(okResponse(request, { sessionId: SESSION_ID }));
  await create;
  return ready;
}

async function createRunningTurn(): Promise<{
  client: BridgeProtocolClient;
  transport: FakeBridgeTransport;
}> {
  const ready = await createReadySession();
  const start = ready.client.startTurn({
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    text: '执行任务',
  });
  const request = ready.transport.takeRequest();
  ready.transport.deliver(okResponse(request, { accepted: true }));
  await start;
  ready.transport.deliver(eventFrame('turn.started', 0, {}, 1));
  return ready;
}

function initializeResult(
  override: Partial<BridgeInitializeResult> = {},
): BridgeInitializeResult {
  return { ...initializeResultBase(), ...override };
}

function initializeResultBase(): BridgeInitializeResult {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    bridgeVersion: TARGET_BRIDGE_VERSION,
    dshVersion: TARGET_BRIDGE_DSH_VERSION,
    capabilities: [...BRIDGE_CAPABILITIES],
  };
}

function okResponse(request: BridgeRequest, result: unknown) {
  return { type: 'response', id: request.id, ok: true, result };
}

function errorResponse(request: BridgeRequest, code: string, message: string) {
  return { type: 'response', id: request.id, ok: false, error: { code, message } };
}

function eventFrame(event: string, seq: number, payload: unknown, sourceSeq?: number) {
  return {
    type: 'event',
    event,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    seq,
    ...(sourceSeq === undefined ? {} : { sourceSeq }),
    payload,
  };
}
