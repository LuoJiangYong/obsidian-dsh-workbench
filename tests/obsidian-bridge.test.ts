import { EventEmitter } from 'node:events';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  BRIDGE_CAPABILITIES,
  BRIDGE_PROTOCOL_VERSION,
  TARGET_BRIDGE_DSH_VERSION,
  TARGET_BRIDGE_VERSION,
  type BridgeRequest,
} from '../src/bridge-protocol';
import {
  BridgeStdioHost,
  MAX_BRIDGE_FRAME_BYTES,
  ObsidianBridgeServer,
  type BridgeStdioInput,
  type BridgeStdioOutput,
  type BridgeWire,
  type DshAgent,
  type DshAgentHandle,
  type DshApprovalRequest,
  type DshContext,
  type DshMessage,
  type DshScopedContext,
  type DshSession,
  type DshToolExecution,
} from '../src/obsidian-bridge';

const SESSION_ID = 'session-real-bridge';
const TURN_ID = 'turn-real-bridge';

describe('正式 obsidian-bridge', () => {
  it('完成精确握手、绑定 Vault 外 cwd、禁止对话模式全部 DSH 工具并窄投影 DSH session 事件', async () => {
    const harness = await createReadySession();
    expect(harness.context.createdOptions?.meta).toEqual({ cwd: process.cwd() });
    expect(harness.context.scoped.restrictions).toEqual([{ allow: [] }]);
    expect(harness.context.scoped.guards[0]?.(toolExecution('read', { file_path: 'README.md' })))
      .toBe('Obsidian 对话模式不允许调用 DSH 工具。');
    const assembly = await harness.context.scoped.assemble({
      contexts: [],
      sections: [{ name: 'deployment:persona', text: '基础 persona' }],
      tools: [{ name: 'read' }],
      variables: { cwd: process.cwd() },
    });
    expect(assembly.tools).toEqual([]);
    const sections = assembly.sections as unknown[];
    expect(sections[0]).toEqual({ name: 'deployment:persona', text: '基础 persona' });
    expect(sections[1]).toMatchObject({ name: 'obsidian:chat-boundary' });
    expect((sections[1] as { readonly text: string }).text).toContain(
      '不得输出 DSML 或其他工具调用标记',
    );
    await harness.server.receive(turnStartRequest('request-3'));

    expect(harness.agent.messages).toHaveLength(1);
    expect(harness.agent.messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: '你好' }],
      source: { kind: 'user' },
    });
    expect(Object.isFrozen(harness.agent.messages[0])).toBe(true);

    harness.context.emitSession(harness.agent.session, {
      type: 'turn/start', seq: 4, time: 1, data: { turn: 1 },
    });
    harness.context.emitSession(harness.agent.session, {
      type: 'assistant/chunk', seq: 5, time: 2,
      data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: '私有推理' } },
    });
    harness.context.emitSession(harness.agent.session, {
      type: 'assistant/chunk', seq: 6, time: 3,
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '你' } },
    });
    harness.context.emitSession(harness.agent.session, {
      type: 'assistant/message', seq: 7, time: 4,
      data: {
        turn: 1,
        step: 1,
        message: { content: [{ type: 'reasoning', text: '不公开' }, { type: 'text', text: '你好' }] },
      },
    });
    harness.context.emitSession(harness.agent.session, {
      type: 'turn/end', seq: 8, time: 5, data: { turn: 1, reason: { kind: 'completed' } },
    });
    await flushWrites();

    expect(harness.wire.frames.slice(2)).toEqual([
      { type: 'response', id: 'request-3', ok: true, result: { accepted: true } },
      eventFrame('turn.started', 0, {}, 4),
      eventFrame('assistant.delta', 1, { text: '你' }, 6),
      eventFrame('assistant.message', 2, { text: '你好' }, 7),
      eventFrame('turn.ended', 3, { outcome: 'completed' }, 8),
    ]);
  });

  it('turn/cancel 响应后调用 Agent.cancel，且只把上游 user-abort 映射为 cancelled', async () => {
    const harness = await createRunningTurn();
    await harness.server.receive({
      type: 'request', id: 'request-4', method: 'turn/cancel',
      params: { sessionId: SESSION_ID, turnId: TURN_ID },
    });
    expect(harness.agent.cancelCauses).toEqual([{ kind: 'user' }]);

    harness.context.emitSession(harness.agent.session, {
      type: 'turn/end', seq: 2, time: 3,
      data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } },
    });
    await flushWrites();
    expect(lastFrame(harness.wire.frames, 2)).toEqual({
      type: 'response', id: 'request-4', ok: true, result: { accepted: true },
    });
    expect(lastFrame(harness.wire.frames)).toEqual(eventFrame(
      'turn.ended', 1, { outcome: 'cancelled' }, 2,
    ));
  });

  it('任务模式只开放工作区文件工具，并拒绝路径穿越与权限升级', async () => {
    const harness = await createReadySession('task');
    expect(harness.context.scoped.restrictions).toEqual([{
      allow: ['edit', 'glob', 'grep', 'read', 'read_image', 'write'],
    }]);
    const guard = harness.context.scoped.guards[0];
    expect(guard).toBeDefined();
    if (!guard) throw new Error('任务工具 guard 未安装');
    expect(guard(toolExecution('read', { file_path: 'src/main.ts' }))).toBeUndefined();
    expect(guard(toolExecution('grep', { pattern: 'Workbench' }))).toBeUndefined();
    expect(guard(toolExecution('write', {
      file_path: 'src/main.ts',
      content: 'x',
      sandbox_permissions: 'danger-full-access',
    }))).toBe('Obsidian 任务执行模式不允许权限升级。');
    expect(guard(toolExecution('read', { file_path: path.join('..', 'outside.txt') })))
      .toBe('工具路径不得越过当前工作区。');
    expect(guard(toolExecution('read', { file_path: 'node_modules/pkg/index.js' })))
      .toBe('依赖、缓存、构建产物与版本控制目录不属于可编辑工作区。');
    expect(guard(toolExecution('write', { file_path: 'dist', content: 'x' })))
      .toBe('依赖、缓存、构建产物与版本控制目录不属于可编辑工作区。');
    expect(guard(toolExecution('glob', { pattern: '../*.md' })))
      .toBe('glob pattern 不得越过工作区。');
    expect(guard(toolExecution('pwsh', { command: 'Get-ChildItem' })))
      .toBe('Obsidian 任务执行模式只允许工作区文件工具。');

    const assembly = await harness.context.scoped.assemble({
      sections: [],
      tools: [{ name: 'read' }, { name: 'pwsh' }],
    });
    expect(assembly.sections).toEqual([expect.objectContaining({ name: 'obsidian:task-boundary' })]);
    expect((assembly.sections as Array<{ text: string }>)[0]?.text).toContain(
      '不得调用 Shell、PowerShell、网络、Skill、子代理或其他工具',
    );
  });

  it('只接管自有 Agent 的一次性权限请求，并在 resolve 响应后结算', async () => {
    const harness = await createRunningTurn();
    const unrelated = new FakeAgent('unrelated');
    const delegated = vi.fn(() => Promise.resolve<'unavailable'>('unavailable'));
    await expect(harness.context.askApproval({ agent: unrelated, toolName: 'fs-read' }, delegated))
      .resolves.toBe('unavailable');
    expect(delegated).toHaveBeenCalledOnce();

    const decision = harness.context.askApproval({
      agent: harness.agent,
      toolName: 'fs-read',
      callId: 'call-1',
      reason: '读取已明确选择的文件',
    });
    await flushWrites();
    const permission = lastFrame(harness.wire.frames) as {
      payload: { requestId: string };
    };
    expect(permission).toMatchObject({
      type: 'event',
      event: 'permission.requested',
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      seq: 1,
      payload: { toolName: 'fs-read', callId: 'call-1', reason: '读取已明确选择的文件' },
    });

    await harness.server.receive({
      type: 'request', id: 'request-4', method: 'permission/resolve',
      params: {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        requestId: permission.payload.requestId,
        decision: 'allow-once',
      },
    });
    await expect(decision).resolves.toBe('allowed-once');
    expect(lastFrame(harness.wire.frames)).toEqual({
      type: 'response', id: 'request-4', ok: true, result: { accepted: true },
    });

    await harness.server.receive({
      type: 'request', id: 'request-5', method: 'permission/resolve',
      params: {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        requestId: permission.payload.requestId,
        decision: 'reject',
      },
    });
    expect(lastFrame(harness.wire.frames)).toMatchObject({
      type: 'response', id: 'request-5', ok: false,
      error: { code: 'permission_not_found' },
    });
  });

  it('拒绝未知字段，并在正常 shutdown 前释放所有空闲 Agent 再请求 appExit', async () => {
    const harness = await createReadySession();
    await harness.server.receive({ ...turnStartRequest('bad-request'), unexpected: true });
    expect(lastFrame(harness.wire.frames)).toMatchObject({
      type: 'response', id: 'bad-request', ok: false, error: { code: 'invalid_request' },
    });

    await harness.server.receive({
      type: 'request', id: 'request-3', method: 'shutdown', params: {},
    });
    expect(harness.handle.disposed).toBe(true);
    expect(lastFrame(harness.wire.frames)).toEqual({
      type: 'response', id: 'request-3', ok: true, result: { accepted: true },
    });
    expect(harness.context.exitCodes).toEqual([0]);
  });
});

describe('NDJSON stdio framing', () => {
  it('接受分片与连续 frame，stdout 每行只包含一个 JSON frame', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const context = new FakeContext();
    const host = new BridgeStdioHost(input, output);
    const server = new ObsidianBridgeServer(context as unknown as DshContext, host);
    host.bind(server);
    const initialize = `${JSON.stringify(initializeRequest('request-1'))}\n`;
    input.emitData(initialize.slice(0, 19));
    input.emitData(initialize.slice(19));
    await flushWrites();

    expect(output.lines).toHaveLength(1);
    const line = output.lines[0];
    expect(line).toBeDefined();
    if (!line) throw new Error('bridge 没有写出 initialize 响应');
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line) as unknown).toEqual({
      type: 'response', id: 'request-1', ok: true,
      result: {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        bridgeVersion: TARGET_BRIDGE_VERSION,
        dshVersion: TARGET_BRIDGE_DSH_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
      },
    });
  });

  it('超过 1 MiB 或空行时 fail closed，不把输入回显到 stdout', async () => {
    const oversized = createStdioHarness();
    oversized.input.emitData('x'.repeat(MAX_BRIDGE_FRAME_BYTES + 1));
    await flushWrites();
    expect(oversized.output.lines).toEqual([]);
    expect(oversized.input.listenerCount('data')).toBe(0);

    const blank = createStdioHarness();
    blank.input.emitData('\n');
    await flushWrites();
    expect(blank.output.lines).toEqual([]);
    expect(blank.input.listenerCount('data')).toBe(0);
  });
});

class FakeWire implements BridgeWire {
  readonly frames: unknown[] = [];
  closed = false;

  write(frame: unknown): Promise<void> {
    this.frames.push(structuredClone(frame));
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }
}

class FakeScopedContext {
  readonly guards: Array<(execution: DshToolExecution) => string | undefined> = [];
  readonly listeners = new Map<string, unknown[]>();
  readonly restrictions: Array<{
    readonly allow?: readonly string[];
    readonly deny?: readonly string[];
  }> = [];
  readonly tools = {
    guard: (guard: (execution: DshToolExecution) => string | undefined): (() => void) => {
      this.guards.push(guard);
      return () => undefined;
    },
    restrict: (filter: {
      readonly allow?: readonly string[];
      readonly deny?: readonly string[];
    }): (() => void) => {
      this.restrictions.push(filter);
      return () => undefined;
    },
  };

  on(event: string, listener: unknown): () => void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return () => {
      const remaining = (this.listeners.get(event) ?? []).filter(item => item !== listener);
      if (remaining.length === 0) this.listeners.delete(event);
      else this.listeners.set(event, remaining);
    };
  }

  async assemble(assembly: Record<string, unknown>): Promise<Record<string, unknown>> {
    const listeners = (this.listeners.get('system-prompt/assemble') ?? []) as Array<(
      assembly: unknown,
      context: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown>>;
    let index = 0;
    const next = async (): Promise<unknown> => {
      const listener = listeners[index];
      index += 1;
      return listener ? listener(assembly, {}, next) : assembly;
    };
    return await next() as Record<string, unknown>;
  }
}

class FakeAgent implements DshAgent {
  readonly session: DshSession;
  readonly messages: DshMessage[] = [];
  readonly cancelCauses: Array<{ readonly kind: 'user' }> = [];

  constructor(sessionId: string) {
    this.session = { id: sessionId };
  }

  cancel(cause: { readonly kind: 'user' }): void {
    this.cancelCauses.push(cause);
  }

  followup(message: DshMessage): void {
    this.messages.push(message);
  }
}

class FakeHandle implements DshAgentHandle {
  disposed = false;

  constructor(readonly agent: FakeAgent) {}

  dispose(): Promise<void> {
    this.disposed = true;
    return Promise.resolve();
  }
}

class FakeContext {
  readonly agent = new FakeAgent(SESSION_ID);
  readonly handle = new FakeHandle(this.agent);
  readonly scoped = new FakeScopedContext();
  readonly exitCodes: number[] = [];
  createdOptions: {
    readonly agentOptions: { readonly provider: string; readonly model: string };
    readonly meta?: { readonly cwd?: string };
    readonly sessionId: string;
  } | undefined;
  private sessionListener: ((session: DshSession, event: unknown) => void) | undefined;
  private approvalListener: ((
    request: DshApprovalRequest,
    next: () => Promise<'allowed-once' | 'cancelled' | 'rejected' | 'unavailable'>,
  ) => Promise<'allowed-once' | 'cancelled' | 'rejected' | 'unavailable'>) | undefined;

  readonly agents = {
    create: async (options: {
      readonly agentOptions: { readonly provider: string; readonly model: string };
      readonly meta?: { readonly cwd?: string };
      readonly sessionId: string;
      readonly setup: (context: DshScopedContext) => void;
    }): Promise<DshAgentHandle> => {
      expect(options.sessionId).toBe(SESSION_ID);
      this.createdOptions = options;
      options.setup(this.scoped);
      return this.handle;
    },
  };

  readonly agentDefaultModel = {
    currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }),
  };

  effect(_effect: () => () => void | Promise<void>, _label?: string): unknown {
    return undefined;
  }

  get(service: 'appExit' | 'loader'):
    | ((code: number) => void)
    | { await(): Promise<void> }
    | undefined {
    if (service === 'appExit') return (code: number) => { this.exitCodes.push(code); };
    return { await: () => Promise.resolve() };
  }

  on(event: string, listener: unknown): () => void {
    if (event === 'session/event') {
      this.sessionListener = listener as (session: DshSession, value: unknown) => void;
    } else if (event === 'approval/request') {
      this.approvalListener = listener as typeof this.approvalListener;
    }
    return () => undefined;
  }

  emitSession(session: DshSession, event: unknown): void {
    this.sessionListener?.(session, event);
  }

  askApproval(
    request: DshApprovalRequest,
    next: () => Promise<'unavailable'> = () => Promise.resolve('unavailable'),
  ): Promise<'allowed-once' | 'cancelled' | 'rejected' | 'unavailable'> {
    if (!this.approvalListener) throw new Error('approval listener 未注册');
    return this.approvalListener(request, next);
  }
}

class FakeInput extends EventEmitter implements BridgeStdioInput {
  destroy(): void {}

  setEncoding(_encoding: NodeJS.BufferEncoding): void {}

  emitData(chunk: string): void {
    this.emit('data', chunk);
  }
}

class FakeOutput implements BridgeStdioOutput {
  readonly lines: string[] = [];

  write(chunk: string, callback: (error?: Error | null) => void): boolean {
    this.lines.push(chunk);
    callback();
    return true;
  }
}

async function createReadySession(mode: 'chat' | 'task' = 'chat'): Promise<{
  agent: FakeAgent;
  context: FakeContext;
  handle: FakeHandle;
  server: ObsidianBridgeServer;
  wire: FakeWire;
}> {
  const context = new FakeContext();
  const wire = new FakeWire();
  const server = new ObsidianBridgeServer(context as unknown as DshContext, wire);
  await server.receive(initializeRequest('request-1'));
  await server.receive({
    type: 'request', id: 'request-2', method: 'session/create',
    params: { sessionId: SESSION_ID, mode },
  });
  return { agent: context.agent, context, handle: context.handle, server, wire };
}

function toolExecution(name: string, args: unknown): DshToolExecution {
  return { arguments: args, name };
}

async function createRunningTurn(): Promise<Awaited<ReturnType<typeof createReadySession>>> {
  const harness = await createReadySession();
  await harness.server.receive(turnStartRequest('request-3'));
  harness.context.emitSession(harness.agent.session, {
    type: 'turn/start', seq: 1, time: 1, data: { turn: 1 },
  });
  await flushWrites();
  return harness;
}

function initializeRequest(id: string): BridgeRequest {
  return {
    type: 'request', id, method: 'initialize',
    params: {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      client: { name: 'deepseek-harness-workbench', version: '0.1.0' },
      requiredCapabilities: BRIDGE_CAPABILITIES,
    },
  };
}

function turnStartRequest(id: string): BridgeRequest {
  return {
    type: 'request', id, method: 'turn/start',
    params: { sessionId: SESSION_ID, turnId: TURN_ID, text: '你好' },
  };
}

function eventFrame(event: string, seq: number, payload: unknown, sourceSeq?: number) {
  return {
    type: 'event', event, sessionId: SESSION_ID, turnId: TURN_ID, seq,
    ...(sourceSeq === undefined ? {} : { sourceSeq }),
    payload,
  };
}

function createStdioHarness(): { input: FakeInput; output: FakeOutput } {
  const input = new FakeInput();
  const output = new FakeOutput();
  const context = new FakeContext();
  const host = new BridgeStdioHost(input, output);
  const server = new ObsidianBridgeServer(context as unknown as DshContext, host);
  host.bind(server);
  return { input, output };
}

async function flushWrites(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

function lastFrame(frames: readonly unknown[], offset = 1): unknown {
  return frames[frames.length - offset];
}
